import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { eq, ne } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import {
    claimPublication,
    completePublication,
    enqueueGamePublications,
    getParticipantConfirmationSummary,
    requestParticipantConfirmations
} from '../../../../src/lib/server/discord/publications.ts';
import {
    listFailedPublications,
    retryBotPublication
} from '../../../../src/lib/server/discord/bot-service.ts';
import { createFormationFixture, createGameFixture, errorCode } from '../../support/domain-fixtures.ts';

const channelId = '990000000000000080';
const messageId = '990000000000000090';
let interaction = 990000000000300000n;
const interactionId = () => String(interaction++);

async function singleDm(t: Parameters<typeof createFormationFixture>[0]) {
    const f = await createFormationFixture(t);
    await f.db
        .update(schema.scrimParticipantRegistrations)
        .set({ status: 'standby' })
        .where(ne(schema.scrimParticipantRegistrations.scrimParticipantId, f.participants[0]!.id));
    const request = () =>
        requestParticipantConfirmations(
            f.db,
            f.manager,
            f.guildId,
            f.scrimId,
            { expectedRevision: f.scrim.revision },
            f.access
        );
    await request();
    const [job] = await claimPublication(f.db, 'dm-worker');
    assert.ok(job);
    return { ...f, job, request };
}

test('참가 안내는 명시 요청 전에는 없고 현재 선발된 Discord 사용자만 내전당 한 번 생성한다', async (t) => {
    const f = await createFormationFixture(t);
    assert.deepEqual(await claimPublication(f.db, 'worker'), []);
    await f.db
        .update(schema.scrimParticipants)
        .set({ userId: null })
        .where(eq(schema.scrimParticipants.id, f.participants[0]!.id));
    await f.db
        .update(schema.scrimParticipantRegistrations)
        .set({ status: 'standby' })
        .where(eq(schema.scrimParticipantRegistrations.scrimParticipantId, f.participants[1]!.id));
    const request = () =>
        requestParticipantConfirmations(
            f.db,
            f.manager,
            f.guildId,
            f.scrimId,
            { expectedRevision: f.scrim.revision },
            f.access
        );
    const responses = await Promise.all([request(), request()]);
    assert.equal(
        responses.reduce((sum, row) => sum + row.queued, 0),
        8
    );
    assert.equal(
        responses.reduce((sum, row) => sum + row.alreadyRequested, 0),
        8
    );
    assert.ok(responses.every((row) => row.skipped === 1));
    const jobs = await f.db.select().from(schema.discordPublicationJobs);
    assert.equal(jobs.length, 8);
    assert.ok(jobs.every((job) => job.kind === 'confirmation_dm'));
    assert.equal((await f.row()).revision, f.scrim.revision);
    assert.deepEqual(await getParticipantConfirmationSummary(f.db, f.scrimId), {
        pending: 8,
        sent: 0,
        blocked: 0,
        uncertain: 0
    });
});

test('정정 결과는 같은 세트의 기존 결과 글을 삭제한 뒤에만 새 글을 생성한다', async (t) => {
    const f = await createGameFixture(t);
    await f.db.insert(schema.guildDiscordSettings).values({ guildId: f.guildId, resultChannelId: channelId });
    const old = await f.createGame(f.db, 1);
    await f.db.transaction((tx) => enqueueGamePublications(tx, f.scrimId));
    const [published] = await claimPublication(f.db, 'worker');
    assert.ok(published);
    await completePublication(f.db, published.id, {
        leaseToken: published.leaseToken,
        revision: published.revision,
        outcome: 'sent',
        messageId
    });
    await f.db
        .update(schema.games)
        .set({ status: 'cancelled', winnerSide: null })
        .where(eq(schema.games.id, old.id));
    const replacement = await f.createGame(f.db, 1, f.match.id, 'a', { winnerSide: 'red' });
    await f.db.transaction((tx) => enqueueGamePublications(tx, f.scrimId));
    const now = new Date();
    await f.db
        .update(schema.discordPublicationJobs)
        .set({ nextAttemptAt: new Date(now.getTime() + 60_000) })
        .where(eq(schema.discordPublicationJobs.id, published.id));
    assert.deepEqual(await claimPublication(f.db, 'new-worker', now), []);
    const [waiting] = await f.db
        .select()
        .from(schema.discordPublicationJobs)
        .where(eq(schema.discordPublicationJobs.subjectId, replacement.id));
    assert.equal(waiting?.errorCode, 'PREVIOUS_RESULT_PENDING');
    await f.db
        .update(schema.discordPublicationJobs)
        .set({ nextAttemptAt: now })
        .where(eq(schema.discordPublicationJobs.id, published.id));
    const [remove] = await claimPublication(f.db, 'remove-worker', now);
    assert.ok(remove);
    assert.equal(remove.operation, 'delete');
    assert.equal(remove.messageId, messageId);
    await completePublication(
        f.db,
        remove.id,
        { leaseToken: remove.leaseToken, revision: remove.revision, outcome: 'sent', messageId },
        now
    );
    const [create] = await claimPublication(f.db, 'create-worker', new Date(now.getTime() + 6000));
    assert.ok(create);
    assert.equal(create.subjectId, replacement.id);
    assert.equal(create.messageId, null);
    assert.equal(create.data.match?.winnerSide, 'red');
});

test('참가 안내 요청은 현재 관리자·내전 revision·마감 상태를 검사한다', async (t) => {
    const f = await createFormationFixture(t);
    await assert.rejects(
        requestParticipantConfirmations(
            f.db,
            f.actors[2]!,
            f.guildId,
            f.scrimId,
            await f.revision(),
            f.access
        ),
        errorCode('FORBIDDEN')
    );
    await assert.rejects(
        requestParticipantConfirmations(
            f.db,
            f.manager,
            f.guildId,
            f.scrimId,
            { expectedRevision: 99 },
            f.access
        ),
        errorCode('CONFLICT')
    );
    await f.db.update(schema.scrims).set({ status: 'completed' }).where(eq(schema.scrims.id, f.scrimId));
    await assert.rejects(
        requestParticipantConfirmations(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access),
        errorCode('CONFLICT')
    );
    assert.equal((await f.db.select().from(schema.discordPublicationJobs)).length, 0);
});

test('DM 완료는 실제 채널과 메시지를 저장하며 반복 안내 요청은 재발송하지 않는다', async (t) => {
    const f = await singleDm(t);
    assert.equal(f.job.channelId, null);
    assert.equal(f.job.recipientId, f.participants[0]!.userId);
    const result = {
        leaseToken: f.job.leaseToken,
        revision: f.job.revision,
        outcome: 'sent' as const,
        messageId
    };
    await assert.rejects(completePublication(f.db, f.job.id, result), errorCode('INVALID_INPUT'));
    await completePublication(f.db, f.job.id, { ...result, channelId });
    assert.deepEqual(await f.request(), { queued: 0, alreadyRequested: 1, skipped: 0 });
    assert.deepEqual(await claimPublication(f.db, 'worker-2'), []);
    const [message] = await f.db.select().from(schema.scrimDiscordMessages);
    assert.equal(message?.subjectId, f.job.recipientId);
    assert.equal(message?.channelId, channelId);
    assert.deepEqual(await getParticipantConfirmationSummary(f.db, f.scrimId), {
        pending: 0,
        sent: 1,
        blocked: 0,
        uncertain: 0
    });
});

test('DM 불명 전송은 채널과 대조 근거를 보존하고 다른 작업의 메시지는 복구에 쓰지 않는다', async (t) => {
    const f = await singleDm(t);
    await completePublication(f.db, f.job.id, {
        leaseToken: f.job.leaseToken,
        revision: f.job.revision,
        outcome: 'uncertain',
        channelId,
        errorCode: 'DELIVERY_UNCERTAIN'
    });
    assert.deepEqual(await f.request(), { queued: 0, alreadyRequested: 1, skipped: 0 });
    assert.deepEqual(await claimPublication(f.db, 'worker-2'), []);
    let matching = false;
    const discord = {
        ...f.access.discord,
        getCurrentUserId: async () => '990000000000000099',
        getMessage: async (channel: string, id: string) => ({
            id,
            channelId: channel,
            authorId: '990000000000000099',
            components: [
                {
                    url: `https://monkeybot.test/g/${f.guildId}/scrims/${f.scrimId}?publication=${matching ? f.job.id : randomUUID()}`
                }
            ]
        })
    };
    const retry = () =>
        retryBotPublication(
            f.db,
            f.guildId,
            f.job.id,
            { actorId: f.manager.userId, interactionId: interactionId(), messageId },
            { discord }
        );
    await assert.rejects(retry(), errorCode('CONFLICT'));
    matching = true;
    await retry();
    const [job] = await claimPublication(f.db, 'worker-3');
    assert.equal(job?.channelId, channelId);
    assert.equal(job?.messageId, messageId);
    assert.equal(job?.recipientId, f.job.recipientId);
    assert.equal(job?.kind, 'confirmation_dm');
});

test('채널 정보까지 유실된 DM은 자동 발송하지 않고 수신자의 글 부재 확인 후에만 재생성한다', async (t) => {
    const f = await singleDm(t);
    const future = new Date(Date.now() + 100_000);
    assert.deepEqual(await claimPublication(f.db, 'next-worker', future), []);
    const input = { actorId: f.manager.userId, interactionId: interactionId() };
    await assert.rejects(
        retryBotPublication(f.db, f.guildId, f.job.id, input, f.access),
        errorCode('INVALID_INPUT')
    );
    await retryBotPublication(f.db, f.guildId, f.job.id, { ...input, confirmAbsent: true }, f.access);
    const [next] = await claimPublication(f.db, 'retry-worker', future);
    assert.ok(next);
    assert.notEqual(next.nonce, f.job.nonce);
    assert.equal(next.channelId, null);
    assert.equal(next.messageId, null);
});

test('안내 요청 후 철회·내전 종료된 수신자는 발송 시 다시 제외한다', async (t) => {
    const f = await createFormationFixture(t);
    await requestParticipantConfirmations(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        await f.revision(),
        f.access
    );
    await f.db.update(schema.scrims).set({ status: 'cancelled' }).where(eq(schema.scrims.id, f.scrimId));
    assert.deepEqual(await claimPublication(f.db, 'worker'), []);
    assert.deepEqual(await getParticipantConfirmationSummary(f.db, f.scrimId), {
        pending: 0,
        sent: 0,
        blocked: 10,
        uncertain: 0
    });
    const failed = await listFailedPublications(f.db, f.guildId, f.manager.userId, f.access);
    assert.equal(failed.publications.length, 10);
    assert.ok(
        failed.publications.every(
            (job) =>
                job.kind === 'confirmation_dm' &&
                job.targetLabel?.includes('사용자') &&
                job.errorCode === 'RECIPIENT_INELIGIBLE'
        )
    );
});

test('결과 outbox는 Game별 실제 진영·스냅샷 이름·ROFL 통계와 시리즈 점수를 사용한다', async (t) => {
    const f = await createGameFixture(t);
    await f.db.insert(schema.guildDiscordSettings).values({ guildId: f.guildId, resultChannelId: channelId });
    const first = await f.createGame(f.db, 1, f.match.id, 'b', { winnerSide: 'red' });
    const second = await f.createGame(f.db, 2, f.match.id, 'a', { winnerSide: 'red' });
    await assert.rejects(
        f.db.transaction(async (tx) => {
            await enqueueGamePublications(tx, f.scrimId);
            throw new Error('rollback');
        })
    );
    assert.equal((await f.db.select().from(schema.discordPublicationJobs)).length, 0);
    await f.db.transaction((tx) => enqueueGamePublications(tx, f.scrimId));
    const jobs = await f.db.select().from(schema.discordPublicationJobs);
    assert.deepEqual(new Set(jobs.map((job) => job.subjectId)), new Set([first.id, second.id]));
    for (let i = 0; i < 2; i++) {
        const [job] = await claimPublication(f.db, 'result-worker');
        assert.ok(job);
        assert.equal(job.kind, 'result');
        assert.equal(job.channelId, channelId);
        const match = job.data.match!;
        assert.equal(match.scoreA, 1);
        assert.equal(match.scoreB, 1);
        assert.equal(match.players.length, 10);
        assert.ok(
            match.players.every((player) => player.name.startsWith('당시 이름') && player.champion === 'Ahri')
        );
        if (job.subjectId === first.id) {
            assert.equal(match.blueTeamName, f.teams[1]!.name);
            assert.equal(match.winnerSide, 'red');
            assert.equal(match.players.find((player) => player.name === '당시 이름 0')?.kills, 0);
        }
        await completePublication(f.db, job.id, {
            leaseToken: job.leaseToken,
            revision: job.revision,
            outcome: 'sent',
            messageId: String(BigInt(messageId) + BigInt(i))
        });
    }
    assert.equal((await f.db.select().from(schema.scrimDiscordMessages)).length, 2);
    await f.db
        .update(schema.games)
        .set({ status: 'cancelled', winnerSide: null })
        .where(eq(schema.games.id, first.id));
    await f.db.transaction((tx) => enqueueGamePublications(tx, f.scrimId));
    const next = [];
    for (let i = 0; i < 2; i++) {
        const [job] = await claimPublication(f.db, 'result-worker');
        assert.ok(job);
        next.push(job);
    }
    assert.equal(next.find((job) => job.subjectId === first.id)?.operation, 'delete');
    assert.equal(next.find((job) => job.subjectId === second.id)?.data.match?.scoreA, 0);
});
