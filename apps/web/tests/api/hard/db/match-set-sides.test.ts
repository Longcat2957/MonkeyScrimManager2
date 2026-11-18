import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { games, matchSetSides } from '../../../../src/lib/server/db/schema.ts';
import { getMatchOperationContext } from '../../../../src/lib/server/matches/operation-context.ts';
import {
    importMatchRofl,
    revertLastMatchGame,
    setMatchSide
} from '../../../../src/lib/server/matches/service.ts';
import { errorCode } from '../../support/domain-fixtures.ts';
import { createMatchResultFixture, replayBytes } from '../../support/match-fixtures.ts';

test('기존 경기의 미지정 진영은 공개되며 관리자만 최신 세트의 계획을 저장할 수 있다', async (t) => {
    const f = await createMatchResultFixture(t, { bestOf: 1, keepAutomaticLineup: true });
    await f.db.delete(matchSetSides).where(eq(matchSetSides.matchId, f.match.id));
    const view = () => getMatchOperationContext(f.db, null, f.guildId, f.match.id);
    const before = await view();
    const input = { expectedRevision: before.revision, nextGameNumber: 1, blueTeamSlot: 'b' as const };
    const save = (change: Parameters<typeof setMatchSide>[4]) =>
        setMatchSide(f.db, f.manager, f.guildId, f.match.id, change, f.access);
    assert.equal(before.plannedBlueTeamSlot, null);
    assert.equal(before.can.setSide, false);
    await assert.rejects(
        setMatchSide(f.db, null, f.guildId, f.match.id, input, f.access),
        errorCode('UNAUTHENTICATED')
    );
    await assert.rejects(
        setMatchSide(f.db, f.actors[2]!, f.guildId, f.match.id, input, f.access),
        errorCode('FORBIDDEN')
    );
    await assert.rejects(setMatchSide(f.db, f.manager, f.otherGuildId, f.match.id, input, f.access));
    await assert.rejects(save({ ...input, blueTeamSlot: 'red' as 'b' }), errorCode('INVALID_INPUT'));
    await assert.rejects(save({ ...input, nextGameNumber: 0 }), errorCode('INVALID_INPUT'));
    await assert.rejects(save({ ...input, nextGameNumber: 2 }), errorCode('CONFLICT'));
    const scrimRevision = (await f.row()).revision;
    await save(input);
    const after = await view();
    assert.equal(after.plannedBlueTeamSlot, 'b');
    assert.equal(after.revision, before.revision + 1);
    assert.equal((await f.row()).revision, scrimRevision + 1);
    await assert.rejects(save({ ...input, blueTeamSlot: 'a' }), errorCode('CONFLICT'));
    await importMatchRofl(
        f.db,
        f.manager,
        f.guildId,
        f.match.id,
        { ...(await f.slot()), bytes: replayBytes(f.players()) },
        f.dependencies
    );
    const [actual] = await f.db.select().from(games).where(eq(games.matchId, f.match.id));
    assert.equal(actual?.blueTeamSlot, 'a');
    assert.equal((await f.db.select().from(matchSetSides))[0]?.blueTeamSlot, 'b');
    const closed = await getMatchOperationContext(f.db, f.manager, f.guildId, f.match.id);
    assert.equal(closed.can.setSide, false);
    assert.equal(closed.plannedBlueTeamSlot, null);
    await assert.rejects(save({ ...input, expectedRevision: closed.revision }), errorCode('CONFLICT'));
});

test('세트 결과를 되돌리면 해당 계획은 다시 편집할 수 있고 이후 세트의 오래된 배정은 제거된다', async (t) => {
    const f = await createMatchResultFixture(t, { keepAutomaticLineup: true });
    const view = () => getMatchOperationContext(f.db, f.manager, f.guildId, f.match.id);
    const choose = async (gameNumber: number, blueTeamSlot: 'a' | 'b') =>
        setMatchSide(
            f.db,
            f.manager,
            f.guildId,
            f.match.id,
            { expectedRevision: (await f.matchRow()).revision, nextGameNumber: gameNumber, blueTeamSlot },
            f.access
        );
    const bytes = replayBytes(f.players());
    const upload = async () =>
        importMatchRofl(
            f.db,
            f.manager,
            f.guildId,
            f.match.id,
            { ...(await f.slot()), bytes },
            f.dependencies
        );
    await choose(1, 'b');
    const { gameId } = await upload();
    assert.equal((await view()).plannedBlueTeamSlot, null);
    await assert.rejects(choose(1, 'b'), errorCode('CONFLICT'));
    await choose(2, 'a');
    await choose(2, 'b');
    assert.equal((await view()).plannedBlueTeamSlot, 'b');
    await revertLastMatchGame(
        f.db,
        f.manager,
        f.guildId,
        f.match.id,
        { expectedRevision: (await f.matchRow()).revision, gameId, reason: '세트 정정' },
        f.dependencies
    );
    const reopened = await view();
    assert.equal(reopened.nextGameNumber, 1);
    assert.equal(reopened.can.setSide, true);
    assert.equal(reopened.plannedBlueTeamSlot, 'b');
    await choose(1, 'a');
    assert.notEqual((await upload()).gameId, gameId);
    assert.equal((await view()).plannedBlueTeamSlot, null);
});
