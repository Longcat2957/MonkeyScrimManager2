import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { unflatten } from 'devalue';
import { eq, sql } from 'drizzle-orm';
import type { RecordSeasonSelection } from '../../../../src/lib/features/seasons.ts';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { createHttpRecordSeasonsFixture } from '../../support/http-record-seasons-fixtures.ts';
import { createHttpFixture, HTTP_IDS } from '../../support/http.ts';

type Fixture = Awaited<ReturnType<typeof createHttpFixture>>;
async function data<T>(f: Fixture, path: string, query = ''): Promise<T> {
    const response = await f.request(path + '/__data.json' + (query ? '?' + query : ''));
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { nodes: ({ type: string; data?: unknown[] } | null)[] };
    for (const node of payload.nodes.toReversed()) {
        if (node?.type !== 'data' || !node.data) continue;
        const result = unflatten(node.data) as Record<string, unknown>;
        if (Object.hasOwn(result, 'selectedSeasonId')) return result as T;
    }
    assert.fail('페이지의 시즌 선택 자료가 없습니다.');
}

test('공개 페이지와 추가 순위는 명시한 과거 시즌만 읽고 홈 운영 자료는 유지한다', async (t) => {
    const f = await createHttpRecordSeasonsFixture(t);
    type Player = RecordSeasonSelection & {
        overallGames: number;
        page: number;
        history: unknown[];
        position: string;
        mmr: { position: string; rating: number; games: number }[];
    };
    type Stats = RecordSeasonSelection & {
        empty: boolean;
        position?: string;
        minGames?: number;
        recent?: boolean;
        kpis?: { games: number };
    };
    type Home = RecordSeasonSelection & {
        nextScrim: { scrim: { id: string } } | null;
        activeScrims: unknown;
        recentMatches: unknown;
        ranking: {
            ok: boolean;
            value: { seasonName: string; positions: Record<string, { entries: unknown[] }> };
        };
    };
    const beforeScores = await f.db.select().from(schema.userPositionMmr);
    const current = await data<Player>(f, f.paths.player);
    assert.equal(current.selectedSeasonId, f.currentSeason.id);
    assert.equal(current.overallGames, 0);
    assert.equal(current.mmr.find((row) => row.position === 'top')!.rating, 1500);
    const past = await data<Player>(
        f,
        f.paths.player,
        'season=' + f.previousSeason.id + '&position=top&page=2'
    );
    assert.equal(past.selectedSeasonId, f.previousSeason.id);
    assert.equal(past.overallGames, 1);
    assert.equal(past.position, 'top');
    assert.equal(past.page, 2);
    assert.equal(past.history.length, 0);
    assert.equal(past.mmr.find((row) => row.position === 'top')!.rating, 1516);
    const currentStats = await data<Stats>(f, f.paths.stats);
    assert.equal(currentStats.empty, true);
    assert.equal(currentStats.seasons.length, 2);
    const stats = await data<Stats>(
        f,
        f.paths.stats,
        'season=' + f.previousSeason.id + '&position=top&min=1&recent=1'
    );
    assert.equal(stats.empty, false);
    assert.equal(stats.kpis!.games, 1);
    assert.equal(stats.position, 'top');
    assert.equal(stats.minGames, 1);
    assert.equal(stats.recent, true);
    const homeCurrent = await data<Home>(f, f.paths.home);
    const homePast = await data<Home>(f, f.paths.home, 'season=' + f.previousSeason.id);
    assert.equal(homeCurrent.nextScrim!.scrim.id, f.currentRecruit.id);
    assert.deepEqual(homePast.nextScrim, homeCurrent.nextScrim);
    assert.deepEqual(homePast.activeScrims, homeCurrent.activeScrims);
    assert.deepEqual(homePast.recentMatches, homeCurrent.recentMatches);
    assert.equal(homePast.ranking.value.seasonName, f.previousSeason.name);
    assert.equal(homePast.ranking.value.positions.top!.entries.length, 2);
    assert.equal(homeCurrent.ranking.value.positions.top!.entries.length, 0);
    const page = await f.request(
        f.paths.ranking + '?season=' + f.previousSeason.id + '&position=top&offset=1'
    );
    assert.equal(page.status, 200);
    const ranking = await page.json();
    assert.equal(ranking.entries.length, 1);
    assert.equal(ranking.entries[0].rank, 2);
    assert.deepEqual(await f.db.select().from(schema.userPositionMmr), beforeScores);
});

test('종료 시즌의 빈 상태에서도 선택을 유지하고 잘못된 시즌·서버 경계를 거절한다', async (t) => {
    const f = await createHttpFixture(t);
    await f.db
        .update(schema.mmrSeasons)
        .set({ endedAt: sql`greatest(now(), ${schema.mmrSeasons.startedAt})` })
        .where(eq(schema.mmrSeasons.id, f.season.id));
    const [foreign] = await f.db
        .insert(schema.mmrSeasons)
        .values({ guildId: HTTP_IDS.otherGuild, name: '다른 서버 시즌' })
        .returning();
    const paths = [
        '/g/' + HTTP_IDS.guild,
        '/g/' + HTTP_IDS.guild + '/stats',
        '/g/' + HTTP_IDS.guild + '/players/' + HTTP_IDS.member
    ];
    for (const path of paths) {
        const selected = await data<RecordSeasonSelection>(f, path, 'season=' + f.season.id);
        assert.equal(selected.selectedSeasonId, f.season.id);
        assert.equal(selected.seasons.length, 1);
        for (const value of ['', 'all', 'not-a-uuid'])
            assert.equal((await f.request(path + '?season=' + value)).status, 400);
        for (const value of [foreign!.id, randomUUID()])
            assert.equal((await f.request(path + '?season=' + value)).status, 404);
    }
    const ranking = '/g/' + HTTP_IDS.guild + '/ranking?position=top&offset=0';
    assert.equal((await f.request(ranking)).status, 404);
    const empty = await f.request(ranking + '&season=' + f.season.id);
    assert.equal(empty.status, 200);
    assert.deepEqual(await empty.json(), { entries: [], me: null, hasMore: false });
    assert.equal((await f.request(ranking + '&season=' + foreign!.id)).status, 404);
    assert.equal((await f.request(ranking + '&season=all')).status, 400);
});
