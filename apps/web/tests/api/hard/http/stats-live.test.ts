import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { unflatten } from 'devalue';
import { eq, sql } from 'drizzle-orm';
import {
    isStatsSnapshot,
    normalizeStatsFilters,
    statsRequestKey,
    type StatsSnapshot
} from '../../../../src/lib/features/stats/types.ts';
import { withdrawAccount } from '../../../../src/lib/server/accounts/privacy.ts';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { createHttpRecordSeasonsFixture } from '../../support/http-record-seasons-fixtures.ts';
import { createHttpFixture, HTTP_IDS } from '../../support/http.ts';

type Fixture = Awaited<ReturnType<typeof createHttpFixture>>;
const path = '/g/' + HTTP_IDS.guild + '/stats';

async function live(f: Fixture, query = ''): Promise<StatsSnapshot> {
    const response = await f.request(path + '/live' + (query ? '?' + query : ''));
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    const value: unknown = await response.json();
    assert.equal(isStatsSnapshot(value), true);
    assert.ok(isStatsSnapshot(value));
    assert.equal(value.guildId, HTTP_IDS.guild);
    assert.equal(
        value.requestKey,
        statsRequestKey(HTTP_IDS.guild, normalizeStatsFilters(new URLSearchParams(query)))
    );
    return value;
}

async function ssrData(f: Fixture, query = ''): Promise<StatsSnapshot> {
    const response = await f.request(path + '/__data.json' + (query ? '?' + query : ''));
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { nodes: ({ type: string; data?: unknown[] } | null)[] };
    for (const node of payload.nodes.toReversed()) {
        if (node?.type !== 'data' || !node.data) continue;
        const value = unflatten(node.data);
        if (isStatsSnapshot(value)) return value;
    }
    assert.fail('초기 통계 snapshot이 없습니다.');
}

test('통계 JSON은 로그인 없이 SSR과 같은 시즌·필터·문맥·검증 가능한 수치를 반환한다', async (t) => {
    const f = await createHttpRecordSeasonsFixture(t, { games: 3 });
    const scores = await f.db.select().from(schema.userPositionMmr);
    const before = await f.db.select().from(schema.gameParticipants);
    for (const query of ['', 'season=' + f.previousSeason.id + '&position=top&min=1&recent=1']) {
        const value = await live(f, query);
        assert.deepEqual(value, await ssrData(f, query));
        if (!query) {
            assert.equal(value.empty, true);
            assert.equal(value.selectedSeasonId, f.currentSeason.id);
        } else {
            assert.equal(value.empty, false);
            if (value.empty) assert.fail('과거 실제 결과가 비었습니다.');
            assert.equal(value.selectedSeasonId, f.previousSeason.id);
            assert.equal(value.kpis.games, 3);
            assert.equal(value.kpis.players, 10);
            assert.equal(value.leaderboard.length, 2);
            assert.equal(value.position, 'top');
            assert.equal(value.recent, true);
            assert.equal(value.minGames, 1);
            assert.equal(value.showAchievements, false);
            assert.deepEqual(value.achievements, []);
        }
    }
    const query = 'season=' + f.previousSeason.id + '&min=1';
    assert.deepEqual(await live(f, query + '&unused=1&page=20'), await live(f, query));
    assert.deepEqual(await f.db.select().from(schema.userPositionMmr), scores);
    assert.deepEqual(await f.db.select().from(schema.gameParticipants), before);
});

test('새 통계 JSON도 공개 설정과 탈퇴를 즉시 반영하고 동일한 공개 안정 키와 과거 결과·MMR을 유지한다', async (t) => {
    const f = await createHttpRecordSeasonsFixture(t, { games: 3 });
    const query = 'season=' + f.previousSeason.id + '&min=1';
    const first = await live(f, query);
    assert.equal(first.empty, false);
    if (first.empty) assert.fail('실제 결과가 없습니다.');
    const [target] = await f.db.select().from(schema.users).where(eq(schema.users.id, HTTP_IDS.member));
    const identityKey = first.leaderboard.find((row) => row.userId === HTTP_IDS.member)!.identityKey;
    assert.equal(identityKey, target!.publicId);
    const scores = await f.db.select().from(schema.userPositionMmr);
    const originals = await f.db.select().from(schema.gameParticipants);
    await f.db
        .update(schema.users)
        .set({ publicProfile: false, publicRiotIds: false })
        .where(eq(schema.users.id, HTTP_IDS.member));
    const hidden = await live(f, query);
    assert.equal(hidden.empty, false);
    if (hidden.empty) assert.fail('비공개 처리로 결과를 잃었습니다.');
    const row = hidden.leaderboard.find((entry) => entry.identityKey === identityKey)!;
    assert.equal(row.userId, target!.publicId);
    assert.equal(row.displayName, '비공개 사용자');
    assert.equal(row.games, 3);
    for (const value of [
        HTTP_IDS.member,
        target!.username,
        f.identities[0]!.gameName,
        f.identities[0]!.puuid
    ])
        assert.equal(JSON.stringify(hidden).includes(value), false);
    await withdrawAccount(f.db, { userId: HTTP_IDS.member, isServiceAdmin: false }, { confirm: true });
    const withdrawn = await live(f, query);
    assert.equal(withdrawn.empty, false);
    if (withdrawn.empty) assert.fail('탈퇴 처리로 결과를 잃었습니다.');
    const after = withdrawn.leaderboard.find((entry) => entry.identityKey === identityKey)!;
    assert.equal(after.userId, target!.publicId);
    assert.equal(after.displayName, '탈퇴한 사용자');
    assert.equal(after.games, 3);
    assert.deepEqual(withdrawn.kpis, first.kpis);
    assert.deepEqual(await f.db.select().from(schema.userPositionMmr), scores);
    assert.deepEqual(await f.db.select().from(schema.gameParticipants), originals);
});

test('누락된 선별 상세는 nullable 수치로 유지하고 실제 조회 실패500 뒤 같은 조건의 정상 JSON으로 복구한다', async (t) => {
    const f = await createHttpRecordSeasonsFixture(t);
    const query = 'season=' + f.previousSeason.id + '&min=1';
    const scores = await f.db.select().from(schema.userPositionMmr);
    const [game] = await f.db.select().from(schema.games);
    // V1 선별 상세가 누락된 상태를 재현하며 공통 참가자·원본 귀속과 점수는 그대로 둔다.
    await f.db
        .delete(schema.roflParticipantDataV1)
        .where(eq(schema.roflParticipantDataV1.roflMetadataId, game!.roflMetadataId!));
    await f.db
        .delete(schema.roflGameDataV1)
        .where(eq(schema.roflGameDataV1.roflMetadataId, game!.roflMetadataId!));
    const value = await live(f, query);
    assert.equal(value.empty, false);
    if (value.empty) assert.fail('상세 누락을 경기 없음으로 바꿨습니다.');
    assert.equal(value.kpis.games, 1);
    assert.equal(value.kpis.averageDurationSec, null);
    assert.equal(value.kpis.killsPerMinute, null);
    assert.ok(value.leaderboard.every((row) => row.csPerMin === null && row.damagePerMin === null));
    await f.pool.query('ALTER TABLE game_participants RENAME TO fixture_unavailable_game_participants');
    try {
        const failure = await f.request(path + '/live?' + query);
        assert.equal(failure.status, 500);
        assert.match(failure.headers.get('cache-control') ?? '', /no-store/);
        assert.equal((await failure.text()).includes('fixture_unavailable_game_participants'), false);
    } finally {
        await f.pool.query('ALTER TABLE fixture_unavailable_game_participants RENAME TO game_participants');
    }
    assert.deepEqual(await live(f, query), value);
    assert.deepEqual(await f.db.select().from(schema.userPositionMmr), scores);
});

test('빈 시즌·정규화·시즌/서버 오류에도 공개 읽기와 no-store를 유지하며 운영 빌드에서 개발 자료를 제공하지 않는다', async (t) => {
    const f = await createHttpFixture(t);
    const [foreign] = await f.db
        .insert(schema.mmrSeasons)
        .values({ guildId: HTTP_IDS.otherGuild, name: '다른 서버 시즌' })
        .returning();
    const empty = await live(f, 'position=invalid&recent=2&min=1000');
    assert.equal(empty.empty, true);
    assert.equal(empty.position, 'all');
    assert.equal(empty.recent, false);
    assert.equal(empty.minGames, 50);
    assert.equal(
        f.upstreamCalls.some((url) => url.startsWith('https://discord.com/')),
        false
    );
    for (const [season, status] of [
        ['', 400],
        ['all', 400],
        ['not-a-season', 400],
        [foreign!.id, 404],
        [randomUUID(), 404]
    ] as const) {
        const response = await f.request(path + '/live?season=' + season);
        assert.equal(response.status, status);
        assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    }
    await f.db
        .update(schema.mmrSeasons)
        .set({ endedAt: sql`greatest(now(), ${schema.mmrSeasons.startedAt})` })
        .where(eq(schema.mmrSeasons.id, f.season.id));
    const ended = await live(f);
    assert.equal(ended.empty, true);
    assert.equal(ended.selectedSeasonId, null);
    assert.equal(ended.seasons.length, 1);
    assert.equal((await f.request('/g/devGuild001/stats/live')).status, 404);
    await f.db.update(schema.guilds).set({ isActive: false }).where(eq(schema.guilds.id, HTTP_IDS.guild));
    const inactive = await f.request(path + '/live');
    assert.equal(inactive.status, 404);
    assert.match(inactive.headers.get('cache-control') ?? '', /no-store/);
});
