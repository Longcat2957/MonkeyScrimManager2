import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { eq } from 'drizzle-orm';
import type { GameResolvers } from '../../../../src/lib/features/matches/types.ts';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { getMatch } from '../../../../src/lib/server/matches/queries.ts';
import { importMatchRofl, revertLastMatchGame } from '../../../../src/lib/server/matches/service.ts';
import { champion } from '../../support/domain-fixtures.ts';
import { createMatchResultFixture, replayBytes } from '../../support/match-fixtures.ts';

const icon = (id: number | null) => (id === null ? null : { id, name: String(id), iconUrl: null });
const resolvers: GameResolvers = { champion, item: icon, spell: icon, rune: icon, splash: () => null };

async function recordedPair(t: TestContext, hardFearless = true) {
    const f = await createMatchResultFixture(t, { bestOf: 3, keepAutomaticLineup: true });
    if (!hardFearless)
        await f.db
            .update(schema.matches)
            .set({ isHardFearless: false })
            .where(eq(schema.matches.id, f.match.id));
    const first = await importMatchRofl(
        f.db,
        f.manager,
        f.guildId,
        f.match.id,
        { ...(await f.slot(1)), bytes: replayBytes(f.players()) },
        f.dependencies
    );
    const players = f.players(false);
    // 양 팀이 이전 상대의 챔피언을 쓰고, 한 명만 이전에 쓰지 않은 챔피언을 선택한다.
    players[0]!.SKIN = 'Darius';
    players[5]!.SKIN = 'Ahri';
    players[4]!.SKIN = 'Soraka';
    const second = await importMatchRofl(
        f.db,
        f.manager,
        f.guildId,
        f.match.id,
        {
            ...(await f.slot(2)),
            blueTeamSlot: 'b',
            bytes: replayBytes(players, { gameLengthMs: 1_900_000 })
        },
        f.dependencies
    );
    const detail = (gameId: string | null = second.gameId) =>
        getMatch(f.db, null, f.guildId, f.match.id, gameId, resolvers);
    return { ...f, first, second, detail };
}

test('하드 피어리스는 상대 팀의 이전 픽과 진영 변경을 반영하며 결과·MMR 등록을 막지 않는다', async (t) => {
    const f = await recordedPair(t);
    const detail = (await f.detail())!;
    assert.equal(detail.match.status, 'in_progress');
    assert.deepEqual([detail.match.scoreA, detail.match.scoreB], [1, 1]);
    const sideA = detail.game!.sides.find((side) => side.slot === 'a')!;
    const sideB = detail.game!.sides.find((side) => side.slot === 'b')!;
    assert.equal(sideA.side, 'red');
    assert.equal(sideB.side, 'blue');
    const crossA = sideA.players.find((player) => player.champion.id === 'Darius')!;
    const crossB = sideB.players.find((player) => player.champion.id === 'Ahri')!;
    assert.equal(crossA.fearlessViolation, true);
    assert.equal(crossB.fearlessViolation, true);
    assert.equal(sideA.players.find((player) => player.champion.id === 'Soraka')!.fearlessViolation, false);
    assert.equal(detail.game!.mmrStatus, 'applied');
    assert.equal((await f.db.select().from(schema.gameMmrApplications)).length, 2);
    assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 20);
    assert.equal((await f.db.select().from(schema.userPositionMmr)).length, 10);
    assert.equal(detail.usedChampions!.length, 11);
    assert.equal(new Set(detail.usedChampions!.map((value) => value.id)).size, 11);

    const first = (await f.detail(f.first.gameId))!;
    assert.ok(first.game!.sides.flatMap((side) => side.players).every((player) => !player.fearlessViolation));
});

test('결과를 취소하면 해당 세트의 챔피언은 피어리스 안내에서 제외한다', async (t) => {
    const f = await recordedPair(t);
    await revertLastMatchGame(
        f.db,
        f.manager,
        f.guildId,
        f.match.id,
        {
            expectedRevision: (await f.matchRow()).revision,
            gameId: f.second.gameId,
            reason: '피어리스 안내의 취소 결과 제외 확인'
        },
        f.dependencies
    );
    const detail = (await f.detail())!;
    assert.equal(detail.game!.id, f.first.gameId);
    assert.equal(detail.usedChampions!.length, 10);
    assert.ok(detail.usedChampions!.every((value) => value.id !== 'Soraka'));
    assert.ok(
        detail.game!.sides.flatMap((side) => side.players).every((player) => !player.fearlessViolation)
    );
});

test('하드 피어리스를 끈 경기는 같은 챔피언을 다시 써도 경고와 공통 목록을 표시하지 않는다', async (t) => {
    const f = await recordedPair(t, false);
    const detail = (await f.detail())!;
    assert.equal(detail.match.hardFearless, false);
    assert.equal(detail.usedChampions, null);
    assert.ok(
        detail.game!.sides.flatMap((side) => side.players).every((player) => !player.fearlessViolation)
    );
    assert.equal(detail.game!.mmrStatus, 'applied');
});
