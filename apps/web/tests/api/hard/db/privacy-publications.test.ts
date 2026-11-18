import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { type TestContext } from 'node:test';
import { eq } from 'drizzle-orm';
import { setMyPrivacy, withdrawAccount } from '../../../../src/lib/server/accounts/privacy.ts';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import {
    claimPublication,
    completePublication,
    enqueueScrimPublications
} from '../../../../src/lib/server/discord/publications.ts';
import { retryBotPublication } from '../../../../src/lib/server/discord/bot-service.ts';
import { importMatchRofl } from '../../../../src/lib/server/matches/service.ts';
import { createFormationFixture, errorCode } from '../../support/domain-fixtures.ts';
import { createMatchResultFixture, replayBytes } from '../../support/match-fixtures.ts';

const channelId = '991000000000000001';
const otherChannelId = '991000000000000002';
const messageId = '991000000000000010';

async function known(t: TestContext) {
    const f = await createFormationFixture(t);
    await f.db
        .insert(schema.guildDiscordSettings)
        .values({ guildId: f.guildId, recruitmentChannelId: channelId });
    await f.db
        .insert(schema.scrimDiscordMessages)
        .values({ scrimId: f.scrimId, kind: 'recruitment', channelId, messageId });
    return f;
}

test('개인정보 변경은 기존 같은 채널의 공개4종만 수정하고 DM·미게시 과거·다른 참가자의 글은 생성하지 않는다', async (t) => {
    const f = await createMatchResultFixture(t, { bestOf: 1, keepAutomaticLineup: true });
    await importMatchRofl(
        f.db,
        f.manager,
        f.guildId,
        f.match.id,
        { ...(await f.slot()), bytes: replayBytes(f.players()) },
        f.dependencies
    );
    const [lineup] = await f.db.select().from(schema.matchLineups);
    const [game] = await f.db.select().from(schema.games);
    await f.db.insert(schema.guildDiscordSettings).values({
        guildId: f.guildId,
        recruitmentChannelId: channelId,
        entryChannelId: channelId,
        resultChannelId: channelId
    });
    const kinds = ['recruitment', 'entry', 'lineup', 'result'] as const;
    const subjects = ['scrim', 'scrim', lineup!.id, game!.id];
    const ids = kinds.map((_, index) => String(BigInt(messageId) + BigInt(index)));
    await f.db.insert(schema.scrimDiscordMessages).values(
        kinds.map((kind, index) => ({
            scrimId: f.scrimId,
            kind,
            subjectId: subjects[index]!,
            channelId,
            messageId: ids[index]!
        }))
    );
    await f.db.insert(schema.scrimDiscordMessages).values({
        scrimId: f.scrimId,
        kind: 'confirmation_dm',
        subjectId: f.actors[5]!.userId,
        channelId: otherChannelId,
        messageId: String(BigInt(messageId) + 5n)
    });
    const [unpublished, unrelated, moved] = await f.db
        .insert(schema.scrims)
        .values(
            ['미게시 과거', '다른 참가자', '이동된 글'].map((title) => ({
                guildId: f.guildId,
                title,
                status: 'completed' as const,
                formationMethod: 'manual' as const
            }))
        )
        .returning();
    await f.db.insert(schema.scrimParticipants).values([
        { scrimId: unpublished!.id, userId: f.actors[5]!.userId, displayName: '과거 참가' },
        { scrimId: unrelated!.id, userId: f.actors[6]!.userId, displayName: '다른 참가' },
        { scrimId: moved!.id, userId: f.actors[5]!.userId, displayName: '이동 참가' }
    ]);
    await f.db.insert(schema.scrimDiscordMessages).values([
        { scrimId: unrelated!.id, kind: 'recruitment', channelId, messageId: String(BigInt(messageId) + 6n) },
        {
            scrimId: moved!.id,
            kind: 'recruitment',
            channelId: otherChannelId,
            messageId: String(BigInt(messageId) + 7n)
        }
    ]);
    await setMyPrivacy(f.db, f.actors[5]!, { publicProfile: false, publicRiotIds: false });
    const jobs = await f.db.select().from(schema.discordPublicationJobs);
    assert.equal(jobs.length, 4);
    assert.ok(jobs.every((job) => job.scrimId === f.scrimId && ids.includes(job.privacyRefreshMessageId!)));
    await setMyPrivacy(f.db, f.actors[5]!, { publicProfile: false, publicRiotIds: false });
    assert.deepEqual(await f.db.select().from(schema.discordPublicationJobs), jobs);
    const seen = new Set<string>();
    for (let index = 0; index < 4; index++) {
        const [job] = await claimPublication(f.db, 'privacy-edit-worker');
        assert.ok(job);
        assert.equal(job.operation, 'upsert');
        assert.equal(job.channelId, channelId);
        assert.ok(job.messageId && ids.includes(job.messageId));
        assert.notEqual(job.kind, 'confirmation_dm');
        seen.add(job.kind);
        await completePublication(f.db, job.id, {
            leaseToken: job.leaseToken,
            revision: job.revision,
            outcome: 'sent',
            messageId: job.messageId
        });
    }
    assert.deepEqual(seen, new Set(kinds));
    assert.deepEqual(await claimPublication(f.db, 'privacy-edit-worker'), []);
    assert.equal((await f.db.select().from(schema.scrimDiscordMessages)).length, 7);
});

for (const change of ['missing', 'replaced', 'channel'] as const)
    test(`개인정보 수정 예약 뒤 ${change} 변경은 기존 글 부재를 새 과거 글 생성으로 바꾸지 않는다`, async (t) => {
        const f = await known(t);
        await setMyPrivacy(f.db, f.actors[5]!, { publicProfile: false, publicRiotIds: false });
        if (change === 'missing') await f.db.delete(schema.scrimDiscordMessages);
        else if (change === 'replaced')
            await f.db.update(schema.scrimDiscordMessages).set({ messageId: String(BigInt(messageId) + 1n) });
        else await f.db.update(schema.guildDiscordSettings).set({ recruitmentChannelId: otherChannelId });
        assert.deepEqual(await claimPublication(f.db, 'privacy-race-worker'), []);
        const [blocked] = await f.db.select().from(schema.discordPublicationJobs);
        assert.equal(blocked!.status, 'blocked');
        assert.equal(blocked!.errorCode, 'PRIVACY_TARGET_CHANGED');
        assert.equal(blocked!.privacyRefreshMessageId, messageId);
        await assert.rejects(
            retryBotPublication(
                f.db,
                f.guildId,
                blocked!.id,
                {
                    actorId: f.manager.userId,
                    interactionId: '991000000000000090'
                },
                f.access
            ),
            errorCode('INVALID_INPUT')
        );
        // 이후 운영자가 한 정상 업무 변경은 기존 게시 정책으로 다시 처리한다.
        await f.db.transaction((tx) => enqueueScrimPublications(tx, f.scrimId));
        const [normal] = await f.db
            .select()
            .from(schema.discordPublicationJobs)
            .where(eq(schema.discordPublicationJobs.id, blocked!.id));
        assert.equal(normal!.privacyRefreshMessageId, null);
        assert.equal(normal!.status, 'pending');
    });

for (const status of ['processing', 'uncertain'] as const)
    test(`개인정보 수정은 ${status} 작업의 점유·nonce·전달 불명 상태를 덮어쓰지 않는다`, async (t) => {
        const f = await known(t);
        const [before] = await f.db
            .insert(schema.discordPublicationJobs)
            .values({
                scrimId: f.scrimId,
                kind: 'recruitment',
                status,
                revision: 2,
                attempts: 3,
                nonce: 'privacy-preserved-nonce',
                leaseToken: status === 'processing' ? randomUUID() : null,
                leaseUntil: status === 'processing' ? new Date(Date.now() + 90_000) : null,
                leaseRevision: 2,
                leaseChannelId: channelId,
                leaseMessageId: messageId,
                leaseOperation: 'upsert'
            })
            .returning();
        await setMyPrivacy(f.db, f.actors[5]!, { publicProfile: false, publicRiotIds: false });
        const [after] = await f.db.select().from(schema.discordPublicationJobs);
        for (const key of [
            'status',
            'nonce',
            'attempts',
            'leaseToken',
            'leaseUntil',
            'leaseRevision',
            'leaseChannelId',
            'leaseMessageId',
            'leaseOperation'
        ] as const)
            assert.deepEqual(after![key], before![key]);
        assert.equal(after!.revision, 3);
        assert.equal(after!.privacyRefreshMessageId, messageId);
        await assert.rejects(
            retryBotPublication(
                f.db,
                f.guildId,
                after!.id,
                {
                    actorId: f.manager.userId,
                    interactionId: '991000000000000091'
                },
                f.access
            ),
            errorCode(status === 'processing' ? 'CONFLICT' : 'INVALID_INPUT')
        );
        assert.deepEqual(await claimPublication(f.db, 'privacy-overlap-worker'), []);
        if (status === 'processing') {
            await completePublication(f.db, before!.id, {
                leaseToken: before!.leaseToken!,
                revision: 2,
                outcome: 'sent',
                messageId
            });
            const [latest] = await claimPublication(f.db, 'privacy-latest-worker');
            assert.ok(latest);
            assert.equal(latest.revision, 3);
            assert.equal(latest.messageId, messageId);
            assert.equal(latest.operation, 'upsert');
        }
    });

test('게시 수정 예약 실패는 개인정보 설정과 탈퇴의 연결·프로필 정리도 함께 롤백한다', async (t) => {
    const f = await known(t);
    await f.db.update(schema.scrims).set({ status: 'completed' }).where(eq(schema.scrims.id, f.scrimId));
    const before = (
        await f.db.select().from(schema.users).where(eq(schema.users.id, f.actors[5]!.userId))
    )[0]!;
    const links = await f.db.select().from(schema.guildRiotAccounts);
    await f.pool.query(
        'ALTER TABLE discord_publication_jobs ADD CONSTRAINT fixture_privacy_queue_failure CHECK (privacy_refresh_message_id IS NULL)'
    );
    await assert.rejects(setMyPrivacy(f.db, f.actors[5]!, { publicProfile: false, publicRiotIds: false }));
    await assert.rejects(withdrawAccount(f.db, f.actors[5]!, { confirm: true }));
    assert.deepEqual(
        (await f.db.select().from(schema.users).where(eq(schema.users.id, f.actors[5]!.userId)))[0],
        before
    );
    assert.deepEqual(await f.db.select().from(schema.guildRiotAccounts), links);
    assert.equal((await f.db.select().from(schema.discordPublicationJobs)).length, 0);
    assert.equal((await f.db.select().from(schema.scrimDiscordMessages))[0]!.messageId, messageId);
});

test('0012는 기존 게시 작업을 보존하고 개인정보 수정 제약만 추가한다', async (t) => {
    const f = await known(t);
    await f.db
        .insert(schema.discordPublicationJobs)
        .values({ scrimId: f.scrimId, kind: 'recruitment', nonce: 'preserved-before-migration' });
    const before = await f.db.select().from(schema.discordPublicationJobs);
    await f.pool.query('ALTER TABLE discord_publication_jobs DROP COLUMN privacy_refresh_message_id');
    await f.pool.query(f.migrationSql('0012_privacy_publication_refresh'));
    assert.deepEqual(await f.db.select().from(schema.discordPublicationJobs), before);
    await assert.rejects(
        f.db.insert(schema.discordPublicationJobs).values({
            scrimId: f.scrimId,
            kind: 'confirmation_dm',
            subjectId: f.actors[5]!.userId,
            nonce: 'must-not-be-created',
            privacyRefreshMessageId: messageId
        })
    );
    assert.equal((await f.db.select().from(schema.discordPublicationJobs)).length, 1);
});
