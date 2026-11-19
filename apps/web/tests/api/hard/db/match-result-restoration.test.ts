import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { asc, eq, isNull } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { importMatchRofl, revertLastMatchGame } from '../../../../src/lib/server/matches/service.ts';
import { previewMatchRofl } from '../../../../src/lib/server/matches/results.ts';
import { createMatchResultFixture, replayBytes } from '../../support/match-fixtures.ts';
import { concurrently, errorCode } from '../../support/domain-fixtures.ts';
import { snapshotTables } from '../../support/database.ts';

type Fixture = Awaited<ReturnType<typeof createMatchResultFixture>>;

async function upload(f: Fixture, bytes: Uint8Array, dependencies = f.dependencies) {
    return importMatchRofl(
        f.db,
        f.manager,
        f.guildId,
        f.match.id,
        { ...(await f.slot()), bytes },
        dependencies
    );
}

async function cancel(f: Fixture, gameId: string, matchId = f.match.id) {
    return revertLastMatchGame(
        f.db,
        f.manager,
        f.guildId,
        matchId,
        { expectedRevision: (await f.matchRow(matchId)).revision, gameId, reason: '동일 파일 복구 검증' },
        f.dependencies
    );
}

const withoutRiot = (f: Fixture) => ({
    ...f.dependencies,
    riot: {
        getAccountByRiotId: async (): Promise<never> => {
            assert.fail('저장된 ROFL을 복구할 때 Riot 계정을 다시 조회하면 안 된다');
        }
    }
});

async function ratings(f: Fixture) {
    return f.db
        .select({
            userId: schema.userPositionMmr.userId,
            position: schema.userPositionMmr.position,
            mmr: schema.userPositionMmr.mmr
        })
        .from(schema.userPositionMmr)
        .orderBy(asc(schema.userPositionMmr.userId), asc(schema.userPositionMmr.position));
}

function snapshot(f: Fixture) {
    return snapshotTables(f.db, [
        schema.games,
        schema.gameParticipants,
        schema.roflMetadata,
        schema.roflParticipants,
        schema.roflGameDataV1,
        schema.roflParticipantDataV1,
        schema.matchRoflImports,
        schema.gameMmrApplications,
        schema.mmrLedgerEntries,
        schema.userPositionMmr,
        schema.matches,
        schema.matchLineups,
        schema.matchLineupPlayers,
        schema.guildRiotAccounts,
        schema.scrimParticipants,
        schema.scrims,
        schema.scrimBracketNodes,
        schema.discordPublicationJobs
    ]);
}

test('취소한 동일 ROFL은 새 revision으로 복구해 기존 자료와 귀속을 재사용하고 결과·MMR·게시를 다시 반영한다', async (t) => {
    const f = await createMatchResultFixture(t, { bestOf: 1, keepAutomaticLineup: true });
    await f.db
        .insert(schema.guildDiscordSettings)
        .values({ guildId: f.guildId, resultChannelId: '990000000000000091' })
        .onConflictDoUpdate({
            target: schema.guildDiscordSettings.guildId,
            set: { resultChannelId: '990000000000000091' }
        });
    const bytes = replayBytes(f.players());
    const original = await upload(f, bytes);
    const metadata = await f.db.select().from(schema.roflMetadata);
    const originalPeople = await f.db
        .select()
        .from(schema.gameParticipants)
        .where(eq(schema.gameParticipants.gameId, original.gameId))
        .orderBy(asc(schema.gameParticipants.roflParticipantIndex));
    const originalRatings = await ratings(f);
    await cancel(f, original.gameId);
    const restored = await upload(f, bytes, withoutRiot(f));
    assert.notEqual(restored.gameId, original.gameId);
    assert.equal(restored.order, 1);
    assert.deepEqual(await f.db.select().from(schema.roflMetadata), metadata);
    assert.deepEqual(
        await f.db
            .select()
            .from(schema.gameParticipants)
            .where(eq(schema.gameParticipants.gameId, original.gameId))
            .orderBy(asc(schema.gameParticipants.roflParticipantIndex)),
        originalPeople
    );
    const games = await f.db.select().from(schema.games);
    assert.equal(games.length, 2);
    assert.equal(games.find((game) => game.id === original.gameId)?.status, 'cancelled');
    assert.equal(games.find((game) => game.id === restored.gameId)?.roflMetadataId, metadata[0]!.id);
    assert.equal(games.find((game) => game.id === restored.gameId)?.status, 'completed');
    assert.equal(games.find((game) => game.id === restored.gameId)?.winnerSide, 'blue');
    const restoredPeople = await f.db
        .select()
        .from(schema.gameParticipants)
        .where(eq(schema.gameParticipants.gameId, restored.gameId))
        .orderBy(asc(schema.gameParticipants.roflParticipantIndex));
    const participantSnapshot = ({
        gameId: _gameId,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        ...record
    }: typeof schema.gameParticipants.$inferSelect) => record;
    assert.deepEqual(restoredPeople.map(participantSnapshot), originalPeople.map(participantSnapshot));
    assert.equal((await f.db.select().from(schema.roflParticipants)).length, 10);
    assert.equal((await f.db.select().from(schema.roflParticipantDataV1)).length, 10);
    assert.equal((await f.db.select().from(schema.gameParticipants)).length, 20);
    const receipts = await f.db.select().from(schema.matchRoflImports);
    assert.equal(receipts.length, 2);
    assert.ok(receipts.find((receipt) => receipt.gameId === original.gameId)?.cancelledAt);
    assert.equal(receipts.find((receipt) => receipt.gameId === restored.gameId)?.cancelledAt, null);
    assert.equal((await f.db.select().from(schema.gameMmrApplications)).length, 2);
    assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 30);
    assert.deepEqual(await ratings(f), originalRatings);
    assert.equal((await f.matchRow()).status, 'completed');
    assert.equal((await f.row()).status, 'completed');
    const resultJobs = await f.db
        .select()
        .from(schema.discordPublicationJobs)
        .where(eq(schema.discordPublicationJobs.kind, 'result'));
    assert.deepEqual(
        new Set(resultJobs.map((job) => job.subjectId)),
        new Set([original.gameId, restored.gameId])
    );
    assert.ok(resultJobs.every((job) => job.status === 'pending'));
});

test('2세트 ROFL을 1세트에서 취소한 뒤 올바른 순서로 등록하면 2:0으로 종료된다', async (t) => {
    const f = await createMatchResultFixture(t, { bestOf: 3, keepAutomaticLineup: true });
    const secondBytes = replayBytes(f.players(), { gameLengthMs: 1_900_000 });
    const mistaken = await upload(f, secondBytes);
    await cancel(f, mistaken.gameId);
    const first = await upload(f, replayBytes(f.players()));
    const input = { ...(await f.slot(2)), bytes: secondBytes };
    const restore = (nextGameNumber: number) =>
        importMatchRofl(f.db, f.manager, f.guildId, f.match.id, { ...input, nextGameNumber }, withoutRiot(f));
    const second = await restore(2);
    assert.equal(second.order, 2);
    assert.deepEqual(await restore(2), second);
    await assert.rejects(restore(1), errorCode('CONFLICT'));
    const match = await f.matchRow();
    assert.equal(match.status, 'completed');
    assert.equal(match.winnerTeamId, match.teamAId);
    const active = await f.db
        .select({ gameId: schema.gameMmrApplications.gameId })
        .from(schema.gameMmrApplications)
        .where(isNull(schema.gameMmrApplications.reversedAt));
    assert.deepEqual(new Set(active.map((row) => row.gameId)), new Set([first.gameId, second.gameId]));
});

test('취소한 동일 파일의 블루 팀을 바꿔 복구하면 기존 귀속과 결과를 변경하지 않는다', async (t) => {
    const f = await createMatchResultFixture(t, { keepAutomaticLineup: true });
    const bytes = replayBytes(f.players());
    const original = await upload(f, bytes);
    await cancel(f, original.gameId);
    const before = await snapshot(f);
    await assert.rejects(
        importMatchRofl(
            f.db,
            f.manager,
            f.guildId,
            f.match.id,
            { ...(await f.slot()), blueTeamSlot: 'b', bytes },
            withoutRiot(f)
        ),
        errorCode('CONFLICT')
    );
    assert.deepEqual(await snapshot(f), before);
});

test('복구 요청의 오래된 revision·다른 경기/라인업·잘못된 다음 세트·출전자 밖 사용자는 기존 기록을 변경하지 못한다', async (t) => {
    const f = await createMatchResultFixture(t, { teams: 4, keepAutomaticLineup: true });
    const originalSlot = await f.slot();
    const bytes = replayBytes(f.players());
    const original = await importMatchRofl(
        f.db,
        f.manager,
        f.guildId,
        f.match.id,
        { ...originalSlot, bytes },
        f.dependencies
    );
    await cancel(f, original.gameId);
    const slot = await f.slot();
    const other = f.matches.find((match) => match.id !== f.match.id)!;
    const otherSlot = await f.slot(1, other.id);
    const before = await snapshot(f);
    for (const input of [
        originalSlot,
        { ...slot, nextGameNumber: 2 },
        { ...slot, lineupId: otherSlot.lineupId },
        { ...slot, lineupId: randomUUID() }
    ]) {
        await assert.rejects(
            importMatchRofl(f.db, f.manager, f.guildId, f.match.id, { ...input, bytes }, withoutRiot(f)),
            errorCode('CONFLICT')
        );
    }
    await assert.rejects(
        importMatchRofl(f.db, f.manager, f.guildId, other.id, { ...otherSlot, bytes }, withoutRiot(f)),
        errorCode('CONFLICT')
    );
    await assert.rejects(
        importMatchRofl(f.db, f.manager, f.otherGuildId, f.match.id, { ...slot, bytes }, withoutRiot(f)),
        errorCode('NOT_FOUND')
    );
    await assert.rejects(
        importMatchRofl(f.db, f.actors[20]!, f.guildId, f.match.id, { ...slot, bytes }, withoutRiot(f)),
        errorCode('FORBIDDEN')
    );
    assert.deepEqual(await snapshot(f), before);
});

test('취소된 결과와 같아도 바이트가 다른 ROFL은 복구로 채택하지 않는다', async (t) => {
    const f = await createMatchResultFixture(t, { keepAutomaticLineup: true });
    const bytes = replayBytes(f.players());
    const original = await upload(f, bytes);
    await cancel(f, original.gameId);
    const slot = await f.slot();
    const before = await snapshot(f);
    for (const changed of [
        replayBytes(f.players(), { bodyByte: 0x43 }),
        replayBytes(f.players().reverse())
    ]) {
        assert.notDeepEqual(changed, bytes);
        await assert.rejects(
            importMatchRofl(
                f.db,
                f.manager,
                f.guildId,
                f.match.id,
                { ...slot, bytes: changed },
                f.dependencies
            ),
            errorCode('CONFLICT')
        );
    }
    assert.deepEqual(await snapshot(f), before);
});

test('같은 복구 요청의 동시 실행과 응답 유실 재전송은 새 Game과 MMR을 한 번만 만든다', async (t) => {
    const f = await createMatchResultFixture(t, { keepAutomaticLineup: true });
    const bytes = replayBytes(f.players());
    const original = await upload(f, bytes);
    await cancel(f, original.gameId);
    const input = { ...(await f.slot()), bytes };
    const before = await snapshot(f);
    const preview = await previewMatchRofl(f.db, f.manager, f.guildId, f.match.id, input, withoutRiot(f));
    assert.equal(preview.players.length, 10);
    assert.ok(preview.players.every((player) => !player.newConnection));
    assert.deepEqual(await snapshot(f), before);
    const restore = () =>
        importMatchRofl(
            f.db,
            f.manager,
            f.guildId,
            f.match.id,
            { ...input, previewDigest: preview.digest },
            withoutRiot(f)
        );
    const results = await concurrently([restore, restore]);
    for (const result of results)
        assert.equal(result.status, 'fulfilled', result.status === 'rejected' ? String(result.reason) : '');
    const first = results[0]!;
    const second = results[1]!;
    assert.ok(first.status === 'fulfilled' && second.status === 'fulfilled');
    assert.deepEqual(first.value, second.value);
    assert.deepEqual(await restore(), first.value);
    assert.equal((await f.db.select().from(schema.games)).length, 2);
    assert.equal((await f.db.select().from(schema.roflMetadata)).length, 1);
    assert.equal((await f.db.select().from(schema.matchRoflImports)).length, 2);
    assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 30);
    assert.equal(
        (
            await f.db
                .select()
                .from(schema.gameMmrApplications)
                .where(isNull(schema.gameMmrApplications.reversedAt))
        ).length,
        1
    );
});

test('복구한 결과를 다시 취소해도 다음 복구는 새 Game을 만들고 모든 과거 이력을 남긴다', async (t) => {
    const f = await createMatchResultFixture(t, { keepAutomaticLineup: true });
    const bytes = replayBytes(f.players());
    const original = await upload(f, bytes);
    const expectedRatings = await ratings(f);
    await cancel(f, original.gameId);
    const firstInput = { ...(await f.slot()), bytes };
    const first = await importMatchRofl(f.db, f.manager, f.guildId, f.match.id, firstInput, withoutRiot(f));
    await cancel(f, first.gameId);
    await assert.rejects(
        importMatchRofl(f.db, f.manager, f.guildId, f.match.id, firstInput, withoutRiot(f)),
        errorCode('CONFLICT')
    );
    const second = await upload(f, bytes, withoutRiot(f));
    assert.equal(new Set([original.gameId, first.gameId, second.gameId]).size, 3);
    const games = await f.db.select().from(schema.games);
    assert.equal(games.length, 3);
    assert.equal(games.filter((game) => game.status === 'cancelled').length, 2);
    assert.equal(games.filter((game) => game.status === 'completed').length, 1);
    assert.equal((await f.db.select().from(schema.roflMetadata)).length, 1);
    assert.equal((await f.db.select().from(schema.gameParticipants)).length, 30);
    assert.equal((await f.db.select().from(schema.matchRoflImports)).length, 3);
    assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 50);
    assert.deepEqual(await ratings(f), expectedRatings);
});

test('복구 중 MMR 저장이 실패하면 기존 취소 이력과 점수·대진·게시 상태를 그대로 남긴다', async (t) => {
    const f = await createMatchResultFixture(t, { bestOf: 1, keepAutomaticLineup: true });
    const bytes = replayBytes(f.players());
    const original = await upload(f, bytes);
    await cancel(f, original.gameId);
    const before = await snapshot(f);
    await f.pool.query(
        "CREATE FUNCTION fail_restoration_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture-restoration-rollback'; END $$"
    );
    await f.pool.query(
        'CREATE TRIGGER fail_restoration_ledger BEFORE INSERT ON mmr_ledger_entries FOR EACH ROW EXECUTE FUNCTION fail_restoration_ledger()'
    );
    await assert.rejects(upload(f, bytes, withoutRiot(f)), (error: unknown) => {
        let cause = error as { cause?: unknown; code?: string; message?: string };
        while (cause.cause) cause = cause.cause as typeof cause;
        return cause.code === 'P0001' && cause.message === 'fixture-restoration-rollback';
    });
    assert.deepEqual(await snapshot(f), before);
});

test('준결승 결과 복구는 이전 결승을 되살리지 않고 승자·확정 포지션으로 새 결승을 만든다', async (t) => {
    const f = await createMatchResultFixture(t, { teams: 4, bestOf: 1, keepAutomaticLineup: true });
    const other = f.matches.find((match) => match.id !== f.match.id)!;
    const bytes = replayBytes(f.players());
    const original = await upload(f, bytes);
    await importMatchRofl(
        f.db,
        f.manager,
        f.guildId,
        other.id,
        {
            ...(await f.slot(1, other.id)),
            bytes: replayBytes(f.players(true, 10), { gameLengthMs: 1_900_000 })
        },
        f.dependencies
    );
    const final = (await f.db.select().from(schema.matches)).find(
        (match) => !f.matches.some((initial) => initial.id === match.id)
    )!;
    assert.ok(final);
    await cancel(f, original.gameId);
    assert.equal((await f.db.select().from(schema.matches).where(eq(schema.matches.id, final.id))).length, 0);
    await upload(f, bytes, withoutRiot(f));
    const restoredFinal = (await f.db.select().from(schema.matches)).find(
        (match) => !f.matches.some((initial) => initial.id === match.id)
    )!;
    assert.ok(restoredFinal);
    assert.notEqual(restoredFinal.id, final.id);
    assert.deepEqual(
        new Set([restoredFinal.teamAId, restoredFinal.teamBId]),
        new Set([f.teams[0]!.id, f.teams[2]!.id])
    );
    const [lineup] = await f.db
        .select()
        .from(schema.matchLineups)
        .where(eq(schema.matchLineups.matchId, restoredFinal.id));
    assert.ok(lineup?.confirmedAt);
    assert.equal(
        (
            await f.db
                .select()
                .from(schema.matchLineupPlayers)
                .where(eq(schema.matchLineupPlayers.lineupId, lineup.id))
        ).length,
        10
    );
    assert.equal((await f.db.select().from(schema.roflMetadata)).length, 2);
    assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 40);
});
