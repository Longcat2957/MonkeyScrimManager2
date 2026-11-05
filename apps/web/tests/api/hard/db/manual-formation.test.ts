import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import {
    confirmManualFormation,
    getManualFormation,
    moveManualPlayer,
    resetManualFormation
} from '../../../../src/lib/server/scrims/manual.ts';
import { createFormationFixture, concurrently, errorCode } from '../../support/domain-fixtures.ts';

test('수동 편성 조회는 참가자 ID를 사용하고 초기 MMR을 조회만으로 생성하지 않는다', async (t) => {
    const f = await createFormationFixture(t);
    const view = await getManualFormation(f.db, null, f.guildId, f.scrimId);
    assert.ok(view);
    assert.deepEqual(view.assignments, {});
    assert.ok(
        view.players.every((player) =>
            f.participants.some((participant) => participant.id === player.participantId)
        )
    );
    assert.ok(
        view.players.every(
            (player) => !f.registrations.some((registration) => registration.id === player.participantId)
        )
    );
    assert.ok(view.players.every((player) => Object.values(player.mmr).every((value) => value === 1500)));
    assert.equal((await f.db.select().from(schema.userPositionMmr)).length, 0);
    await f.db
        .update(schema.scrimParticipants)
        .set({ userId: null })
        .where(eq(schema.scrimParticipants.id, f.participants[0]!.id));
    assert.equal(
        (await getManualFormation(f.db, null, f.guildId, f.scrimId))?.players.find(
            (player) => player.participantId === f.participants[0]!.id
        )?.mmr.top,
        null
    );
    await f.db.update(schema.scrims).set({ mmrSeasonId: null }).where(eq(schema.scrims.id, f.scrimId));
    assert.ok(
        (await getManualFormation(f.db, null, f.guildId, f.scrimId))?.players.every(
            (player) => player.mmr.top === null
        )
    );
});

test('점유한 슬롯으로 이동하면 두 배치를 원자적으로 교환하고 회수·초기화한다', async (t) => {
    const f = await createFormationFixture(t);
    await f.fill();
    const first = f.participants[0]!.id,
        second = f.participants[1]!.id,
        teamId = f.teams[0]!.id;
    await moveManualPlayer(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        { ...(await f.revision()), participantId: first, slot: `${teamId}:jungle` },
        f.access
    );
    const swapped = await getManualFormation(f.db, null, f.guildId, f.scrimId);
    assert.equal(swapped?.assignments[first], `${teamId}:jungle`);
    assert.equal(swapped?.assignments[second], `${teamId}:top`);
    await moveManualPlayer(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        { ...(await f.revision()), participantId: first, slot: null },
        f.access
    );
    assert.equal((await getManualFormation(f.db, null, f.guildId, f.scrimId))?.assignments[first], undefined);
    await resetManualFormation(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    assert.deepEqual((await getManualFormation(f.db, null, f.guildId, f.scrimId))?.assignments, {});
});

for (const invalid of ['participant', 'team'] as const)
    test(`다른 내전의 ${invalid} ID는 배정하지 않고 revision을 유지한다`, async (t) => {
        const f = await createFormationFixture(t);
        const [otherScrim] = await f.db
            .insert(schema.scrims)
            .values({
                guildId: f.guildId,
                title: '다른 편성',
                status: 'preparing',
                formationMethod: 'manual'
            })
            .returning();
        const [otherTeam] = await f.db
            .insert(schema.scrimTeams)
            .values({ scrimId: otherScrim!.id, ordinal: 1, name: '다른 팀' })
            .returning();
        const [otherParticipant] = await f.db
            .insert(schema.scrimParticipants)
            .values({ scrimId: otherScrim!.id, userId: f.users[15]!.id, displayName: '다른 내전 참가자' })
            .returning();
        await f.db
            .insert(schema.scrimParticipantRegistrations)
            .values({ scrimParticipantId: otherParticipant!.id, status: 'selected' });
        const revision = await f.revision();
        await assert.rejects(
            moveManualPlayer(
                f.db,
                f.manager,
                f.guildId,
                f.scrimId,
                {
                    ...revision,
                    participantId: invalid === 'participant' ? otherParticipant!.id : f.participants[0]!.id,
                    slot: `${invalid === 'team' ? otherTeam!.id : f.teams[0]!.id}:top`
                },
                f.access
            ),
            errorCode('NOT_FOUND')
        );
        assert.deepEqual(await f.revision(), revision);
        assert.deepEqual((await getManualFormation(f.db, null, f.guildId, f.scrimId))?.assignments, {});
    });

test('불완전 편성은 확정하지 않고 완성된 편성은 수정 금지와 대진 초안을 저장한다', async (t) => {
    const f = await createFormationFixture(t);
    await assert.rejects(
        confirmManualFormation(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access),
        errorCode('CONFLICT')
    );
    assert.equal((await f.db.select().from(schema.scrimBracketNodes)).length, 0);
    await f.fill();
    await confirmManualFormation(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    assert.equal((await f.row()).status, 'ready');
    assert.equal((await f.db.select().from(schema.scrimBracketNodes)).length, 1);
    await assert.rejects(
        resetManualFormation(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access),
        errorCode('CONFLICT')
    );
});

test('동일 revision으로 같은 슬롯에 두 번 이동하면 한 요청만 반영된다', async (t) => {
    const f = await createFormationFixture(t);
    const revision = await f.revision();
    const results = await concurrently(
        f.participants
            .slice(0, 2)
            .map(
                (participant) => () =>
                    moveManualPlayer(
                        f.db,
                        f.manager,
                        f.guildId,
                        f.scrimId,
                        { ...revision, participantId: participant.id, slot: `${f.teams[0]!.id}:top` },
                        f.access
                    )
            )
    );
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(
        results.filter((result) => result.status === 'rejected' && errorCode('CONFLICT')(result.reason))
            .length,
        1
    );
    assert.equal(
        Object.keys((await getManualFormation(f.db, null, f.guildId, f.scrimId))!.assignments).length,
        1
    );
    assert.equal((await f.row()).revision, revision.expectedRevision + 1);
});

test('편성 조회는 원장과 일치하는 소수 점수를 반올림하지 않는다', async (t) => {
    const f = await createFormationFixture(t);
    const [rating] = await f.db
        .insert(schema.userPositionMmr)
        .values({
            seasonId: f.season.id,
            userId: f.manager.userId,
            position: 'mid',
            mmr: 1500.5,
            revision: 1
        })
        .returning();
    await f.db.insert(schema.mmrLedgerEntries).values({
        seasonId: f.season.id,
        ratingId: rating!.id,
        revision: 1,
        kind: 'adjustment',
        beforeMmr: 1500,
        afterMmr: 1500.5,
        reason: '조회용 소수 점수'
    });
    const player = (await getManualFormation(f.db, null, f.guildId, f.scrimId))?.players.find(
        (entry) => entry.userId === f.manager.userId
    );
    assert.equal(player?.mmr.mid, 1500.5);
    assert.equal(player?.mmr.top, 1500);
    assert.equal((await f.db.select().from(schema.userPositionMmr)).length, 1);
});
