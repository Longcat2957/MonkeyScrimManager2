import assert from 'node:assert/strict';
import test from 'node:test';
import { and, eq, isNull } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import {
    confirmMatchLineup,
    importMatchRofl,
    revertLastMatchGame
} from '../../../../src/lib/server/matches/service.ts';
import { lockMmrSeason } from '../../../../src/lib/server/mmr/service.ts';
import { cancelScrim, restoreCancelledScrim } from '../../../../src/lib/server/scrims/service.ts';
import {
    getScrimOperations,
    advanceScrim,
    endScrimEarly
} from '../../../../src/lib/server/scrims/workflow.ts';
import { confirmManualFormation } from '../../../../src/lib/server/scrims/manual.ts';
import {
    confirmBracket,
    placeBracketTeam,
    setBracketBestOf
} from '../../../../src/lib/server/scrims/bracket.ts';
import { getAuction, startAuction } from '../../../../src/lib/server/scrims/auction.ts';
import { concurrently, errorCode } from '../../support/domain-fixtures.ts';
import { createMatchResultFixture, replayBytes, replayPlayer } from '../../support/match-fixtures.ts';

type Fixture = Awaited<ReturnType<typeof createMatchResultFixture>>;
const cancel = async (f: Fixture) =>
    cancelScrim(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
const restore = async (f: Fixture) =>
    restoreCancelledScrim(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
const upload = async (f: Fixture, number = 1, winning = true, matchId = f.match.id, offset = 0) =>
    importMatchRofl(
        f.db,
        f.manager,
        f.guildId,
        matchId,
        {
            ...(await f.slot(number, matchId)),
            bytes: replayBytes(f.players(winning, offset), {
                gameLengthMs: 1_800_000 + number * 1000 + offset
            })
        },
        f.dependencies
    );

async function state(f: Fixture) {
    const tables = [
        'scrims',
        'matches',
        'games',
        'game_mmr_applications',
        'mmr_ledger_entries',
        'user_position_mmr',
        'match_rofl_imports',
        'scrim_cancellations',
        'match_lineups',
        'scrim_rounds',
        'scrim_bracket_nodes',
        'scrim_bracket_slots'
    ];
    const result: Record<string, unknown[]> = {};
    for (const name of tables)
        result[name] = (await f.pool.query(`SELECT * FROM ${name} ORDER BY to_jsonb(${name})::text`)).rows;
    return result;
}

async function restartManual(f: Fixture) {
    await confirmManualFormation(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    for (const [index, team] of f.teams.entries())
        await placeBracketTeam(
            f.db,
            f.manager,
            f.guildId,
            f.scrimId,
            { ...(await f.revision()), seat: index === 0 ? 'final-a' : 'final-b', teamId: team.id },
            f.access
        );
    await setBracketBestOf(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        { ...(await f.revision()), stage: 'final', bestOf: 3 },
        f.access
    );
    await confirmBracket(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    await advanceScrim(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        { ...(await f.revision()), key: 'start' },
        f.access
    );
    return (
        await f.db
            .select()
            .from(schema.matches)
            .where(and(eq(schema.matches.scrimId, f.scrimId), isNull(schema.matches.cancellationBatchId)))
    )[0]!;
}

test('진행 중 전체 취소는 실제 결과·MMR을 함께 역분개하고 복구는 편성 준비로만 돌아간다', async (t) => {
    const f = await createMatchResultFixture(t, { keepAutomaticLineup: true });
    await upload(f);
    const participants = await f.db.select().from(schema.scrimParticipants);
    const lineupPlayers = await f.db.select().from(schema.matchLineupPlayers);
    const before = await f.row();
    assert.equal(
        (await getScrimOperations(f.db, f.manager, f.guildId, f.scrimId, f.access)).cancelGameCount,
        1
    );
    const publicOperations = await getScrimOperations(f.db, null, f.guildId, f.scrimId, f.access);
    assert.equal(publicOperations.cancelGameCount, null);
    assert.equal(publicOperations.cancelledGameCount, null);
    await cancel(f);
    const [batch] = await f.db.select().from(schema.scrimCancellations);
    assert.equal(batch!.reversedGameCount, 1);
    assert.equal(batch!.context.matches.length, 1);
    assert.equal(batch!.context.bracket.nodes.length, 1);
    assert.equal((await f.row()).status, 'cancelled');
    assert.ok(
        (await f.db.select().from(schema.games)).every(
            (game) => game.status === 'cancelled' && game.winnerSide === null
        )
    );
    assert.ok(
        (await f.db.select().from(schema.gameMmrApplications)).every((application) => application.reversedAt)
    );
    assert.equal(
        (await f.db.select().from(schema.mmrLedgerEntries)).filter((entry) => entry.kind === 'game_reversal')
            .length,
        10
    );
    assert.ok((await f.db.select().from(schema.userPositionMmr)).every((rating) => rating.mmr === 1500));
    assert.ok(
        (await f.db.select().from(schema.matches)).every(
            (match) => match.cancellationBatchId === batch!.id && match.status === 'cancelled'
        )
    );
    assert.equal((await f.db.select().from(schema.matchRoflImports)).length, 1);
    assert.ok((await f.db.select().from(schema.matchRoflImports))[0]!.cancelledAt);
    assert.equal((await f.db.select().from(schema.gameParticipants)).length, 10);
    assert.deepEqual(await f.db.select().from(schema.matchLineupPlayers), lineupPlayers);
    assert.deepEqual(await f.db.select().from(schema.scrimParticipants), participants);
    const operations = await getScrimOperations(f.db, f.manager, f.guildId, f.scrimId, f.access);
    assert.equal(operations.cancelledGameCount, 1);
    assert.equal(operations.restore?.blockedReason, null);
    assert.match(operations.restore!.message, /다시 적용하지/);
    await restore(f);
    assert.equal((await f.row()).status, 'preparing');
    assert.equal((await f.row()).mmrSeasonId, before.mmrSeasonId);
    assert.ok((await f.db.select().from(schema.scrimCancellations))[0]!.restoredAt);
    const newMatch = await restartManual(f);
    assert.notEqual(newMatch.id, f.match.id);
    await assert.rejects(upload(f, 1, true, newMatch.id), errorCode('CONFLICT'));
    await importMatchRofl(
        f.db,
        f.manager,
        f.guildId,
        newMatch.id,
        { ...(await f.slot(1, newMatch.id)), bytes: replayBytes(f.players(), { gameLengthMs: 1_999_000 }) },
        f.dependencies
    );
    assert.equal((await f.db.select().from(schema.matchRoflImports)).length, 2);
    assert.equal(
        (
            await f.db
                .select()
                .from(schema.gameMmrApplications)
                .where(isNull(schema.gameMmrApplications.reversedAt))
        ).length,
        1
    );
    assert.equal((await f.matchRow()).status, 'cancelled');
    await cancel(f);
    assert.equal((await f.db.select().from(schema.scrimCancellations)).length, 2);
    await restore(f);
    await cancel(f);
    await restore(f);
    assert.equal((await f.row()).status, 'preparing');
    assert.equal((await f.db.select().from(schema.matchRoflImports)).length, 2);
});

test('준결승 두 경기와 생성된 결승은 후속 대진·원장 순서로 함께 취소하며 원본 라인업을 보존한다', async (t) => {
    const f = await createMatchResultFixture(t, { teams: 4, bestOf: 3, keepAutomaticLineup: true });
    const other = f.matches.find((match) => match.id !== f.match.id)!;
    await upload(f);
    await upload(f, 2);
    await upload(f, 1, true, other.id, 10);
    await upload(f, 2, true, other.id, 10);
    const final = (await f.db.select().from(schema.matches)).find(
        (match) => !f.matches.some((initial) => initial.id === match.id)
    )!;
    const people = [...f.accounts.slice(0, 5), ...f.accounts.slice(10, 15)];
    await importMatchRofl(
        f.db,
        f.manager,
        f.guildId,
        final.id,
        {
            ...(await f.slot(1, final.id)),
            bytes: replayBytes(
                people.map((person, index) => replayPlayer(person.gameName!, person.tagLine!, index)),
                { gameLengthMs: 1_900_000 }
            )
        },
        f.dependencies
    );
    const lineupPlayers = await f.db.select().from(schema.matchLineupPlayers);
    await cancel(f);
    assert.equal((await f.db.select().from(schema.matches)).length, 3);
    assert.deepEqual(await f.db.select().from(schema.matchLineupPlayers), lineupPlayers);
    assert.equal(
        (await f.db.select().from(schema.mmrLedgerEntries)).filter((entry) => entry.kind === 'game_reversal')
            .length,
        50
    );
    assert.ok((await f.db.select().from(schema.userPositionMmr)).every((rating) => rating.mmr === 1500));
    assert.equal((await f.db.select().from(schema.scrimCancellations))[0]!.context.bracket.nodes.length, 3);
    assert.equal((await f.db.select().from(schema.scrimBracketNodes)).length, 0);
});

test('진행 중 경매 내전의 취소 복구는 팀장·시작 포인트만 재사용하고 영입·현재 대진은 재개하지 않는다', async (t) => {
    const f = await createMatchResultFixture(t, { method: 'auction' });
    await f.confirm();
    await upload(f);
    const teams = await f.db.select().from(schema.auctionTeams);
    await cancel(f);
    assert.deepEqual(await f.db.select().from(schema.auctionTeams), teams);
    assert.ok((await f.db.select().from(schema.auctionAcquisitions)).every((row) => row.voidedAt));
    assert.ok((await f.db.select().from(schema.auctionLots)).every((row) => row.voidedAt));
    assert.ok(
        (await f.db.select().from(schema.scrimParticipants)).every(
            (person) => person.teamId === null && person.position === null
        )
    );
    await restore(f);
    const view = (await getAuction(f.db, f.manager, f.guildId, f.scrimId, f.access))!;
    assert.equal(view.status, 'setup');
    assert.deepEqual(
        view.teams.map((team) => [team.captainId, team.startPoints]),
        teams.map((team) => [team.captainParticipantId, team.initialPoints])
    );
    assert.ok(view.teams.every((team) => team.remainingPoints === team.startPoints));
    await startAuction(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    assert.equal((await getAuction(f.db, f.manager, f.guildId, f.scrimId, f.access))!.status, 'in_progress');
    assert.equal((await f.matchRow()).status, 'cancelled');
});

test('두 세트 사이 점수가 같은 관리 보정도 전체 취소를 막고 먼저 되돌린 최신 세트까지 롤백한다', async (t) => {
    const f = await createMatchResultFixture(t, { bestOf: 5, keepAutomaticLineup: true });
    await upload(f);
    const [rating] = await f.db.select().from(schema.userPositionMmr);
    await f.db.transaction(async (tx) => {
        await lockMmrSeason(tx, f.guildId, f.season.id);
        await tx.insert(schema.mmrLedgerEntries).values({
            seasonId: f.season.id,
            ratingId: rating!.id,
            revision: rating!.revision + 1,
            kind: 'adjustment',
            beforeMmr: rating!.mmr,
            afterMmr: rating!.mmr,
            reason: '점수 동일 관리 보정'
        });
        await tx
            .update(schema.userPositionMmr)
            .set({ revision: rating!.revision + 1 })
            .where(eq(schema.userPositionMmr.id, rating!.id));
    });
    await upload(f, 2, false);
    const before = await state(f);
    await assert.rejects(cancel(f), errorCode('CONFLICT'));
    assert.deepEqual(await state(f), before);
});

test('같은 사용자들의 다른 내전 후속 결과는 넘지 않으며 최신 자체 세트 역분개도 함께 롤백한다', async (t) => {
    const f = await createMatchResultFixture(t, { bestOf: 5, keepAutomaticLineup: true });
    await upload(f);
    const [otherScrim] = await f.db
        .insert(schema.scrims)
        .values({
            guildId: f.guildId,
            mmrSeasonId: f.season.id,
            title: '별도 후속 내전',
            formationMethod: 'manual',
            status: 'in_progress'
        })
        .returning();
    const teams = await f.db
        .insert(schema.scrimTeams)
        .values([1, 2].map((ordinal) => ({ scrimId: otherScrim!.id, ordinal, name: ordinal + '팀' })))
        .returning();
    const participants = await f.db
        .insert(schema.scrimParticipants)
        .values(
            (
                await f.db
                    .select()
                    .from(schema.scrimParticipants)
                    .where(eq(schema.scrimParticipants.scrimId, f.scrimId))
            ).map((person, index) => ({
                scrimId: otherScrim!.id,
                userId: person.userId,
                displayName: person.displayName,
                riotAccountId: person.riotAccountId,
                position: person.position,
                teamId: teams[Math.floor(index / 5)]!.id
            }))
        )
        .returning();
    await f.db
        .insert(schema.scrimParticipantRegistrations)
        .values(
            participants.map((person) => ({ scrimParticipantId: person.id, status: 'selected' as const }))
        );
    const [match] = await f.db
        .insert(schema.matches)
        .values({
            scrimId: otherScrim!.id,
            teamAId: teams[0]!.id,
            teamBId: teams[1]!.id,
            bestOf: 5,
            isHardFearless: true,
            status: 'in_progress'
        })
        .returning();
    await confirmMatchLineup(
        f.db,
        f.manager,
        f.guildId,
        match!.id,
        {
            expectedRevision: 0,
            players: participants.map((person) => ({ participantId: person.id, position: person.position! }))
        },
        f.dependencies
    );
    const [lineup] = await f.db
        .select()
        .from(schema.matchLineups)
        .where(eq(schema.matchLineups.matchId, match!.id));
    const [current] = await f.db.select().from(schema.matches).where(eq(schema.matches.id, match!.id));
    await importMatchRofl(
        f.db,
        f.manager,
        f.guildId,
        match!.id,
        {
            expectedRevision: current!.revision,
            lineupId: lineup!.id,
            nextGameNumber: 1,
            blueTeamSlot: 'a',
            blueTeamConfirmed: true,
            bytes: replayBytes(f.players(false), { gameLengthMs: 2_300_000 })
        },
        f.dependencies
    );
    await upload(f, 2, false);
    const before = await state(f);
    await assert.rejects(cancel(f), errorCode('CONFLICT'));
    assert.deepEqual(await state(f), before);
});

test('등록 영수증을 확인할 수 없는 완료 결과는 추정 취소하지 않는다', async (t) => {
    const f = await createMatchResultFixture(t, { keepAutomaticLineup: true });
    await upload(f);
    await f.db.delete(schema.matchRoflImports);
    const before = await state(f);
    await assert.rejects(cancel(f), errorCode('CONFLICT'));
    assert.deepEqual(await state(f), before);
});

test('전체 취소 뒤 경매 상태가 달라지면 원본과 점수를 덮어쓰지 않고 복구를 막는다', async (t) => {
    const f = await createMatchResultFixture(t, { method: 'auction' });
    await f.confirm();
    await upload(f);
    await cancel(f);
    await f.db.update(schema.auctions).set({ status: 'setup' }).where(eq(schema.auctions.scrimId, f.scrimId));
    const before = await state(f);
    assert.match(
        (await getScrimOperations(f.db, f.manager, f.guildId, f.scrimId, f.access)).restore?.blockedReason ??
            '',
        /경매 상태/
    );
    await assert.rejects(restore(f), errorCode('CONFLICT'));
    assert.deepEqual(await state(f), before);
});

test('결과가 없는 진행 내전도 취소 이력을 남기고 기존 Match를 재사용하지 않는다', async (t) => {
    const f = await createMatchResultFixture(t, { keepAutomaticLineup: true });
    assert.equal(
        (await getScrimOperations(f.db, f.manager, f.guildId, f.scrimId, f.access)).cancelGameCount,
        0
    );
    await cancel(f);
    assert.equal((await f.db.select().from(schema.scrimCancellations))[0]!.reversedGameCount, 0);
    await restore(f);
    const current = await restartManual(f);
    assert.notEqual(current.id, f.match.id);
    assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 0);
});

test('전체 취소는 권한·서버·revision을 검사하고 같은 요청이 겹쳐도 한 번만 반영한다', async (t) => {
    const f = await createMatchResultFixture(t, { keepAutomaticLineup: true });
    await upload(f);
    const revision = await f.revision();
    await assert.rejects(
        cancelScrim(f.db, null, f.guildId, f.scrimId, revision, f.access),
        errorCode('UNAUTHENTICATED')
    );
    await assert.rejects(
        cancelScrim(f.db, f.actors[2]!, f.guildId, f.scrimId, revision, f.access),
        errorCode('FORBIDDEN')
    );
    await assert.rejects(cancelScrim(f.db, f.manager, f.otherGuildId, f.scrimId, revision, f.access));
    await assert.rejects(
        cancelScrim(
            f.db,
            f.manager,
            f.guildId,
            f.scrimId,
            { expectedRevision: revision.expectedRevision - 1 },
            f.access
        ),
        errorCode('CONFLICT')
    );
    const outcomes = await concurrently([
        () => cancelScrim(f.db, f.manager, f.guildId, f.scrimId, revision, f.access),
        () => cancelScrim(f.db, f.manager, f.guildId, f.scrimId, revision, f.access)
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
    assert.equal((await f.db.select().from(schema.scrimCancellations)).length, 1);
    assert.equal(
        (await f.db.select().from(schema.mmrLedgerEntries)).filter((entry) => entry.kind === 'game_reversal')
            .length,
        10
    );
    const publicOperations = await getScrimOperations(f.db, null, f.guildId, f.scrimId, f.access);
    assert.equal(publicOperations.cancelledGameCount, null);
});

test('게시 예약 실패는 결과·원장·배치·대진 분리를 모두 롤백한다', async (t) => {
    const f = await createMatchResultFixture(t, { keepAutomaticLineup: true });
    await upload(f);
    await f.db
        .insert(schema.guildDiscordSettings)
        .values({ guildId: f.guildId, recruitmentChannelId: '900' });
    await f.db
        .insert(schema.discordPublicationJobs)
        .values({ scrimId: f.scrimId, kind: 'recruitment', nonce: 'fixture-full-cancel' });
    const before = await state(f);
    await f.pool.query(
        `CREATE FUNCTION reject_full_cancel() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '검증용 예약 실패'; END $$; CREATE TRIGGER reject_full_cancel BEFORE INSERT OR UPDATE ON discord_publication_jobs FOR EACH ROW EXECUTE FUNCTION reject_full_cancel();`
    );
    await assert.rejects(cancel(f));
    assert.deepEqual(await state(f), before);
});

test('한 세트 정정 이력은 다시 역분개하지 않고 현재 완료 결과만 전체 취소한다', async (t) => {
    const f = await createMatchResultFixture(t, { keepAutomaticLineup: true });
    const first = await upload(f);
    await revertLastMatchGame(
        f.db,
        f.manager,
        f.guildId,
        f.match.id,
        {
            expectedRevision: (await f.matchRow()).revision,
            gameId: first.gameId,
            reason: '잘못 등록한 세트 정정'
        },
        f.dependencies
    );
    await importMatchRofl(
        f.db,
        f.manager,
        f.guildId,
        f.match.id,
        { ...(await f.slot()), bytes: replayBytes(f.players(false), { gameLengthMs: 1_970_000 }) },
        f.dependencies
    );
    await cancel(f);
    assert.equal((await f.db.select().from(schema.scrimCancellations))[0]!.reversedGameCount, 1);
    assert.equal(
        (await f.db.select().from(schema.mmrLedgerEntries)).filter((entry) => entry.kind === 'game_reversal')
            .length,
        20
    );
});

test('완료·중도 종료 내전은 전체 취소 범위를 넓히지 않는다', async (t) => {
    const f = await createMatchResultFixture(t, { bestOf: 1, keepAutomaticLineup: true });
    await upload(f);
    assert.equal((await f.row()).status, 'completed');
    await assert.rejects(cancel(f), errorCode('CONFLICT'));
    await f.db.update(schema.scrims).set({ status: 'in_progress' }).where(eq(schema.scrims.id, f.scrimId));
    await endScrimEarly(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    await assert.rejects(cancel(f), errorCode('CONFLICT'));
    assert.equal((await f.db.select().from(schema.scrimCancellations)).length, 0);
});
