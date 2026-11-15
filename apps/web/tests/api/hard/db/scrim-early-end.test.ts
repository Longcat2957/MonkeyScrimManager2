import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { confirmManualFormation } from '../../../../src/lib/server/scrims/manual.ts';
import { getBracket } from '../../../../src/lib/server/scrims/bracket.ts';
import {
    endScrimEarly,
    getScrimOperations,
    revertScrim
} from '../../../../src/lib/server/scrims/workflow.ts';
import { importMatchRofl } from '../../../../src/lib/server/matches/service.ts';
import {
    createFormationFixture,
    createRecruitmentFixture,
    errorCode
} from '../../support/domain-fixtures.ts';
import { createMatchResultFixture, replayBytes, replayPlayer } from '../../support/match-fixtures.ts';

type Fixture = Awaited<ReturnType<typeof createMatchResultFixture>>;
const end = async (f: Fixture) =>
    endScrimEarly(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
const resume = async (f: Fixture) =>
    revertScrim(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);

async function retained(f: Fixture) {
    return Promise.all([
        f.db.select().from(schema.games),
        f.db.select().from(schema.gameParticipants),
        f.db.select().from(schema.gameMmrApplications),
        f.db.select().from(schema.mmrLedgerEntries),
        f.db.select().from(schema.userPositionMmr),
        f.db.select().from(schema.matchLineups),
        f.db.select().from(schema.matchLineupPlayers),
        f.db.select().from(schema.matchRoflImports)
    ]);
}

for (const stage of ['unselected', 'manual', 'auction', 'ready'] as const)
    test(`${stage} 준비 단계 중도 종료와 재개는 원래 단계·편성 자료를 유지한다`, async (t) => {
        const f = await createFormationFixture(t, 2, stage === 'auction' ? 'auction' : 'manual');
        if (stage === 'unselected')
            await f.db
                .update(schema.scrims)
                .set({ formationMethod: null })
                .where(eq(schema.scrims.id, f.scrimId));
        if (stage === 'ready') {
            await f.fill();
            await confirmManualFormation(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
        }
        const before = await f.row();
        const participants = await f.db.select().from(schema.scrimParticipants);
        const nodes = await f.db.select().from(schema.scrimBracketNodes);
        assert.equal(
            (await getScrimOperations(f.db, f.manager, f.guildId, f.scrimId, f.access)).endEarly,
            true
        );
        await endScrimEarly(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
        assert.equal((await f.row()).status, 'ended_early');
        assert.equal((await f.row()).endedEarlyFromStatus, before.status);
        assert.equal((await f.row()).formationMethod, before.formationMethod);
        assert.deepEqual(await f.db.select().from(schema.matches), []);
        assert.deepEqual(await f.db.select().from(schema.games), []);
        assert.deepEqual(await f.db.select().from(schema.mmrLedgerEntries), []);
        await revertScrim(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
        assert.equal((await f.row()).status, before.status);
        assert.equal((await f.row()).endedEarlyFromStatus, null);
        assert.deepEqual(await f.db.select().from(schema.scrimParticipants), participants);
        assert.deepEqual(await f.db.select().from(schema.scrimBracketNodes), nodes);
    });

for (const winners of [[], ['a', 'a'], ['b'], ['a', 'b']] as ('a' | 'b')[][])
    test(`실제 ROFL ${winners.join(',') || '0:0'} 중도 종료는 점수 우세만 판정하고 Game·MMR·출전을 보존한다`, async (t) => {
        const f = await createMatchResultFixture(t, { bestOf: 5, keepAutomaticLineup: true });
        for (const [index, winner] of winners.entries()) {
            const swapped = index % 2 === 1;
            const players = f.players(winner === 'a').map((player) => ({
                ...player,
                TEAM: swapped ? (player.TEAM === '100' ? '200' : '100') : player.TEAM
            }));
            await importMatchRofl(
                f.db,
                f.manager,
                f.guildId,
                f.match.id,
                {
                    ...(await f.slot(index + 1)),
                    blueTeamSlot: swapped ? 'b' : 'a',
                    bytes: replayBytes(players, { gameLengthMs: 1_800_000 + index * 1000 })
                },
                f.dependencies
            );
        }
        const before = await retained(f);
        const matchBefore = await f.matchRow();
        const stale = await f.slot(winners.length + 1);
        await end(f);
        const ended = await f.matchRow();
        const scoreA = winners.filter((winner) => winner === 'a').length;
        const scoreB = winners.length - scoreA;
        assert.equal(ended.status, 'ended_early');
        assert.equal(
            ended.winnerTeamId,
            scoreA > scoreB ? f.match.teamAId : scoreB > scoreA ? f.match.teamBId : null
        );
        assert.deepEqual(await retained(f), before);
        assert.equal((await f.db.select().from(schema.matches)).length, 1);
        await resume(f);
        const after = await f.matchRow();
        assert.equal(after.status, matchBefore.status);
        assert.equal(after.winnerTeamId, matchBefore.winnerTeamId);
        assert.equal(after.endedAt, matchBefore.endedAt);
        assert.equal(after.endReason, matchBefore.endReason);
        assert.equal(after.revision, matchBefore.revision + 2);
        assert.deepEqual(await retained(f), before);
        await assert.rejects(
            importMatchRofl(
                f.db,
                f.manager,
                f.guildId,
                f.match.id,
                { ...stale, bytes: replayBytes(f.players(), { gameLengthMs: 2_200_000 }) },
                f.dependencies
            ),
            errorCode('CONFLICT')
        );
    });

test('준결승의 우세 팀은 결승 진출·우승으로 바꾸지 않고 완료 경기는 보존한다', async (t) => {
    const f = await createMatchResultFixture(t, { teams: 4, keepAutomaticLineup: true });
    const other = f.matches.find((match) => match.id !== f.match.id)!;
    for (const number of [1, 2])
        await importMatchRofl(
            f.db,
            f.manager,
            f.guildId,
            f.match.id,
            {
                ...(await f.slot(number)),
                bytes: replayBytes(f.players(), { gameLengthMs: number * 1_800_000 })
            },
            f.dependencies
        );
    await importMatchRofl(
        f.db,
        f.manager,
        f.guildId,
        other.id,
        { ...(await f.slot(1, other.id)), bytes: replayBytes(f.players(true, 10)) },
        f.dependencies
    );
    const completed = await f.matchRow();
    const before = await retained(f);
    await end(f);
    assert.deepEqual(await f.matchRow(), completed);
    assert.equal((await f.matchRow(other.id)).winnerTeamId, other.teamAId);
    const bracket = (await getBracket(f.db, null, f.guildId, f.scrimId))!;
    const final = bracket.matches.find((match) => match.stage === 'final')!;
    assert.equal(final.matchId, null);
    assert.equal(final.winner, null);
    assert.equal(final.b.teamId, null);
    assert.deepEqual(await retained(f), before);
    await resume(f);
    assert.deepEqual(await f.matchRow(), completed);
    assert.equal((await f.matchRow(other.id)).winnerTeamId, null);
    assert.equal((await f.db.select().from(schema.matches)).length, 2);
});

test('결승의 실제 현재 우세 팀은 중도 종료 승자이며 재개하면 원래 경기로 돌아간다', async (t) => {
    const f = await createMatchResultFixture(t, { teams: 4, keepAutomaticLineup: true });
    const playersForMatch = (match: typeof f.match, winning = true) =>
        [match.teamAId, match.teamBId]
            .flatMap((id) => {
                const index = f.teams.findIndex((team) => team.id === id);
                assert.ok(index >= 0);
                return f.accounts.slice(index * 5, index * 5 + 5);
            })
            .map((account, index) => replayPlayer(account.gameName!, account.tagLine!, index, winning));
    // 조회 순서가 준결승 순서와 다른 경우를 고정한다. 계정은 배열 인덱스 대신 실제 경기의 팀으로 고른다.
    for (const match of [f.matches.find((row) => row.id !== f.match.id)!, f.match])
        for (const number of [1, 2])
            await importMatchRofl(
                f.db,
                f.manager,
                f.guildId,
                match.id,
                {
                    ...(await f.slot(number, match.id)),
                    bytes: replayBytes(playersForMatch(match), { gameLengthMs: number * 1_900_000 })
                },
                f.dependencies
            );
    const final = (await f.db.select().from(schema.matches)).find(
        (match) => !f.matches.some((semi) => semi.id === match.id)
    )!;
    const finalPlayers = playersForMatch(final, false);
    await importMatchRofl(
        f.db,
        f.manager,
        f.guildId,
        final.id,
        { ...(await f.slot(1, final.id)), bytes: replayBytes(finalPlayers, { gameLengthMs: 1_700_000 }) },
        f.dependencies
    );
    const before = await retained(f);
    await end(f);
    assert.equal((await f.matchRow(final.id)).winnerTeamId, final.teamBId);
    assert.equal((await f.db.select().from(schema.matches)).length, 3);
    assert.deepEqual(await retained(f), before);
    await resume(f);
    assert.equal((await f.matchRow(final.id)).status, 'in_progress');
    assert.equal((await f.matchRow(final.id)).winnerTeamId, null);
    assert.deepEqual(await retained(f), before);
});

test('모집·취소·종료 상태와 비관리자의 중도 종료는 거절한다', async (t) => {
    const f = await createRecruitmentFixture(t);
    await assert.rejects(
        endScrimEarly(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access),
        errorCode('CONFLICT')
    );
    await f.db.update(schema.scrims).set({ status: 'preparing' }).where(eq(schema.scrims.id, f.scrimId));
    await assert.rejects(
        endScrimEarly(f.db, f.viewer, f.guildId, f.scrimId, await f.revision(), f.access),
        errorCode('FORBIDDEN')
    );
    await endScrimEarly(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    await assert.rejects(
        endScrimEarly(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access),
        errorCode('CONFLICT')
    );
});
