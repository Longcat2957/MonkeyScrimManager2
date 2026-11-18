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
import { advanceScrim, reopenFormation } from '../../../../src/lib/server/scrims/workflow.ts';
import { createFormationFixture, concurrently, errorCode } from '../../support/domain-fixtures.ts';

test('2팀 편성 확정은 대진만 준비하고 별도 시작 작업이 BO와 확정 라인업을 적용한다', async (t) => {
    const f = await createFormationFixture(t);
    await f.fill();
    const revision = await f.revision();
    await confirmManualFormation(f.db, f.manager, f.guildId, f.scrimId, { ...revision, bestOf: 5 }, f.access);
    const ready = await f.row();
    assert.equal(ready.status, 'ready');
    assert.ok(ready.bracketConfirmedAt);
    assert.equal(ready.revision, revision.expectedRevision + 1);
    for (const blueTeamId of ['', f.scrimId]) {
        await assert.rejects(
            advanceScrim(
                f.db,
                f.manager,
                f.guildId,
                f.scrimId,
                { expectedRevision: ready.revision, key: 'start', blueTeamIds: { final: blueTeamId } },
                f.access
            ),
            errorCode('INVALID_INPUT')
        );
        assert.equal((await f.row()).status, 'ready');
        assert.equal((await f.db.select().from(schema.matches)).length, 0);
    }
    const ids = await advanceScrim(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        { expectedRevision: ready.revision, key: 'start', blueTeamIds: { final: f.teams[1]!.id } },
        f.access
    );
    const row = await f.row();
    assert.equal(row.status, 'in_progress');
    assert.equal(row.revision, ready.revision + 1);
    assert.ok(row.bracketConfirmedAt);
    const [match] = await f.db.select().from(schema.matches);
    assert.deepEqual(ids, [match!.id]);
    assert.equal(match?.bestOf, 5);
    assert.equal(match?.teamAId, f.teams[0]!.id);
    assert.equal(match?.teamBId, f.teams[1]!.id);
    const [side] = await f.db.select().from(schema.matchSetSides);
    assert.equal(side?.matchId, match!.id);
    assert.equal(side?.gameNumber, 1);
    assert.equal(side?.blueTeamSlot, 'b');
    const [lineup] = await f.db.select().from(schema.matchLineups);
    assert.ok(lineup?.confirmedAt);
    assert.equal(lineup?.matchId, match!.id);
    assert.equal((await f.db.select().from(schema.matchLineupPlayers)).length, 10);
    await assert.rejects(
        reopenFormation(
            f.db,
            f.manager,
            f.guildId,
            f.scrimId,
            { expectedRevision: row.revision, formationMethod: 'manual' },
            f.access
        ),
        errorCode('CONFLICT')
    );
    assert.equal((await f.db.select().from(schema.matches)).length, 1);
});

test('확정한 2팀 대진에서 편성으로 돌아가도 모든 팀과 포지션은 그대로 편집할 수 있다', async (t) => {
    const f = await createFormationFixture(t);
    await f.fill();
    const before = await getManualFormation(f.db, null, f.guildId, f.scrimId);
    await confirmManualFormation(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        { ...(await f.revision()), bestOf: 3 },
        f.access
    );
    const revision = await f.revision();
    await reopenFormation(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        { ...revision, formationMethod: 'manual' },
        f.access
    );
    const row = await f.row();
    assert.equal(row.status, 'preparing');
    assert.equal(row.revision, revision.expectedRevision + 1);
    assert.equal(row.bracketConfirmedAt, null);
    assert.equal(row.bracketConfirmedByUserId, null);
    assert.equal((await f.db.select().from(schema.scrimBracketSlots)).length, 0);
    assert.equal((await f.db.select().from(schema.scrimBracketNodes)).length, 0);
    assert.equal((await f.db.select().from(schema.scrimRounds)).length, 0);
    assert.deepEqual(await getManualFormation(f.db, null, f.guildId, f.scrimId), before);
    await moveManualPlayer(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        { ...(await f.revision()), participantId: f.participants[0]!.id, slot: `${f.teams[1]!.id}:top` },
        f.access
    );
    await confirmManualFormation(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    assert.equal((await f.row()).status, 'ready');
});

test('같은 revision의 경기 시작과 편성 복귀 중 하나만 반영한다', async (t) => {
    const f = await createFormationFixture(t);
    await f.fill();
    await confirmManualFormation(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        { ...(await f.revision()), bestOf: 3 },
        f.access
    );
    const revision = await f.revision();
    const [start, reopen] = await concurrently<unknown>([
        () =>
            advanceScrim(
                f.db,
                f.manager,
                f.guildId,
                f.scrimId,
                { ...revision, key: 'start', blueTeamIds: { final: f.teams[0]!.id } },
                f.access
            ),
        () =>
            reopenFormation(
                f.db,
                f.manager,
                f.guildId,
                f.scrimId,
                { ...revision, formationMethod: 'manual' },
                f.access
            )
    ]);
    assert.notEqual(start!.status, reopen!.status);
    const started = start!.status === 'fulfilled';
    const row = await f.row();
    assert.equal(row.revision, revision.expectedRevision + 1);
    assert.equal(row.status, started ? 'in_progress' : 'preparing');
    assert.equal((await f.db.select().from(schema.matches)).length, started ? 1 : 0);
    assert.equal((await f.db.select().from(schema.scrimRounds)).length, started ? 1 : 0);
});

test('2팀 시작의 라인업 검증 실패는 확정 대진을 유지하고 경기를 남기지 않는다', async (t) => {
    const f = await createFormationFixture(t);
    await f.fill();
    await f.db
        .update(schema.scrimParticipants)
        .set({ userId: null })
        .where(eq(schema.scrimParticipants.id, f.participants[0]!.id));
    await confirmManualFormation(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        { ...(await f.revision()), bestOf: 3 },
        f.access
    );
    const revision = await f.revision();
    await assert.rejects(
        advanceScrim(
            f.db,
            f.manager,
            f.guildId,
            f.scrimId,
            { ...revision, key: 'start', blueTeamIds: { final: f.teams[0]!.id } },
            f.access
        ),
        errorCode('CONFLICT')
    );
    const row = await f.row();
    assert.equal(row.status, 'ready');
    assert.equal(row.revision, revision.expectedRevision);
    assert.ok(row.bracketConfirmedAt);
    assert.equal((await f.db.select().from(schema.scrimRounds)).length, 1);
    assert.equal((await f.db.select().from(schema.scrimBracketNodes)).length, 1);
    assert.equal((await f.db.select().from(schema.matches)).length, 0);
    assert.equal((await f.db.select().from(schema.matchLineups)).length, 0);
});

test('잘못된 BO나 4팀의 단일 경기 시작 요청은 편성을 변경하지 않는다', async (t) => {
    for (const [teamCount, bestOf] of [
        [2, 2],
        [4, 3]
    ] as const) {
        const f = await createFormationFixture(t, teamCount);
        await f.fill();
        await assert.rejects(
            confirmManualFormation(
                f.db,
                f.manager,
                f.guildId,
                f.scrimId,
                { ...(await f.revision()), bestOf },
                f.access
            ),
            errorCode('INVALID_INPUT')
        );
        assert.equal((await f.row()).status, 'preparing');
        assert.equal((await f.db.select().from(schema.scrimBracketNodes)).length, 0);
    }
});

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
