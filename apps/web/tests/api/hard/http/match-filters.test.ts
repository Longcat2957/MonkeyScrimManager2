import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { unflatten } from 'devalue';
import { eq, sql } from 'drizzle-orm';
import type { MatchListItem } from '../../../../src/lib/features/matches/types.ts';
import type { RecordSeasonSelection } from '../../../../src/lib/features/seasons.ts';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { createHttpMatchFiltersFixture } from '../../support/http-match-filter-fixtures.ts';
import { createHttpFixture, HTTP_IDS } from '../../support/http.ts';

type Fixture = Awaited<ReturnType<typeof createHttpFixture>>;
type MatchPage = RecordSeasonSelection & {
    matches: MatchListItem[];
    total: number;
    player: string;
    champion: string;
    bestOf: number | null;
    empty: boolean;
    page: number;
    pageSize: number;
    q: string;
    from: string;
    to: string;
    filterError: string | null;
};
const path = '/g/' + HTTP_IDS.guild + '/matches';

async function data(f: Fixture, query: Record<string, string> = {}): Promise<MatchPage> {
    const params = new URLSearchParams(query).toString();
    const response = await f.request(path + '/__data.json' + (params ? '?' + params : ''));
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { nodes: ({ type: string; data?: unknown[] } | null)[] };
    for (const node of payload.nodes.toReversed()) {
        if (node?.type !== 'data' || !node.data) continue;
        const value = unflatten(node.data) as Record<string, unknown>;
        if (Array.isArray(value.matches) && typeof value.total === 'number') return value as MatchPage;
    }
    assert.fail('경기 목록의 페이지 자료가 없습니다.');
}

test('공개 경기 목록은 기본 전체 시즌이며 실제 ROFL의 미확인 시각과 과거 결과·MMR을 보존한다', async (t) => {
    const f = await createHttpMatchFiltersFixture(t);
    const originals = await f.db.select().from(schema.games).where(eq(schema.games.matchId, f.match.id));
    assert.equal(originals.length, 3);
    assert.ok(originals.every((game) => game.startedAt === null));
    const scores = await f.db.select().from(schema.userPositionMmr);
    const ledger = await f.db.select().from(schema.mmrLedgerEntries);
    const all = await data(f);
    assert.equal(all.selectedSeasonId, null);
    assert.equal(all.from, '');
    assert.equal(all.to, '');
    assert.equal(all.filterError, null);
    assert.equal(all.empty, false);
    assert.equal(all.total, 27);
    assert.equal(all.matches.length, 20);
    assert.equal(all.player, '');
    assert.equal(all.champion, '');
    assert.equal(all.bestOf, null);
    assert.deepEqual(
        new Set(all.seasons.map((season) => season.id)),
        new Set([f.currentSeason.id, f.previousSeason.id, f.emptySeason.id])
    );
    const previous = await data(f, { season: f.previousSeason.id.toUpperCase() });
    assert.equal(previous.selectedSeasonId, f.previousSeason.id);
    assert.equal(previous.total, 1);
    assert.equal(previous.matches[0]!.id, f.match.id);
    assert.equal(previous.matches[0]!.playedAt, null);
    assert.deepEqual([previous.matches[0]!.scoreA, previous.matches[0]!.scoreB], [2, 1]);
    const current = await data(f, { season: f.currentSeason.id });
    assert.equal(current.selectedSeasonId, f.currentSeason.id);
    assert.equal(current.total, 26);
    const emptySeason = await data(f, { season: f.emptySeason.id });
    assert.equal(emptySeason.selectedSeasonId, f.emptySeason.id);
    assert.equal(emptySeason.total, 0);
    assert.equal(emptySeason.empty, false);
    const tail = await data(f, { page: '2' });
    const archived = [...all.matches, ...tail.matches];
    assert.ok(archived.every((match) => match.status === 'completed'));
    const unknown = archived.filter((match) => match.playedAt === null);
    assert.deepEqual(
        unknown.map((match) => match.id),
        [f.match.id, f.cases.unknown!.id].sort()
    );
    const searched = await data(f, { q: '%_', season: f.previousSeason.id });
    assert.equal(searched.total, 0);
    assert.equal(searched.empty, false);
    await f.db
        .update(schema.mmrSeasons)
        .set({ endedAt: sql`greatest(now(), ${schema.mmrSeasons.startedAt})` })
        .where(eq(schema.mmrSeasons.id, f.currentSeason.id));
    assert.equal((await data(f)).total, 27);
    assert.deepEqual(
        await f.db.select().from(schema.games).where(eq(schema.games.matchId, f.match.id)),
        originals
    );
    assert.deepEqual(await f.db.select().from(schema.userPositionMmr), scores);
    assert.deepEqual(await f.db.select().from(schema.mmrLedgerEntries), ledger);
});

test('KST 시작·종료일과 최초 세트 시각으로 기록을 걸러 같은 시각의 페이지를 안정적으로 나눈다', async (t) => {
    const f = await createHttpMatchFiltersFixture(t);
    const filters = { season: f.currentSeason.id, from: '2026-10-24', to: '2026-10-24', q: '%_' };
    const first = await data(f, filters);
    const second = await data(f, { ...filters, page: '2' });
    assert.equal(first.from, filters.from);
    assert.equal(first.to, filters.to);
    assert.equal(first.q, filters.q);
    assert.equal(first.total, 23);
    assert.equal(first.matches.length, 20);
    assert.equal(second.matches.length, 3);
    assert.equal(second.page, 2);
    const sameTime = Array.from({ length: 21 }, (_, index) => f.cases['sameTime' + index]!.id).sort();
    assert.deepEqual(
        [...first.matches, ...second.matches].map((match) => match.id),
        [f.cases.atUpper!.id, ...sameTime, f.cases.atLower!.id]
    );
    assert.equal(
        [...first.matches, ...second.matches].find((match) => match.id === f.cases.sameTime0!.id)!.playedAt,
        '2026-10-24T03:00:00.000Z'
    );
    assert.equal((await data(f, { ...filters, page: '3' })).matches.length, 0);
    const fromOnly = await data(f, { season: f.currentSeason.id, from: filters.from });
    const toOnly = await data(f, { season: f.currentSeason.id, to: filters.to });
    assert.equal(fromOnly.total, 24);
    assert.equal(toOnly.total, 24);
    const nextDay = await data(f, { season: f.currentSeason.id, from: '2026-10-25', to: '2026-10-25' });
    assert.deepEqual(
        nextDay.matches.map((match) => match.id),
        [f.cases.afterUpper!.id]
    );
    const allSeasons = await data(f, { from: filters.from, to: filters.to });
    assert.equal(allSeasons.selectedSeasonId, null);
    assert.equal(allSeasons.total, first.total);
    const filteredEmpty = await data(f, { ...filters, from: '2026-11-01', to: '2026-11-01' });
    assert.equal(filteredEmpty.empty, false);
    assert.equal(filteredEmpty.total, 0);
    assert.deepEqual(filteredEmpty.matches, []);
    const series = { q: '결과 HTTP', player: 'playplayer1', champion: '가렌', bo: '3' };
    const searched = await data(f, series);
    assert.equal(searched.player, series.player);
    assert.equal(searched.champion, series.champion);
    assert.equal(searched.bestOf, 3);
    assert.deepEqual(
        searched.matches.map((match) => match.id),
        [f.match.id]
    );
    const [firstGame] = await f.db
        .select()
        .from(schema.games)
        .where(eq(schema.games.matchId, f.match.id))
        .orderBy(schema.games.gameNumber)
        .limit(1);
    assert.equal(searched.matches[0]!.matchedGameId, firstGame!.id);
    assert.equal((await data(f, { ...series, champion: '럭스' })).total, 0);
    assert.equal((await data(f, { ...series, champion: 'GaR' })).total, 1);
    assert.equal((await data(f, { ...series, bo: '1' })).total, 0);
    await f.db
        .update(schema.users)
        .set({ publicProfile: false })
        .where(eq(schema.users.id, f.identities[1]!.userId));
    assert.equal((await data(f, series)).total, 0);
    assert.equal((await data(f, { champion: '가렌' })).total, 1);
});

test('잘못된 날짜는 요청값과 수정 오류를 유지하고 명시 시즌의 형식·서버 경계를 먼저 검증한다', async (t) => {
    const f = await createHttpFixture(t);
    const [foreign] = await f.db
        .insert(schema.mmrSeasons)
        .values({ guildId: HTTP_IDS.otherGuild, name: '다른 서버 시즌' })
        .returning();
    for (const dates of [
        { from: '2026-02-30', to: '' },
        { from: '', to: '2026-13-01' },
        { from: '2026-10-25', to: '2026-10-24' },
        { from: '2026-1-1', to: '' }
    ]) {
        const result = await data(f, { ...dates, q: '찾던 내전', season: f.season.id, page: '2' });
        assert.equal(result.from, dates.from);
        assert.equal(result.to, dates.to);
        assert.equal(result.q, '찾던 내전');
        assert.equal(result.page, 2);
        assert.equal(result.selectedSeasonId, f.season.id);
        assert.equal(typeof result.filterError, 'string');
        assert.ok(result.filterError!.length > 0);
        assert.deepEqual(result.matches, []);
        assert.equal(result.total, 0);
        assert.equal(result.empty, false);
        assert.equal((await f.request(path + '?' + new URLSearchParams(dates))).status, 200);
    }
    assert.equal((await data(f, { season: '' })).selectedSeasonId, null);
    for (const season of ['all', 'not-a-season'])
        assert.equal(
            (await f.request(path + '?' + new URLSearchParams({ season, from: 'invalid' }))).status,
            400
        );
    for (const season of [foreign!.id, randomUUID()])
        assert.equal(
            (await f.request(path + '?' + new URLSearchParams({ season, from: 'invalid' }))).status,
            404
        );
    const empty = await data(f, { from: '2026-10-24', to: '2026-10-24' });
    assert.equal(empty.empty, true);
    assert.equal(empty.filterError, null);
    assert.equal(empty.selectedSeasonId, null);
    assert.deepEqual(empty.matches, []);
});
