import assert from 'node:assert/strict';
import test from 'node:test';
import { and, eq, isNull } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import {
    confirmMatchLineup,
    releaseMatchLineup,
    importMatchRofl,
    revertLastMatchGame
} from '../../../../src/lib/server/matches/service.ts';
import { createMatchResultFixture, replayBytes } from '../../support/match-fixtures.ts';
import { concurrently, errorCode } from '../../support/domain-fixtures.ts';
import { MMR_POSITIONS } from '../../../../src/lib/server/mmr/rules.ts';

type Fixture = Awaited<ReturnType<typeof createMatchResultFixture>>;
const replayPositions = { top: 'TOP', jungle: 'JUNGLE', mid: 'MIDDLE', bot: 'BOTTOM', support: 'UTILITY' };

async function storedCounts(f: Fixture) {
    const names = [
        'games',
        'game_participants',
        'rofl_metadata',
        'rofl_participants',
        'rofl_game_data_v1',
        'rofl_participant_data_v1',
        'game_mmr_applications',
        'mmr_ledger_entries',
        'match_rofl_imports'
    ];
    const result: Record<string, number> = {};
    for (const name of names)
        result[name] = Number((await f.pool.query(`SELECT count(*) FROM ${name}`)).rows[0].count);
    return result;
}

const upload = (
    f: Fixture,
    slot: { expectedRevision: number; nextGameNumber: number; lineupId: string; blueTeamSlot: 'a' | 'b' },
    bytes = replayBytes(f.players()),
    matchId = f.match.id,
    actor = f.manager
) => importMatchRofl(f.db, actor, f.guildId, matchId, { ...slot, bytes }, f.dependencies);

function alternateAccount(f: Fixture) {
    const players = f
        .players()
        .map((player, index) => (index === 0 ? { ...player, RIOT_ID_GAME_NAME: 'AlternateTop' } : player));
    const dependencies = {
        ...f.dependencies,
        riot: {
            getAccountByRiotId: async (input: { gameName: string; tagLine: string }) =>
                input.gameName === 'AlternateTop'
                    ? { puuid: 'fixture-alternate-top', gameName: input.gameName, tagLine: input.tagLine }
                    : f.dependencies.riot.getAccountByRiotId(input)
        }
    };
    return { players, dependencies };
}

async function revert(f: Fixture, gameId: string, matchId = f.match.id) {
    return revertLastMatchGame(
        f.db,
        f.manager,
        f.guildId,
        matchId,
        {
            expectedRevision: (await f.matchRow(matchId)).revision,
            gameId,
            reason: '잘못된 마지막 결과 정정'
        },
        f.dependencies
    );
}

test('수동으로 확정한 편성은 경기 생성 시 그대로 확정되며 별도 재확정 없이 결과를 저장한다', async (t) => {
    const f = await createMatchResultFixture(t, { keepAutomaticLineup: true });
    const [lineup] = await f.db.select().from(schema.matchLineups);
    assert.ok(lineup?.confirmedAt);
    assert.equal((await f.db.select().from(schema.matchLineupPlayers)).length, 10);
    await upload(f, await f.slot());
    assert.equal((await f.db.select().from(schema.games)).length, 1);
});

test('경매 편성은 희망 포지션을 자동 복사하지 않고 경기 라인업을 한 번 확정한 뒤 사용한다', async (t) => {
    const f = await createMatchResultFixture(t, { method: 'auction' });
    assert.equal((await f.db.select().from(schema.matchLineups)).length, 0);
    const people = await f.db.select().from(schema.scrimParticipants);
    assert.ok(people.every((person) => person.position === null));
    await upload(f, await f.confirm());
    await upload(f, await f.slot(2), replayBytes(f.players(false), { gameLengthMs: 1_900_000 }));
    assert.equal((await f.db.select().from(schema.matchLineups)).length, 1);
    assert.equal((await f.db.select().from(schema.games)).length, 2);
});

test('경기 라인업은 관리자만 확정하며 다른 서버·중복 출전자·누락 포지션·오래된 revision을 거절한다', async (t) => {
    const f = await createMatchResultFixture(t);
    const input = await f.lineupInput();
    await assert.rejects(
        confirmMatchLineup(f.db, null, f.guildId, f.match.id, input, f.dependencies),
        errorCode('UNAUTHENTICATED')
    );
    await assert.rejects(
        confirmMatchLineup(f.db, f.actors[2]!, f.guildId, f.match.id, input, f.dependencies),
        errorCode('FORBIDDEN')
    );
    await assert.rejects(
        confirmMatchLineup(f.db, f.manager, f.otherGuildId, f.match.id, input, f.dependencies)
    );
    for (const players of [
        input.players.slice(0, 9),
        [...input.players.slice(0, 9), input.players[0]!],
        input.players.map((person, index) =>
            index === 1 ? { ...person, position: input.players[0]!.position } : person
        )
    ]) {
        await assert.rejects(
            confirmMatchLineup(f.db, f.manager, f.guildId, f.match.id, { ...input, players }, f.dependencies)
        );
    }
    await f.confirm();
    await assert.rejects(
        confirmMatchLineup(f.db, f.manager, f.guildId, f.match.id, input, f.dependencies),
        errorCode('CONFLICT')
    );
    const lineups = await f.db.select().from(schema.matchLineups);
    assert.equal(lineups.length, 1);
    assert.ok(lineups[0]!.confirmedAt);
    assert.equal((await f.db.select().from(schema.matchLineupPlayers)).length, 10);
});

test('확정 해제 후 이전 라인업 요청은 저장되지 않고 결과가 생긴 라인업은 해제하지 못한다', async (t) => {
    const f = await createMatchResultFixture(t);
    const old = await f.confirm();
    await releaseMatchLineup(f.db, f.manager, f.guildId, f.match.id, old, f.dependencies);
    await assert.rejects(upload(f, old), errorCode('CONFLICT'));
    const current = await f.confirm();
    await upload(f, current);
    await assert.rejects(
        releaseMatchLineup(
            f.db,
            f.manager,
            f.guildId,
            f.match.id,
            {
                expectedRevision: (await f.matchRow()).revision
            },
            f.dependencies
        ),
        errorCode('CONFLICT')
    );
    assert.equal((await f.db.select().from(schema.games)).length, 1);
});

test('확정 라인업의 실제 출전자는 업로드할 수 있고 출전하지 않는 멤버와 다른 서버 요청은 차단한다', async (t) => {
    const f = await createMatchResultFixture(t);
    const slot = await f.confirm();
    await assert.rejects(upload(f, slot, undefined, f.match.id, f.actors[15]!), errorCode('FORBIDDEN'));
    await assert.rejects(
        importMatchRofl(
            f.db,
            null,
            f.guildId,
            f.match.id,
            { ...slot, bytes: replayBytes(f.players()) },
            f.dependencies
        ),
        errorCode('UNAUTHENTICATED')
    );
    await assert.rejects(
        importMatchRofl(
            f.db,
            f.manager,
            f.otherGuildId,
            f.match.id,
            { ...slot, bytes: replayBytes(f.players()) },
            f.dependencies
        )
    );
    assert.ok(Object.values(await storedCounts(f)).every((count) => count === 0));
    const result = await upload(f, slot, undefined, f.match.id, f.actors[2]!);
    assert.equal(result.order, 1);
    assert.equal((await f.db.select().from(schema.games)).length, 1);
});

test('ROFL 저장은 선별 자료·확정 포지션·원장·점수를 함께 반영하고 실제 0과 알 수 없는 시각을 보존한다', async (t) => {
    const f = await createMatchResultFixture(t);
    const result = await upload(f, await f.confirm());
    const [game] = await f.db.select().from(schema.games);
    assert.equal(game?.id, result.gameId);
    assert.equal(game?.status, 'completed');
    assert.equal(game?.winnerSide, 'blue');
    assert.equal(game?.startedAt, null);
    const people = await f.db.select().from(schema.gameParticipants);
    assert.equal(people.length, 10);
    assert.ok(people.every((person) => person.position && person.riotAccountId && person.roflMetadataId));
    assert.equal(
        (
            await f.db
                .select()
                .from(schema.roflParticipantDataV1)
                .where(eq(schema.roflParticipantDataV1.participantIndex, 0))
        )[0]!.stats.kills,
        0
    );
    assert.equal((await f.db.select().from(schema.gameMmrApplications)).length, 1);
    assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 10);
    const ratings = await f.db.select().from(schema.userPositionMmr);
    assert.equal(ratings.length, 10);
    assert.equal(ratings.filter((row) => row.mmr === 1516).length, 5);
    assert.equal(ratings.filter((row) => row.mmr === 1484).length, 5);
});

test('같은 파일의 동시 업로드와 성공 응답 유실 재전송은 Game과 MMR을 한 번만 적용한다', async (t) => {
    const f = await createMatchResultFixture(t);
    const slot = await f.confirm();
    const bytes = replayBytes(f.players());
    const results = await concurrently([() => upload(f, slot, bytes), () => upload(f, slot, bytes)]);
    assert.ok(results.every((result) => result.status === 'fulfilled'));
    const first = results[0];
    const second = results[1];
    assert.ok(first?.status === 'fulfilled' && second?.status === 'fulfilled');
    assert.deepEqual(first.value, second.value);
    assert.deepEqual(await upload(f, slot, bytes), first.value);
    assert.equal((await f.db.select().from(schema.games)).length, 1);
    assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 10);
});

test('파일 진영과 명시적으로 확정한 포지션을 사용하며 팀 편성의 포지션을 대신 복사하지 않는다', async (t) => {
    const f = await createMatchResultFixture(t);
    const input = await f.lineupInput(f.match.id);
    input.players = input.players.map((player) => ({
        ...player,
        position: MMR_POSITIONS[(MMR_POSITIONS.indexOf(player.position) + 1) % 5]!
    }));
    await confirmMatchLineup(f.db, f.manager, f.guildId, f.match.id, input, f.dependencies);
    const [lineup] = await f.db.select().from(schema.matchLineups);
    const slot = {
        expectedRevision: (await f.matchRow()).revision,
        nextGameNumber: 1,
        lineupId: lineup!.id,
        blueTeamSlot: 'b' as const
    };
    const players = f.players().map((player, index) => ({
        ...player,
        TEAM: player.TEAM === '100' ? '200' : '100',
        TEAM_POSITION:
            replayPositions[
                input.players.find((row) => row.participantId === f.participants[index]!.id)!.position
            ]
    }));
    await upload(f, slot, replayBytes(players));
    const [game] = await f.db.select().from(schema.games);
    assert.equal(game?.blueTeamSlot, 'b');
    assert.equal(game?.winnerSide, 'red');
    const people = await f.db.select().from(schema.gameParticipants);
    for (const player of people)
        assert.equal(
            player.position,
            input.players.find((row) => row.participantId === player.scrimParticipantId)!.position
        );
});

test('같은 결과의 바이트 변형·참가자 순서 변경·다음 세트 재사용은 파일 해시가 달라도 중복 채택하지 않는다', async (t) => {
    const f = await createMatchResultFixture(t);
    const first = await f.confirm();
    await upload(f, first);
    const variants = [replayBytes(f.players(), { bodyByte: 0x43 }), replayBytes([...f.players()].reverse())];
    for (const bytes of variants) await assert.rejects(upload(f, first, bytes), errorCode('CONFLICT'));
    const second = await f.slot(2);
    for (const bytes of variants) await assert.rejects(upload(f, second, bytes), errorCode('CONFLICT'));
    assert.equal((await f.db.select().from(schema.games)).length, 1);
    assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 10);
});

test('팀 대응을 확인할 기존 계정이 없으면 원본 PUUID나 표시 이름만으로 사용자를 추정하지 않는다', async (t) => {
    const f = await createMatchResultFixture(t);
    const slot = await f.confirm();
    const riot = { getAccountByRiotId: async () => ({ puuid: '다른-계정의-실제-PUUID' }) };
    await assert.rejects(
        importMatchRofl(
            f.db,
            f.manager,
            f.guildId,
            f.match.id,
            { ...slot, bytes: replayBytes(f.players()) },
            { ...f.dependencies, riot }
        )
    );
    assert.ok(Object.values(await storedCounts(f)).every((count) => count === 0));
    await f.db.delete(schema.guildRiotAccounts).where(eq(schema.guildRiotAccounts.guildId, f.guildId));
    await assert.rejects(upload(f, slot));
    assert.ok(Object.values(await storedCounts(f)).every((count) => count === 0));
});

test('명시된 팀·포지션의 미연결 부계정은 당시 출전에만 저장하고 서버 연결과 대표 계정을 바꾸지 않는다', async (t) => {
    const f = await createMatchResultFixture(t);
    const slot = await f.confirm();
    const beforeLinks = await f.db.select().from(schema.guildRiotAccounts);
    const beforeAccounts = (await f.db.select().from(schema.riotAccounts)).length;
    const alternate = alternateAccount(f);
    const result = await importMatchRofl(
        f.db,
        f.manager,
        f.guildId,
        f.match.id,
        { ...slot, bytes: replayBytes([...alternate.players].reverse()) },
        alternate.dependencies
    );
    const [account] = await f.db
        .select()
        .from(schema.riotAccounts)
        .where(eq(schema.riotAccounts.puuid, 'fixture-alternate-top'));
    assert.ok(account);
    const [played] = await f.db
        .select()
        .from(schema.gameParticipants)
        .where(
            and(
                eq(schema.gameParticipants.gameId, result.gameId),
                eq(schema.gameParticipants.scrimParticipantId, f.participants[0]!.id)
            )
        );
    assert.equal(played?.riotAccountId, account.id);
    assert.equal(played?.riotGameName, 'AlternateTop');
    assert.equal(played?.position, 'top');
    assert.equal(played?.roflParticipantIndex, 9);
    assert.equal((await f.db.select().from(schema.riotAccounts)).length, beforeAccounts + 1);
    assert.deepEqual(await f.db.select().from(schema.guildRiotAccounts), beforeLinks);
    assert.equal(
        (
            await f.db
                .select()
                .from(schema.scrimParticipants)
                .where(eq(schema.scrimParticipants.id, f.participants[0]!.id))
        )[0]!.riotAccountId,
        f.accounts[0]!.id
    );
});

test('미연결 계정의 누락·중복·잘못된 포지션과 기존 타 사용자 계정은 자동 귀속하지 않는다', async (t) => {
    const f = await createMatchResultFixture(t);
    const slot = await f.confirm();
    const alternate = alternateAccount(f);
    const before = await f.db.select().from(schema.riotAccounts);
    for (const position of [undefined, null, '', 'NONE', 'SUPPORT', 'JUNGLE']) {
        const players = alternate.players.map((player, index) =>
            index === 0 ? { ...player, TEAM_POSITION: position } : player
        );
        await assert.rejects(
            importMatchRofl(
                f.db,
                f.manager,
                f.guildId,
                f.match.id,
                { ...slot, bytes: replayBytes(players) },
                alternate.dependencies
            )
        );
    }
    const foreign = f
        .players()
        .map((player, index) =>
            index === 0 ? { ...player, RIOT_ID_GAME_NAME: f.accounts[15]!.gameName! } : player
        );
    await assert.rejects(upload(f, slot, replayBytes(foreign)), errorCode('CONFLICT'));
    assert.ok(Object.values(await storedCounts(f)).every((count) => count === 0));
    assert.deepEqual(await f.db.select().from(schema.riotAccounts), before);
});

test('한 팀의 연결 근거만 있어도 반대 팀을 확인하고 명시된 포지션으로 부계정을 연결한다', async (t) => {
    const f = await createMatchResultFixture(t);
    const slot = await f.confirm();
    await f.db.delete(schema.guildRiotAccounts).where(eq(schema.guildRiotAccounts.guildId, f.guildId));
    await f.db.insert(schema.guildRiotAccounts).values({
        guildId: f.guildId,
        userId: f.actors[0]!.userId,
        riotAccountId: f.accounts[0]!.id,
        isPrimary: true
    });
    await upload(f, slot);
    assert.equal((await f.db.select().from(schema.gameParticipants)).length, 10);
    assert.equal(
        (
            await f.db
                .select()
                .from(schema.guildRiotAccounts)
                .where(eq(schema.guildRiotAccounts.guildId, f.guildId))
        ).length,
        1
    );
});

test('포지션이 누락된 구형 파일은 열 명 모두 기존 계정으로 확인될 때만 확정 출전을 사용한다', async (t) => {
    const f = await createMatchResultFixture(t);
    const slot = await f.confirm();
    const players = f.players().map((player) => ({ ...player, TEAM_POSITION: undefined }));
    await upload(f, slot, replayBytes(players));
    assert.equal((await f.db.select().from(schema.gameParticipants)).length, 10);
});

test('잘못된 참가자 수·팀 배치·승패·필수 성적은 라인업과 점수를 변경하지 않는다', async (t) => {
    const f = await createMatchResultFixture(t);
    const slot = await f.confirm();
    const original = f.players();
    const variants = [
        original.slice(0, 9),
        original.map((player, index) => ({
            ...player,
            TEAM: index === 0 ? '200' : index === 5 ? '100' : player.TEAM
        })),
        original.map((player) => ({ ...player, WIN: 'Win' })),
        original.map((player, index) => (index === 0 ? { ...player, CHAMPIONS_KILLED: null } : player))
    ];
    for (const players of variants) await assert.rejects(upload(f, slot, replayBytes(players)));
    assert.ok(Object.values(await storedCounts(f)).every((count) => count === 0));
    assert.equal((await f.matchRow()).revision, slot.expectedRevision);
});

test('Riot 조회 도중 라인업을 바꾸면 잠금 이후 재검증이 이전 파일의 저장을 차단한다', async (t) => {
    const f = await createMatchResultFixture(t);
    const slot = await f.confirm();
    let notify!: () => void;
    const lookingUp = new Promise<void>((resolve) => {
        notify = resolve;
    });
    let proceed!: () => void;
    const barrier = new Promise<void>((resolve) => {
        proceed = resolve;
    });
    const pending = importMatchRofl(
        f.db,
        f.manager,
        f.guildId,
        f.match.id,
        { ...slot, bytes: replayBytes(f.players()) },
        {
            ...f.dependencies,
            riot: {
                getAccountByRiotId: async (input: { gameName: string; tagLine: string }) => {
                    notify();
                    await barrier;
                    return f.dependencies.riot.getAccountByRiotId(input);
                }
            }
        }
    );
    const rejected = assert.rejects(pending, errorCode('CONFLICT'));
    await lookingUp;
    try {
        await releaseMatchLineup(f.db, f.manager, f.guildId, f.match.id, slot, f.dependencies);
        await f.confirm();
    } finally {
        proceed();
    }
    await rejected;
    assert.ok(Object.values(await storedCounts(f)).every((count) => count === 0));
});

test('MMR 원장 쓰기가 실패하면 ROFL·출전·시리즈·게시 작업을 모두 롤백한다', async (t) => {
    const f = await createMatchResultFixture(t);
    const slot = await f.confirm();
    const match = await f.matchRow();
    const scrim = await f.row();
    const publications = await f.db.select().from(schema.discordPublicationJobs);
    const accounts = await f.db.select().from(schema.riotAccounts);
    const alternate = alternateAccount(f);
    await f.pool.query(
        "CREATE FUNCTION fail_result_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture-result-rollback'; END $$"
    );
    await f.pool.query(
        'CREATE TRIGGER fail_result_ledger BEFORE INSERT ON mmr_ledger_entries FOR EACH ROW EXECUTE FUNCTION fail_result_ledger()'
    );
    await assert.rejects(
        importMatchRofl(
            f.db,
            f.manager,
            f.guildId,
            f.match.id,
            { ...slot, bytes: replayBytes(alternate.players) },
            alternate.dependencies
        ),
        (error: unknown) => {
            let cause = error as { cause?: unknown; code?: string; message?: string };
            while (cause.cause) cause = cause.cause as typeof cause;
            return cause.code === 'P0001' && cause.message === 'fixture-result-rollback';
        }
    );
    assert.ok(Object.values(await storedCounts(f)).every((count) => count === 0));
    assert.deepEqual(await f.matchRow(), match);
    assert.deepEqual(await f.row(), scrim);
    assert.deepEqual(await f.db.select().from(schema.discordPublicationJobs), publications);
    assert.equal((await f.db.select().from(schema.userPositionMmr)).length, 0);
    assert.deepEqual(await f.db.select().from(schema.riotAccounts), accounts);
});

test('이전 챔피언을 다시 쓴 정상 ROFL도 저장하며 BO 선승 시 내전까지 자동 종료한다', async (t) => {
    const f = await createMatchResultFixture(t);
    await upload(f, await f.confirm());
    const next = await f.slot(2);
    const result = await upload(f, next, replayBytes(f.players(), { gameLengthMs: 1_900_000 }));
    assert.equal(result.order, 2);
    assert.equal((await f.matchRow()).status, 'completed');
    assert.equal((await f.matchRow()).winnerTeamId, f.teams[0]!.id);
    assert.equal((await f.row()).status, 'completed');
    assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 20);
    assert.equal((await f.db.select().from(schema.matchLineups)).length, 1);
    await assert.rejects(
        upload(f, await f.slot(3), replayBytes(f.players(), { gameLengthMs: 2_000_000 })),
        errorCode('CONFLICT')
    );
});

test('정정은 마지막 Game만 취소하고 원장 역분개·내전 재개·재전송 차단을 함께 반영한다', async (t) => {
    const f = await createMatchResultFixture(t);
    const first = await upload(f, await f.confirm());
    const slot = await f.slot(2);
    const bytes = replayBytes(f.players(), { gameLengthMs: 1_900_000 });
    const last = await upload(f, slot, bytes);
    await assert.rejects(revert(f, first.gameId), errorCode('CONFLICT'));
    await revert(f, last.gameId);
    assert.equal((await f.matchRow()).status, 'in_progress');
    assert.equal((await f.row()).status, 'in_progress');
    assert.equal(
        (await f.db.select().from(schema.games).where(eq(schema.games.id, last.gameId)))[0]!.status,
        'cancelled'
    );
    assert.equal(
        (
            await f.db
                .select()
                .from(schema.gameMmrApplications)
                .where(isNull(schema.gameMmrApplications.reversedAt))
        ).length,
        1
    );
    assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 30);
    await assert.rejects(upload(f, slot, bytes), errorCode('CONFLICT'));
    assert.equal(
        (await f.db.select().from(schema.games).where(eq(schema.games.status, 'completed'))).length,
        1
    );
    const replacementSlot = await f.slot(2);
    const replacement = await upload(
        f,
        replacementSlot,
        replayBytes(f.players(false), { gameLengthMs: 2_000_000 })
    );
    assert.notEqual(replacement.gameId, last.gameId);
    assert.equal(replacement.order, 2);
    assert.equal((await f.db.select().from(schema.games)).length, 3);
    assert.equal(
        (await f.db.select().from(schema.games).where(eq(schema.games.id, last.gameId)))[0]!.status,
        'cancelled'
    );
    await assert.rejects(upload(f, slot, bytes), errorCode('CONFLICT'));
    assert.equal(
        (
            await f.db
                .select()
                .from(schema.gameMmrApplications)
                .where(isNull(schema.gameMmrApplications.reversedAt))
        ).length,
        2
    );
});

test('20인 내전의 준결승 승자는 결승 팀과 라인업으로 진출하며 결승 확정 이후 정정을 막는다', async (t) => {
    const f = await createMatchResultFixture(t, { teams: 4, bestOf: 1 });
    const other = f.matches.find((match) => match.id !== f.match.id)!;
    const firstSlot = await f.confirm();
    const otherSlot = await f.confirm(other.id);
    const first = await upload(f, firstSlot);
    await upload(f, otherSlot, replayBytes(f.players(true, 10), { gameLengthMs: 1_900_000 }), other.id);
    const final = (await f.db.select().from(schema.matches)).find(
        (match) => !f.matches.some((initial) => initial.id === match.id)
    );
    assert.ok(final);
    assert.deepEqual(new Set([final.teamAId, final.teamBId]), new Set([f.teams[0]!.id, f.teams[2]!.id]));
    const [finalLineup] = await f.db
        .select()
        .from(schema.matchLineups)
        .where(eq(schema.matchLineups.matchId, final.id));
    assert.ok(finalLineup?.confirmedAt);
    await releaseMatchLineup(
        f.db,
        f.manager,
        f.guildId,
        final.id,
        { expectedRevision: (await f.matchRow(final.id)).revision, lineupId: finalLineup.id },
        f.dependencies
    );
    await f.confirm(final.id);
    await assert.rejects(revert(f, first.gameId), errorCode('CONFLICT'));
    assert.equal(
        (
            await f.db
                .select()
                .from(schema.games)
                .where(and(eq(schema.games.id, first.gameId), eq(schema.games.status, 'completed')))
        ).length,
        1
    );
    assert.equal(
        (
            await f.db
                .select()
                .from(schema.gameMmrApplications)
                .where(isNull(schema.gameMmrApplications.reversedAt))
        ).length,
        2
    );
});

test('후속 결승이 아직 생성되지 않은 준결승 결과는 안전하게 취소하고 이전 이력을 보존한다', async (t) => {
    const f = await createMatchResultFixture(t, { teams: 4, bestOf: 1 });
    const first = await upload(f, await f.confirm());
    assert.equal((await f.db.select().from(schema.matches)).length, 2);
    await revert(f, first.gameId);
    assert.equal((await f.matchRow()).status, 'in_progress');
    assert.equal((await f.matchRow()).winnerTeamId, null);
    assert.equal(
        (await f.db.select().from(schema.games).where(eq(schema.games.id, first.gameId)))[0]!.status,
        'cancelled'
    );
    assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 20);
});

for (const method of ['manual', 'auction'] as const)
    test(`${method} 승자 진출은 직전 경기에서 실제 확정한 포지션을 다음 경기로 전파한다`, async (t) => {
        const f = await createMatchResultFixture(t, { teams: 4, bestOf: 1, method });
        const firstInput = await f.lineupInput();
        firstInput.players = firstInput.players.map((player) => ({
            ...player,
            position: MMR_POSITIONS[(MMR_POSITIONS.indexOf(player.position) + 1) % 5]!
        }));
        await confirmMatchLineup(f.db, f.manager, f.guildId, f.match.id, firstInput, f.dependencies);
        const other = f.matches.find((match) => match.id !== f.match.id)!;
        const otherInput = await f.lineupInput(other.id);
        const otherSlot = await f.confirm(other.id);
        const firstPlayers = f.players().map((player, index) => ({
            ...player,
            TEAM_POSITION:
                replayPositions[
                    firstInput.players.find((row) => row.participantId === f.participants[index]!.id)!
                        .position
                ]
        }));
        await upload(f, await f.slot(), replayBytes(firstPlayers));
        await upload(f, otherSlot, replayBytes(f.players(true, 10), { gameLengthMs: 1_900_000 }), other.id);
        const final = (await f.db.select().from(schema.matches)).find(
            (row) => !f.matches.some((initial) => initial.id === row.id)
        );
        assert.ok(final);
        const [lineup] = await f.db
            .select()
            .from(schema.matchLineups)
            .where(eq(schema.matchLineups.matchId, final.id));
        assert.ok(lineup, '승자들의 확정 출전 배치를 다음 경기에서 다시 입력하게 하지 않는다');
        const propagated = await f.db
            .select()
            .from(schema.matchLineupPlayers)
            .where(eq(schema.matchLineupPlayers.lineupId, lineup.id));
        const winners = new Set(
            [...f.participants.slice(0, 5), ...f.participants.slice(10, 15)].map((person) => person.id)
        );
        const expected = [...firstInput.players, ...otherInput.players].filter((person) =>
            winners.has(person.participantId)
        );
        assert.equal(propagated.length, 10);
        assert.deepEqual(
            new Map(propagated.map((person) => [person.participantId, person.position])),
            new Map(expected.map((person) => [person.participantId, person.position]))
        );
    });
