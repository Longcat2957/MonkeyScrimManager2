import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import {
    isStatsSnapshot,
    normalizeStatsFilters,
    statsRequestKey,
    statsViewKey
} from '../../../../src/lib/features/stats/types.ts';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { getGuildStatsSnapshot } from '../../../../src/lib/server/stats/snapshot.ts';
import { champion, createGameFixture, errorCode } from '../../support/domain-fixtures.ts';

const filters = (query = '') => normalizeStatsFilters(new URLSearchParams(query));

test('통계 요청 문맥은 기존 기본값을 보정하고 무관한 쿼리·순서와 실제 선택 시즌을 구분한다', () => {
    const defaults = filters();
    assert.deepEqual(defaults, { seasonId: null, position: 'all', minGames: 5 });
    assert.deepEqual(filters('position=unknown&recent=true&min=0'), defaults);
    assert.equal(filters('min=-10').minGames, 1);
    assert.equal(filters('min=100').minGames, 50);
    assert.equal(filters('min=2.9').minGames, 2);
    assert.equal(filters('min=NaN').minGames, 5);
    const request = filters('season=chosen&position=top&recent=1&min=1');
    const reordered = filters('keep=ignored&min=1&position=top&season=chosen');
    assert.equal(statsRequestKey('guild', request), statsRequestKey('guild', reordered));
    assert.notEqual(statsRequestKey('guild', request), statsRequestKey('other', request));
    assert.notEqual(statsRequestKey('guild', request), statsRequestKey('guild', defaults));
    const view = {
        guildId: 'guild',
        selectedSeasonId: 'actual',
        position: 'top' as const,
        minGames: 1
    };
    assert.equal(statsViewKey(view), statsViewKey({ ...view }));
    assert.notEqual(statsViewKey(view), statsViewKey({ ...view, selectedSeasonId: 'next' }));
    assert.equal(isStatsSnapshot(null), false);
    assert.equal(isStatsSnapshot({ ...view, empty: false }), false);
});

test('공통 통계는 실제 Game 표본과 포지션 지표를 구분하고 갱신 전후 개인정보 식별 키를 보존한다', async (t) => {
    const f = await createGameFixture(t);
    const first = await f.createGame(f.db, 1);
    await f.db.insert(schema.userPositionMmr).values({
        userId: f.manager.userId,
        seasonId: f.season.id,
        position: 'support',
        mmr: 2999
    });
    const unapplied = await getGuildStatsSnapshot(f.db, null, f.guildId, filters('min=1'), { champion });
    assert.ok(!unapplied.empty);
    assert.equal(unapplied.leaderboard.length, 10);
    assert.ok(unapplied.leaderboard.every((row) => row.mmr === null));
    await f.apply(first.id);
    const second = await f.createGame(f.db, 2, f.match.id, 'b', {
        missingStats: true,
        durationMs: 1_800_000
    });
    await f.apply(second.id);
    const selected = filters('position=top&recent=1&min=1');
    const read = () => getGuildStatsSnapshot(f.db, null, f.guildId, selected, { champion });
    const beforeScores = await f.ratings();
    const publicStats = await read();
    assert.ok(!publicStats.empty);
    assert.equal(isStatsSnapshot(publicStats), true);
    assert.equal(publicStats.kpis.games, 2);
    assert.equal(publicStats.kpis.players, 10);
    assert.equal(publicStats.kpis.averageDurationSec, 1500);
    assert.equal(publicStats.kpis.killsPerMinute, 0.9);
    assert.equal(publicStats.position, 'top');
    assert.equal(publicStats.leaderboard.length, 2);
    const topScores = beforeScores.filter((entry) => entry.position === 'top');
    assert.deepEqual(
        publicStats.leaderboard.map((row) => row.mmr),
        topScores.map((entry) => entry.mmr).sort((a, b) => b - a)
    );
    for (const row of publicStats.leaderboard) {
        assert.equal(row.mmr, topScores.find((entry) => entry.userId === row.userId)!.mmr);
    }
    const overall = await getGuildStatsSnapshot(f.db, null, f.guildId, filters('min=1'), { champion });
    assert.ok(!overall.empty);
    assert.equal(
        overall.leaderboard.find((row) => row.userId === f.manager.userId)!.mmr,
        topScores.find((entry) => entry.userId === f.manager.userId)!.mmr
    );
    const titles = publicStats.achievements.find((group) => group.id === 'season-champion-pool')!;
    assert.equal(titles.entries.filter((entry) => entry.rank === 1).length, 5);
    assert.ok(titles.entries.every((entry) => entry.tied));
    const filtered = await getGuildStatsSnapshot(f.db, null, f.guildId, filters('position=mid&min=50'), {
        champion
    });
    assert.ok(!filtered.empty);
    assert.deepEqual(filtered.leaderboard, []);
    assert.deepEqual(filtered.achievements, publicStats.achievements);
    assert.equal(publicStats.requestKey, statsRequestKey(f.guildId, selected));
    const publicPlayer = publicStats.leaderboard.find((row) => row.userId === f.manager.userId)!;
    assert.ok(publicPlayer.identityKey);
    await f.db
        .update(schema.users)
        .set({ publicProfile: false, publicRiotIds: false })
        .where(eq(schema.users.id, f.manager.userId));
    const privateStats = await read();
    assert.ok(!privateStats.empty);
    assert.equal(isStatsSnapshot(privateStats), true);
    const hidden = privateStats.leaderboard.find((row) => row.identityKey === publicPlayer.identityKey)!;
    assert.equal(hidden.userId, publicPlayer.identityKey);
    assert.notEqual(hidden.userId, f.manager.userId);
    assert.equal(hidden.displayName, '비공개 사용자');
    assert.equal(hidden.iconUrl, null);
    assert.equal(hidden.mmr, publicPlayer.mmr);
    assert.equal(isStatsSnapshot({ ...privateStats, leaderboard: [{ ...hidden, mmr: undefined }] }), false);
    assert.deepEqual(privateStats.kpis, publicStats.kpis);
    const privateEntry = privateStats.achievements
        .flatMap((group) => group.entries)
        .find((entry) => entry.userId === hidden.userId);
    assert.equal(privateEntry?.displayName, hidden.displayName);
    assert.equal(privateEntry?.iconUrl, null);
    assert.ok(!JSON.stringify(privateStats.achievements).includes(f.manager.userId));
    assert.equal(statsViewKey(privateStats), statsViewKey(publicStats));
    assert.deepEqual(await f.ratings(), beforeScores);
    assert.equal(isStatsSnapshot({ ...privateStats, leaderboard: [{}] }), false);
    assert.equal(isStatsSnapshot({ ...privateStats, champions: [{}] }), false);
    assert.equal(isStatsSnapshot({ ...privateStats, kpis: { ...privateStats.kpis, games: NaN } }), false);
    assert.equal(isStatsSnapshot({ ...privateStats, position: 'mid' }), false);
    assert.equal(isStatsSnapshot({ ...privateStats, minGames: 2 }), false);
    assert.equal(
        isStatsSnapshot({
            ...privateStats,
            achievements: [{ ...titles, entries: [{ ...titles.entries[0], rank: 0 }] }]
        }),
        false
    );
});

test('빈 통계도 정규화된 조건을 유지하고 현재·과거·없는 시즌과 공개 서버 경계를 보존한다', async (t) => {
    const f = await createGameFixture(t);
    await f.createGame(f.db, 1);
    await f.db
        .update(schema.mmrSeasons)
        .set({ endedAt: new Date() })
        .where(eq(schema.mmrSeasons.id, f.season.id));
    const [current] = await f.db
        .insert(schema.mmrSeasons)
        .values({ guildId: f.guildId, name: '빈 현재 시즌' })
        .returning();
    const selected = filters('position=mid&recent=1&min=100');
    const empty = await getGuildStatsSnapshot(f.db, null, f.guildId, selected, { champion });
    assert.equal(empty.empty, true);
    assert.equal(empty.selectedSeasonId, current!.id);
    assert.equal(empty.position, 'mid');
    assert.equal(empty.minGames, 50);
    assert.equal(empty.requestKey, statsRequestKey(f.guildId, selected));
    assert.equal(isStatsSnapshot(empty), true);
    const past = await getGuildStatsSnapshot(
        f.db,
        null,
        f.guildId,
        { ...selected, seasonId: f.season.id },
        { champion }
    );
    assert.equal(past.empty, false);
    assert.equal(past.selectedSeasonId, f.season.id);
    for (const seasonId of [randomUUID(), ''])
        await assert.rejects(
            getGuildStatsSnapshot(f.db, null, f.guildId, { ...selected, seasonId }, { champion }),
            errorCode(seasonId ? 'NOT_FOUND' : 'INVALID_INPUT')
        );
    await assert.rejects(
        getGuildStatsSnapshot(
            f.db,
            null,
            f.otherGuildId,
            { ...selected, seasonId: f.season.id },
            { champion }
        ),
        errorCode('NOT_FOUND')
    );
    await f.db.update(schema.guilds).set({ isActive: false }).where(eq(schema.guilds.id, f.guildId));
    await assert.rejects(
        getGuildStatsSnapshot(f.db, null, f.guildId, selected, { champion }),
        errorCode('NOT_FOUND')
    );
});

test('선별 세부 자료 없는 실제 완료 Game은 통계 수치와 출전자·업적을 합성하지 않는다', async (t) => {
    const f = await createGameFixture(t);
    const [metadata] = await f.db
        .insert(schema.roflMetadata)
        .values({
            fileSha256: randomBytes(32).toString('hex'),
            fileSizeBytes: 100,
            formatVersion: 2,
            gameVersion: '26.21',
            projectionVersion: 1
        })
        .returning();
    await f.db.insert(schema.games).values({
        scrimId: f.scrimId,
        matchId: f.match.id,
        gameNumber: 1,
        blueTeamSlot: 'a',
        status: 'completed',
        winnerSide: 'blue',
        roflMetadataId: metadata!.id
    });
    const result = await getGuildStatsSnapshot(f.db, null, f.guildId, filters(), { champion });
    assert.ok(!result.empty);
    assert.equal(isStatsSnapshot(result), true);
    assert.deepEqual(result.kpis, {
        games: 1,
        players: 0,
        averageDurationSec: null,
        killsPerMinute: null,
        kda: null,
        champions: null
    });
    assert.deepEqual(result.leaderboard, []);
    assert.deepEqual(result.champions, []);
    assert.deepEqual(result.achievements, []);
});

test('개발 미리보기는 같은 시즌 칭호 계약을 사용하고 없는 시즌을 만들지 않는다', async () => {
    const selected = filters('position=top&min=1');
    const demo = await getGuildStatsSnapshot(null, null, 'devGuild001', selected, {
        preview: true,
        champion
    });
    assert.ok(!demo.empty);
    assert.equal(new Set(demo.achievements.map((group) => group.titleId)).size, 15);
    assert.ok(demo.leaderboard.every((row) => row.iconUrl?.startsWith('https://cdn.discordapp.com/')));
    assert.equal(isStatsSnapshot(demo), true);
    const all = await getGuildStatsSnapshot(null, null, 'devGuild001', filters('min=1'), {
        preview: true,
        champion
    });
    assert.ok(!all.empty);
    assert.ok(all.leaderboard.length > 20);
    const points = all.leaderboard.map((row) => row.mmr!);
    assert.deepEqual(
        points,
        [...points].sort((a, b) => b - a)
    );
    assert.equal(demo.leaderboard.find((row) => row.userId === 'u07')!.mmr, 1560);
    assert.equal(all.leaderboard.find((row) => row.userId === 'u07')!.mmr, 1702);
    assert.deepEqual(
        all.leaderboard.filter((row) => row.mmr === 1702).map((row) => row.userId),
        ['devUser001', 'u07', 'u11', 'u12']
    );
    assert.deepEqual(demo.seasons, []);
    const empty = await getGuildStatsSnapshot(null, null, 'devGuild002', selected, {
        preview: true,
        champion
    });
    assert.equal(empty.empty, true);
    assert.equal(empty.position, 'top');
    assert.equal(empty.minGames, 1);
    assert.equal(isStatsSnapshot(empty), true);
    await assert.rejects(
        getGuildStatsSnapshot(
            null,
            null,
            'devGuild001',
            { ...selected, seasonId: randomUUID() },
            { preview: true, champion }
        ),
        errorCode('NOT_FOUND')
    );
});
