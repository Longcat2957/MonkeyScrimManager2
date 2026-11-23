import assert from 'node:assert/strict';
import test from 'node:test';
import { and, eq, sql } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { getMatch } from '../../../../src/lib/server/matches/queries.ts';
import type { Database } from '../../../../src/lib/server/db/types.ts';
import { seriesTitleQuery, setTitleQuery } from '../../../../src/lib/server/matches/titles.ts';
import { champion, createGameFixture } from '../../support/domain-fixtures.ts';

const resolvers = { champion, item: () => null, spell: () => null, rune: () => null, splash: () => null };
type Fixture = { db: Database; match: typeof schema.matches.$inferSelect };
type Game = typeof schema.games.$inferSelect;

function patchStats(f: Fixture, game: Game, index: number, stats: Partial<schema.RoflStatsV1>) {
    return f.db
        .update(schema.roflParticipantDataV1)
        .set({ stats: sql`${schema.roflParticipantDataV1.stats} || ${JSON.stringify(stats)}::jsonb` })
        .where(
            and(
                eq(schema.roflParticipantDataV1.roflMetadataId, game.roflMetadataId!),
                eq(schema.roflParticipantDataV1.participantIndex, index)
            )
        );
}

function setDuration(f: Fixture, game: Game, ms: number) {
    return f.db
        .update(schema.roflGameDataV1)
        .set({ gameLengthMs: ms })
        .where(eq(schema.roflGameDataV1.roflMetadataId, game.roflMetadataId!));
}

function finish(f: Fixture, winner = f.match.teamAId, bestOf = 3) {
    return f.db
        .update(schema.matches)
        .set({ bestOf, status: 'completed', winnerTeamId: winner })
        .where(eq(schema.matches.id, f.match.id));
}

test('세트 칭호 10종은 실제 수상자를 모두 반환하며 각 경계 바로 아래와 누락 기록을 구분한다', async (t) => {
    const f = await createGameFixture(t);
    const game = await f.createGame(f.db, 1, f.match.id, 'a', { durationMs: 1_800_000, missingStats: true });
    // 20:30킬 승리, 바텀의 딜 지분 40%, 탑/바텀의 킬 관여율 60%/90%, 패배 탑의 단독 딜 1위.
    for (let i = 0; i < 10; i++) {
        await patchStats(f, game, i, {
            kills: [4, 4, 6, 6, 0][i] ?? 6,
            assists: [8, 0, 0, 12, 15][i] ?? 0,
            deaths: i === 0 ? 0 : 4,
            minionsKilled: [40, 0, 300, 0, 0, 0, 300][i] ?? 0,
            neutralMinionsKilled: [10, 40][i] ?? 0,
            damageDealtToChampions: [15, 15, 15, 40, 15, 50][i] ?? 10,
            pentaKills: i === 5 ? 1 : 0
        });
    }
    const read = async () => {
        const rows = (
            await f.db.execute<{ id: string; scrim_participant_id: string; value: string }>(
                setTitleQuery(f.guildId, f.match.id, game.id)
            )
        ).rows;
        return rows
            .map((row) => [
                row.id,
                f.participants.findIndex((p) => p.id === row.scrim_participant_id),
                Number(row.value)
            ])
            .sort();
    };
    assert.deepEqual(
        await read(),
        [
            ['set-top-diff', 0, 50],
            ['set-jungle-clear', 1, 40],
            ['set-mid-farm', 2, 10],
            ['set-bot-carry', 3, 40],
            ['set-support-assists', 4, 15],
            ['set-next-faker', 0, 60],
            ['set-losing-damage', 5, 50],
            ['set-pentakill', 5, 1],
            ['set-deus-ex-machina', 3, 90],
            ...[0, 1, 2, 3, 4].map((i) => ['set-kill-deficit', i, 10])
        ].sort()
    );
    const detail = await getMatch(f.db, null, f.guildId, f.match.id, game.id, resolvers);
    assert.equal(detail?.match.seriesTitle, null);
    assert.equal(detail?.game?.sides[0]?.players[0]?.titles.length, 3);
    const [unrelated] = await f.db.insert(schema.matches).values(f.matchValues).returning();
    assert.equal((await f.db.execute(setTitleQuery(f.otherGuildId, f.match.id, game.id))).rowCount, 0);
    assert.equal((await f.db.execute(setTitleQuery(f.guildId, unrelated!.id, game.id))).rowCount, 0);

    await setDuration(f, game, 1_799_999);
    assert.ok(!(await read()).some(([id]) => id === 'set-next-faker'));
    await setDuration(f, game, 1_499_999);
    assert.ok(!(await read()).some(([id]) => id === 'set-mid-farm'));
    await setDuration(f, game, 1_500_000);
    assert.ok((await read()).some(([id]) => id === 'set-mid-farm'));
    await setDuration(f, game, 1_800_000);
    await patchStats(f, game, 1, { kills: 3, damageDealtToChampions: null });
    const incomplete = await read();
    assert.ok(
        !incomplete.some(([id]) =>
            ['set-bot-carry', 'set-losing-damage', 'set-deus-ex-machina'].includes(String(id))
        )
    );
    assert.ok(incomplete.some(([id]) => id === 'set-pentakill'));
    await patchStats(f, game, 1, { kills: null });
    assert.ok(!(await read()).some(([id]) => id === 'set-next-faker' || id === 'set-kill-deficit'));
    await patchStats(f, game, 0, { minionsKilled: 39, assists: 7 });
    await patchStats(f, game, 1, { kills: 4, neutralMinionsKilled: 39, damageDealtToChampions: 15 });
    await patchStats(f, game, 2, { minionsKilled: 299 });
    await patchStats(f, game, 3, { damageDealtToChampions: 39, assists: 11 });
    await patchStats(f, game, 4, { assists: 14 });
    await patchStats(f, game, 5, { kills: 5, pentaKills: 0 });
    await patchStats(f, game, 6, { damageDealtToChampions: 50 });
    assert.deepEqual(await read(), []);
    await patchStats(f, game, 5, { pentaKills: 1 });
    await f.db
        .update(schema.roflGameDataV1)
        .set({ resultStatus: 'conflicting', winnerReplayTeamId: null })
        .where(eq(schema.roflGameDataV1.roflMetadataId, game.roflMetadataId!));
    assert.deepEqual(await read(), []);
});

test('공무원은 양 세트에서 각각 이긴 동일 듀오만 수상하며 비공개 신원과 세트 선택을 보존한다', async (t) => {
    const f = await createGameFixture(t);
    const first = await f.createGame(f.db, 1);
    const second = await f.createGame(f.db, 2, f.match.id, 'b', { winnerSide: 'red' });
    for (const game of [first, second]) await patchStats(f, game, 3, { deaths: 1 });
    await patchStats(f, first, 3, { pentaKills: 0 });
    await finish(f);
    const [hidden] = await f.db
        .update(schema.users)
        .set({ publicProfile: false, publicRiotIds: false })
        .where(eq(schema.users.id, f.users[3]!.id))
        .returning({ publicId: schema.users.publicId });
    const detail = async (game: Game) =>
        (await getMatch(f.db, null, f.guildId, f.match.id, game.id, resolvers))!;
    const one = await detail(first);
    const two = await detail(second);
    assert.deepEqual(one.match.seriesTitle, two.match.seriesTitle);
    assert.equal(one.match.seriesTitle?.id, 'bo3-bot-duo');
    assert.deepEqual(
        one.match.seriesTitle?.recipients.map((p) => p.key),
        f.participants.slice(3, 5).map((p) => p.id)
    );
    const privatePlayer = one.match.seriesTitle!.recipients[0]!;
    assert.equal(privatePlayer.displayName, '비공개 사용자');
    assert.equal(privatePlayer.userId, hidden!.publicId);
    const player = (page: typeof one) =>
        page.game!.sides.flatMap((s) => s.players).find((p) => p.key === privatePlayer.key)!;
    assert.equal(player(one).riotId, null);
    assert.equal(
        player(one).titles.some((award) => award.id === 'set-pentakill'),
        false
    );
    assert.equal(
        player(two).titles.some((award) => award.id === 'set-pentakill'),
        true
    );
    const series = () => f.db.execute(seriesTitleQuery(f.guildId, f.match.id));
    await patchStats(f, second, 3, { deaths: 2 }); // Tied in set two, even though ahead across both sets.
    assert.equal((await series()).rowCount, 0);
    await patchStats(f, second, 3, { deaths: null });
    assert.equal((await series()).rowCount, 0);
    await patchStats(f, second, 3, { deaths: 1 });
    await finish(f, f.match.teamBId);
    assert.equal((await series()).rowCount, 0);
    await finish(f, f.match.teamAId, 5);
    assert.equal((await series()).rowCount, 0);
    await finish(f);
    await f.db.update(schema.matches).set({ status: 'ended_early' }).where(eq(schema.matches.id, f.match.id));
    assert.equal((await series()).rowCount, 0);
    assert.ok(player(await detail(second)).titles.length);
    await f.db.update(schema.scrims).set({ status: 'cancelled' }).where(eq(schema.scrims.id, f.scrimId));
    assert.deepEqual(player(await detail(second)).titles, []);
});

test('패승승의 5명만 삼꽉의 악마를 얻고 마지막 세트 취소·재등록으로 이전 칭호가 사라진다', async (t) => {
    const f = await createGameFixture(t);
    await f.createGame(f.db, 1, f.match.id, 'b');
    await f.createGame(f.db, 2);
    const last = await f.createGame(f.db, 3, f.match.id, 'b', { winnerSide: 'red' });
    await finish(f);
    const read = async () => (await getMatch(f.db, null, f.guildId, f.match.id, last.id, resolvers))!;
    const original = (await read()).match.seriesTitle;
    assert.equal(original?.id, 'bo3-reverse-sweep');
    assert.deepEqual(
        original?.recipients.map((p) => p.key),
        f.participants.slice(0, 5).map((p) => p.id)
    );
    await f.db
        .update(schema.games)
        .set({ status: 'cancelled', winnerSide: null })
        .where(eq(schema.games.id, last.id));
    assert.equal((await read()).match.seriesTitle, null);
    assert.equal((await f.db.execute(setTitleQuery(f.guildId, f.match.id, last.id))).rowCount, 0);
    const replacement = await f.createGame(f.db, 3, f.match.id, 'b');
    await finish(f, f.match.teamBId);
    const corrected = await read();
    assert.equal(corrected.game?.id, replacement.id);
    assert.equal(corrected.match.seriesTitle, null); // B won set 1 and 3, never a reverse sweep.
});
