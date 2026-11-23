import assert from 'node:assert/strict';
import test from 'node:test';
import { and, eq, sql } from 'drizzle-orm';
import type { SeasonTitleHolder, SeasonTitleId } from '../../../../src/lib/features/players/achievements.ts';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { readSeasonTitles } from '../../../../src/lib/server/records/season-titles.ts';
import { createGameFixture } from '../../support/domain-fixtures.ts';

const title = (rows: SeasonTitleHolder[], titleId: SeasonTitleId) =>
    rows.filter((row) => row.titleId === titleId);
const owners = (rows: SeasonTitleHolder[], titleId: SeasonTitleId) =>
    title(rows, titleId)
        .filter((row) => row.rank === 1)
        .map((row) => row.userId)
        .sort();

test('시즌 세트 칭호는 지표별 유효 표본과 원값으로 순위를 정하고 공개 가능한 신원만 반환한다', async (t) => {
    const f = await createGameFixture(t);
    const ids = f.users.map(({ id }) => id);
    const read = (userId?: string) =>
        f.db.transaction((tx) => readSeasonTitles(tx, f.guildId, f.season.id, userId));
    let matchId = f.match.id;
    const add = async (i: number, loss = false) => {
        if (i > 1 && i % 3 === 1) {
            const [next] = await f.db.insert(schema.matches).values(f.matchValues).returning();
            matchId = next!.id;
        }
        const game = await f.createGame(f.db, ((i - 1) % 3) + 1, matchId, 'a', {
            durationMs: (i === 10 ? 60 : 20) * 60_000,
            winnerSide: loss ? 'red' : 'blue'
        });
        await f.db.execute(sql`update rofl_participant_data_v1 set
            champion = case when participant_index = 0 and ${i}::int <= 5 then 'Lux' else 'Ahri' end,
            stats = stats || jsonb_build_object(
                'kills', case when participant_index in (0,7) then 10 else 1 end,
                'assists', case when participant_index = 2 then 11 else 1 end,
                'deaths', case when participant_index = 0 and ${i}::int = 1 then 0 else 1 end,
                'damageDealtToChampions', case when participant_index = 0 and ${i}::int = 1 then 301 else 300 end,
                'goldEarned', 100, 'wardsKilled', case when participant_index = 8 then 7 else 0 end,
                'minionsKilled', case participant_index when 1 then 999 when 2 then 200 else 100 end,
                'neutralMinionsKilled', 10, 'damageTaken', case when participant_index = 4 then 900 else 50 end,
                'healOnTeammates', case when participant_index = 4 then 5 else 0 end,
                'damageShieldedOnTeammates', case when participant_index = 4 then 7 else 0 end,
                'totalHeal', case when participant_index = 5 then 9999 else 1 end
            ) where rofl_metadata_id = ${game.roflMetadataId}`);
        if (i === 10) {
            // Swap two real positions without crossing the unique (game, side, position) constraint.
            await f.db.execute(sql`update game_participants set position = null
                where game_id = ${game.id} and rofl_participant_index in (2,3)`);
            await f.db.execute(sql`update game_participants set position =
                (case rofl_participant_index when 2 then 'bot' else 'mid' end)::lol_position
                where game_id = ${game.id} and rofl_participant_index in (2,3)`);
        }
        return game;
    };
    for (let i = 1; i <= 9; i++) await add(i);
    assert.deepEqual([...new Set((await read()).map((row) => row.titleId))].sort(), [
        'season-champion-pool',
        'season-clean-sheet',
        'season-one-trick',
        'season-positions'
    ]);
    const tenth = await add(10, true);
    assert.deepEqual(title(await read(), 'season-tanking'), []); // Nine wins and one loss.
    await f.db
        .update(schema.games)
        .set({ status: 'cancelled', winnerSide: null })
        .where(eq(schema.games.id, tenth.id));
    const last = await f.createGame(f.db, tenth.gameNumber, matchId, 'a', { durationMs: 3_600_000 });
    await f.db.execute(sql`update rofl_participant_data_v1 n set stats = o.stats, champion = o.champion
        from rofl_participant_data_v1 o where n.rofl_metadata_id = ${last.roflMetadataId}
        and o.rofl_metadata_id = ${tenth.roflMetadataId} and n.participant_index = o.participant_index`);
    await f.db.execute(sql`update game_participants set position = null where game_id = ${last.id}`);
    await f.db.execute(sql`update game_participants n set position = o.position from game_participants o
        where n.game_id = ${last.id} and o.game_id = ${tenth.id} and n.rofl_participant_index = o.rofl_participant_index`);
    await f.db.update(schema.matches).set({ status: 'ended_early' }).where(eq(schema.matches.id, matchId));
    const rows = await read();
    const expected: [SeasonTitleId, number[]][] = [
        ['season-kills', [0, 7]],
        ['season-assists', [2]],
        ['season-damage', [0]],
        ['season-participation', [2]],
        ['season-wards', [8]],
        ['season-cs', [2]],
        ['season-tanking', [4]],
        ['season-protection', [4]],
        ['season-clean-sheet', [0]],
        ['season-champion-pool', [0]],
        ['season-one-trick', [1, 2, 3, 4]],
        ['season-positions', [2, 3]]
    ];
    for (const [key, expectedIds] of expected)
        assert.deepEqual(
            owners(rows, key),
            expectedIds.map((i) => ids[i]),
            key
        );
    assert.equal(title(rows, 'season-one-trick').filter((r) => r.userId === ids[0]).length, 1);
    assert.equal(title(rows, 'season-one-trick').find((r) => r.userId === ids[0])!.score, 5);
    const rates: [SeasonTitleId, number][] = [
        ['season-kills', 10],
        ['season-assists', 11],
        ['season-damage', 3001 / 240],
        ['season-participation', 1200 / 14],
        ['season-wards', 70 / 240],
        ['season-cs', 2100 / 240],
        ['season-tanking', 9000 / 240],
        ['season-protection', 120 / 240]
    ];
    for (const [key, score] of rates) {
        const winner = title(rows, key)[0]!;
        assert.equal(winner.sample, 10, key);
        assert.ok(Math.abs(winner.score - score) < 1e-10, key);
    }
    const efficiency = title(rows, 'season-efficiency');
    assert.deepEqual(
        owners(
            efficiency.filter((r) => r.position === 'top'),
            'season-efficiency'
        ),
        [ids[0]]
    );
    assert.ok(Math.abs(efficiency.find((r) => r.userId === ids[0])!.score - (301 / 1501 - 0.2) * 10) < 1e-10);
    assert.deepEqual(
        efficiency.filter((r) => r.userId === ids[2] || r.userId === ids[3]),
        []
    );
    assert.ok(
        title(rows, 'season-kills')
            .filter((r) => r.rank === 1)
            .every((r) => r.tied)
    );
    const [damage, runner] = title(rows, 'season-damage');
    assert.equal(damage!.score.toFixed(1), runner!.score.toFixed(1));
    assert.equal(damage!.tied, false);
    assert.equal(runner!.rank, 2);
    assert.deepEqual(
        await read(ids[1]),
        rows.filter((r) => r.rank === 1 && r.userId === ids[1])
    );
    await f.db.update(schema.users).set({ publicProfile: false }).where(eq(schema.users.id, ids[0]!));
    const hidden = await read(ids[0]);
    assert.ok(
        hidden.length > 0 && hidden.every((r) => r.displayName === '비공개 사용자' && r.iconUrl === null)
    );
    assert.ok(!JSON.stringify(hidden).includes(ids[0]!));
    await f.db.execute(sql`update rofl_participant_data_v1 set stats = stats ||
        '{"kills":null,"goldEarned":null,"healOnTeammates":null}'::jsonb
        where rofl_metadata_id = ${last.roflMetadataId} and participant_index = 4`);
    const missing = await read();
    assert.deepEqual(owners(missing, 'season-participation'), [ids[7]]);
    assert.equal(title(missing, 'season-efficiency').filter((r) => r.position === 'top').length, 1);
    assert.equal(title(missing, 'season-protection').length, 9);
    assert.ok(title(missing, 'season-protection').every((r) => r.score === 0));
    await f.db
        .update(schema.roflGameDataV1)
        .set({ gameLengthMs: 0 })
        .where(eq(schema.roflGameDataV1.roflMetadataId, last.roflMetadataId!));
    const noTime = await read();
    assert.deepEqual(title(noTime, 'season-damage'), []);
    assert.equal(title(noTime, 'season-assists')[0]!.score, 11);
    const [other] = await f.db
        .insert(schema.mmrSeasons)
        .values({ guildId: f.guildId, name: '지난 시즌', startedAt: new Date(0), endedAt: new Date(1) })
        .returning();
    assert.deepEqual(await f.db.transaction((tx) => readSeasonTitles(tx, f.guildId, other!.id)), []);
    assert.deepEqual(await f.db.transaction((tx) => readSeasonTitles(tx, f.otherGuildId, f.season.id)), []);
    await f.db.update(schema.scrims).set({ status: 'cancelled' }).where(eq(schema.scrims.id, f.scrimId));
    assert.deepEqual(await read(), []);
});

test('시리즈는 확정된 Bo3마다 실제 출전자를 한 번만 세고 취소·정정에 따라 결정 세트 수상자를 바꾼다', async (t) => {
    const f = await createGameFixture(t);
    const ids = f.users.map(({ id }) => id);
    const read = () => f.db.transaction((tx) => readSeasonTitles(tx, f.guildId, f.season.id));
    async function series(winners: boolean[], winnerA: boolean, bestOf = 3) {
        const [match] = await f.db
            .insert(schema.matches)
            .values({
                ...f.matchValues,
                bestOf,
                status: 'completed',
                winnerTeamId: f.teams[winnerA ? 0 : 1]!.id
            })
            .returning();
        const games = [];
        for (const [index, wonA] of winners.entries()) {
            const blueIsA = index % 2 === 0;
            games.push(
                await f.createGame(f.db, index + 1, match!.id, blueIsA ? 'a' : 'b', {
                    winnerSide: blueIsA === wonA ? 'blue' : 'red'
                })
            );
        }
        return { match: match!, games };
    }
    for (const win of [true, false, true, false]) await series([win, win], win);
    await series([true, true, true], true, 5);
    const four = await read();
    assert.deepEqual(title(four, 'season-series-rate'), []);
    assert.deepEqual(title(four, 'season-decider'), []);
    const fifth = await series([false, true, true], true);
    const g3 = fifth.games[2]!;
    const [sub] = await f.db
        .insert(schema.scrimParticipants)
        .values({ scrimId: f.scrimId, userId: ids[10], displayName: '교체 출전자' })
        .returning();
    await f.db
        .update(schema.gameParticipants)
        .set({ scrimParticipantId: sub!.id, riotAccountId: null })
        .where(
            and(
                eq(schema.gameParticipants.gameId, g3.id),
                eq(schema.gameParticipants.roflParticipantIndex, 0)
            )
        );
    const complete = await read();
    assert.equal(owners(complete, 'season-champion-pool').length, 11);
    assert.ok(title(complete, 'season-champion-pool').every((r) => r.rank === 1 && r.tied));
    assert.deepEqual(
        owners(complete, 'season-decider'),
        [1, 2, 3, 4, 10].map((i) => ids[i])
    );
    assert.deepEqual(owners(complete, 'season-series-rate'), ids.slice(0, 5));
    assert.deepEqual(
        title(complete, 'season-series-rate').map((r) => [r.sample, r.score]),
        [...Array.from({ length: 5 }, () => [5, 60]), ...Array.from({ length: 5 }, () => [5, 40])]
    );
    await f.db
        .update(schema.games)
        .set({ status: 'cancelled', winnerSide: null })
        .where(eq(schema.games.id, g3.id));
    assert.deepEqual(title(await read(), 'season-series-rate'), []);
    const newGame = await f.createGame(f.db, 3, fifth.match.id, 'b');
    assert.deepEqual(title(await read(), 'season-decider'), []); // Stored winner still disagrees with 1:2.
    await f.db
        .update(schema.matches)
        .set({ winnerTeamId: f.teams[1]!.id })
        .where(eq(schema.matches.id, fifth.match.id));
    const corrected = await read();
    assert.deepEqual(owners(corrected, 'season-series-rate'), ids.slice(5, 10));
    assert.deepEqual(owners(corrected, 'season-decider'), ids.slice(5, 10));
    await f.db
        .update(schema.roflGameDataV1)
        .set({ resultStatus: 'conflicting', winnerReplayTeamId: null })
        .where(eq(schema.roflGameDataV1.roflMetadataId, newGame.roflMetadataId!));
    assert.deepEqual(title(await read(), 'season-series-rate'), []);
});

test('가성비 킹은 세트 지분 차를 평균내며 한 선수가 서로 다른 포지션에서 동시에 1위가 될 수 있다', async (t) => {
    const f = await createGameFixture(t);
    const ids = f.users.map(({ id }) => id);
    for (let block = 0; block < 4; block++) {
        for (let set = 0; set < 5; set++) {
            const [match] = await f.db
                .insert(schema.matches)
                .values({ ...f.matchValues, bestOf: 1 })
                .returning();
            const game = await f.createGame(f.db, 1, match!.id);
            if (block >= 2) {
                await f.db.execute(sql`update game_participants set position = null
                    where game_id = ${game.id} and rofl_participant_index in (0,2)`);
                await f.db.execute(sql`update game_participants set position =
                    (case rofl_participant_index when 0 then 'mid' else 'top' end)::lol_position
                    where game_id = ${game.id} and rofl_participant_index in (0,2)`);
            }
            // The 100- and 200-damage games must carry identical weight: (10%p + 30%p) / 2.
            await f.db.execute(sql`update rofl_participant_data_v1 set stats = stats || jsonb_build_object(
                'goldEarned', 20, 'kills', 0, 'damageDealtToChampions',
                case when ${block % 2}::int = 0 then
                    case when participant_index = 0 then 30 when participant_index <= 2 then 20 else 15 end
                else case when participant_index = 0 then 100 else 25 end end)
                where rofl_metadata_id = ${game.roflMetadataId} and participant_index < 5`);
        }
    }
    const rows = await f.db.transaction((tx) => readSeasonTitles(tx, f.guildId, f.season.id, ids[0]));
    assert.deepEqual(
        title(rows, 'season-efficiency').map((r) => [r.position, r.sample, r.score]),
        [
            ['top', 10, 20],
            ['mid', 10, 20]
        ]
    );
    const all = await f.db.transaction((tx) => readSeasonTitles(tx, f.guildId, f.season.id));
    assert.deepEqual(
        title(all, 'season-participation').map((r) => r.userId),
        ids.slice(5, 10)
    );
});
