import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { eq, notInArray } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { enqueueAuctionJobs } from '../../../../src/lib/server/riot/auction-cache.ts';
import { auctionRankSeason, AUCTION_FRESH_MS } from '../../../../src/lib/server/riot/auction-season.ts';
import { processNextAuctionJob, type AuctionRiot } from '../../../../src/lib/server/riot/auction-worker.ts';
import { RiotError } from '../../../../src/lib/server/riot/errors.ts';
import { createFormationFixture } from '../../support/domain-fixtures.ts';

async function fixture(t: TestContext, count = 1) {
    const f = await createFormationFixture(t, 2, 'auction');
    const accounts = f.accounts.slice(0, count);
    await f.db
        .update(schema.users)
        .set({ publicRiotIds: false })
        .where(
            notInArray(
                schema.users.id,
                f.users.slice(0, count).map((user) => user.id)
            )
        );
    await f.db.update(schema.riotAccounts).set({ platform: 'kr', platformCheckedAt: new Date() });
    const enqueue = () => f.db.transaction((tx) => enqueueAuctionJobs(tx, f.scrimId));
    await enqueue();
    const riot: AuctionRiot = {
        async getActiveRegion() {
            throw new Error('예상하지 않은 플랫폼 조회');
        },
        async getLeagueEntriesByPuuid() {
            throw new Error('예상하지 않은 랭크 조회');
        },
        async getSoloMatchIds() {
            throw new Error('예상하지 않은 경기 목록 조회');
        },
        async getSoloMatchParticipants() {
            throw new Error('예상하지 않은 경기 상세 조회');
        }
    };
    return {
        db: f.db,
        accounts,
        riot,
        enqueue,
        run: (signal?: AbortSignal) => processNextAuctionJob(f.db, riot, signal)
    };
}

const rank = { tier: 'GOLD', rank: 'I', leaguePoints: 15 };
const entry = (puuid: string) => ({ puuid, ...rank, queueType: 'RANKED_SOLO_5x5', wins: 2, losses: 4 });

test('참가자 전원의 랭크를 먼저 저장하고 429 후 경기 상세를 재사용해 동률을 최근순으로 집계한다', async (t) => {
    const f = await fixture(t, 2);
    const [a, b] = f.accounts;
    await f.db
        .update(schema.riotAccounts)
        .set({ platform: '폐기된 지역' })
        .where(eq(schema.riotAccounts.id, a!.id));
    let regions = 0,
        ranks = 0,
        limited = false;
    const fetched: string[] = [];
    const played = [8, 9, 9, 8, 10, 11, 12];
    const ids = played.map((_, i) => `KR_${i + 1}`);
    f.riot.getActiveRegion = async (puuid, region, background) => {
        regions++;
        assert.equal(puuid, a!.puuid);
        assert.equal(region, undefined);
        assert.equal(background, true);
        return { puuid, game: 'lol', region: 'KR' };
    };
    f.riot.getLeagueEntriesByPuuid = async (puuid, platform, background) => {
        ranks++;
        assert.equal(background, true);
        assert.equal(platform, 'kr');
        return [{ ...entry(puuid), tier: 'MASTER', queueType: 'RANKED_FLEX_SR' }, entry(puuid)];
    };
    const listed = new Set<string>();
    f.riot.getSoloMatchIds = async (puuid) => {
        assert.ok(!listed.has(puuid), '429 뒤에는 목록이 아니라 미수집 상세부터 재개해야 한다');
        listed.add(puuid);
        assert.equal(ranks, 2);
        return ids;
    };
    f.riot.getSoloMatchParticipants = async (id) => {
        fetched.push(id);
        if (id === ids[1] && !limited) {
            limited = true;
            throw new RiotError('RATE_LIMITED', '대기', { retryAfterSeconds: 120 });
        }
        const championId = played[ids.indexOf(id)]!;
        return [
            { puuid: a!.puuid, championId },
            { puuid: b!.puuid, championId },
            { puuid: '비대상', championId: 99 }
        ];
    };
    for (let i = 0; !limited && i < 5; i++) assert.equal(await f.run(), true);
    assert.equal(regions, 1);
    assert.equal(limited, true);
    const partial = await f.db.select().from(schema.riotAuctionCache);
    assert.equal(partial.length, 2);
    for (const row of partial) {
        assert.deepEqual(row.currentRank, rank);
        assert.ok(row.rankFetchedAt);
        assert.equal(row.matchesFetchedAt, null);
    }
    const jobs = await f.db.select().from(schema.riotAuctionJobs);
    assert.equal(jobs.filter((job) => job.matchDueAt!.getTime() >= Date.now() + 100_000).length, 1);
    assert.ok(jobs.every((job) => job.matchAttempts === 0));
    assert.deepEqual(jobs.find((job) => job.matchIds)?.matchIds, ids);
    assert.equal((await f.db.select().from(schema.riotAuctionMatches)).length, 2);
    assert.equal(await f.run(), true);
    assert.equal(await f.run(), false);
    await f.db.update(schema.riotAuctionJobs).set({ matchDueAt: new Date(0) });
    assert.equal(await f.run(), true);
    assert.equal(await f.run(), false);
    const summaries = await f.db.select().from(schema.riotAuctionCache);
    for (const row of summaries) {
        assert.equal(row.matchCount, 7);
        assert.deepEqual(row.champions, [
            { championId: 8, count: 2 },
            { championId: 9, count: 2 },
            { championId: 10, count: 1 }
        ]);
        assert.ok(row.matchesFetchedAt);
    }
    assert.deepEqual(fetched, [ids[0], ids[1], ...ids.slice(1)]);
    await f.enqueue();
    assert.equal(await f.run(), false);
});

test('랭크 429 중에도 경기 요약을 저장하고 재시도에서는 랭크만 갱신한다', async (t) => {
    const f = await fixture(t);
    const started = Date.now();
    f.riot.getLeagueEntriesByPuuid = async () => {
        throw new RiotError('RATE_LIMITED', '랭크 제한', { retryAfterSeconds: 120 });
    };
    f.riot.getSoloMatchIds = async () => ['KR_101'];
    f.riot.getSoloMatchParticipants = async () => [{ puuid: f.accounts[0]!.puuid, championId: 22 }];
    assert.equal(await f.run(), true);
    assert.equal(await f.run(), true);
    const [cache] = await f.db.select().from(schema.riotAuctionCache);
    assert.deepEqual(cache!.champions, [{ championId: 22, count: 1 }]);
    assert.equal(cache!.rankFetchedAt, null);
    const [job] = await f.db.select().from(schema.riotAuctionJobs);
    assert.ok(job!.rankDueAt!.getTime() >= started + 120_000);
    assert.equal(job!.rankAttempts, 0);
    f.riot.getLeagueEntriesByPuuid = async (puuid) => [entry(puuid)];
    f.riot.getSoloMatchIds = async () => assert.fail('최신 경기 목록을 다시 조회함');
    await f.db.update(schema.riotAuctionJobs).set({ rankDueAt: new Date(0) });
    assert.equal(await f.run(), true);
    assert.deepEqual((await f.db.select().from(schema.riotAuctionCache))[0]!.currentRank, rank);
    assert.equal(await f.run(), false);
});

test('폐기할 작업이 앞에 있어도 같은 호출에서 다음 참가자의 랭크를 저장한다', async (t) => {
    const f = await fixture(t, 2);
    const [removed, active] = f.accounts;
    await f.db
        .delete(schema.guildRiotAccounts)
        .where(eq(schema.guildRiotAccounts.riotAccountId, removed!.id));
    await f.db
        .update(schema.riotAuctionJobs)
        .set({ availableAt: new Date(0) })
        .where(eq(schema.riotAuctionJobs.accountId, removed!.id));
    f.riot.getLeagueEntriesByPuuid = async (puuid) => [entry(puuid)];
    assert.equal(await f.run(), true);
    const [cache] = await f.db.select().from(schema.riotAuctionCache);
    assert.equal(cache!.accountId, active!.id);
    assert.deepEqual(cache!.currentRank, rank);
});

test('마지막 랭크 재시도가 실패해도 이전 랭크는 보존하고 성공한 빈 경기 목록은 저장한다', async (t) => {
    const f = await fixture(t);
    const accountId = f.accounts[0]!.id;
    const previous = new Date(1000);
    await f.db
        .insert(schema.riotAuctionCache)
        .values({ accountId, currentRank: rank, rankFetchedAt: previous });
    await f.db.update(schema.riotAuctionJobs).set({ rankAttempts: 4 });
    f.riot.getLeagueEntriesByPuuid = async () => {
        throw new RiotError('TIMEOUT', '응답 없음');
    };
    f.riot.getSoloMatchIds = async () => [];
    assert.equal(await f.run(), true);
    assert.equal(await f.run(), true);
    assert.equal(await f.run(), false);
    const [row] = await f.db.select().from(schema.riotAuctionCache);
    assert.deepEqual(row!.currentRank, rank);
    assert.equal(row!.rankFetchedAt?.getTime(), previous.getTime());
    assert.equal(row!.matchCount, 0);
    assert.deepEqual(row!.champions, []);
    assert.ok(row!.matchesFetchedAt);
    assert.deepEqual(await f.db.select().from(schema.riotAuctionJobs), []);
});

test('호출 도중 연결이 해제되면 결과를 저장하지 않고 재시작 후 작업을 폐기한다', async (t) => {
    const f = await fixture(t);
    const account = f.accounts[0]!;
    f.riot.getLeagueEntriesByPuuid = async (puuid) => {
        await f.db
            .delete(schema.guildRiotAccounts)
            .where(eq(schema.guildRiotAccounts.riotAccountId, account.id));
        return [entry(puuid)];
    };
    assert.equal(await f.run(AbortSignal.abort()), false);
    assert.equal(await f.run(), true);
    assert.deepEqual(await f.db.select().from(schema.riotAuctionCache), []);
    await f.db.update(schema.riotAuctionJobs).set({ availableAt: new Date(0) });
    assert.equal(await f.run(), false);
    assert.deepEqual(await f.db.select().from(schema.riotAuctionJobs), []);
});

test('관측 최고는 강등·배치 전에도 유지하고 같은 단계 LP 상승만 반영한다', async (t) => {
    const f = await fixture(t);
    // 계절 매핑 갱신 여부와 무관하게 실제로 공지된 시즌의 비교 경로를 검증한다.
    t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-15T00:00:00Z') });
    const account = f.accounts[0]!;
    f.riot.getSoloMatchIds = async () => [];
    const season = auctionRankSeason('kr')!;
    const saved = async () =>
        (
            await f.db
                .select()
                .from(schema.riotAuctionPeaks)
                .where(eq(schema.riotAuctionPeaks.season, season))
        )[0]!.peak;
    for (const [current, peak] of [
        [rank, rank],
        [{ ...rank, rank: 'IV', leaguePoints: 99 }, rank],
        [null, rank],
        [
            { ...rank, leaguePoints: 20 },
            { ...rank, leaguePoints: 20 }
        ],
        [
            { ...rank, tier: 'PLATINUM', rank: 'IV', leaguePoints: 0 },
            { ...rank, tier: 'PLATINUM', rank: 'IV', leaguePoints: 0 }
        ]
    ] as const) {
        await f.db
            .update(schema.riotAuctionCache)
            .set({ rankFetchedAt: new Date(0), matchesFetchedAt: new Date('2026-11-15T00:00:00Z') });
        await f.enqueue();
        f.riot.getLeagueEntriesByPuuid = async () =>
            current ? [{ ...entry(account.puuid), ...current }] : [];
        assert.equal(await f.run(), true);
        assert.deepEqual(await saved(), peak);
        assert.deepEqual((await f.db.select().from(schema.riotAuctionCache))[0]!.currentRank, current);
    }
});

test('키 없음·지원하지 않는 플랫폼은 기본 KR로 대체하거나 무한 재시도하지 않는다', async (t) => {
    const f = await fixture(t, 2);
    await f.db.update(schema.riotAccounts).set({ platform: null });
    f.riot.getActiveRegion = async (puuid) => {
        if (puuid === f.accounts[0]!.puuid) throw new RiotError('NOT_CONFIGURED', '키 없음');
        return { puuid, game: 'lol', region: 'unknown' };
    };
    assert.equal(await f.run(), true);
    assert.equal(await f.run(), true);
    assert.equal(await f.run(), false);
    assert.deepEqual(await f.db.select().from(schema.riotAuctionCache), []);
    assert.deepEqual(await f.db.select().from(schema.riotAuctionJobs), []);
});

test('종료 중 도착한 응답은 버리고, 새 프로세스는 점유 만료 후 조회를 재개한다', async (t) => {
    const f = await fixture(t);
    const controller = new AbortController();
    f.riot.getLeagueEntriesByPuuid = async (puuid) => {
        controller.abort();
        return [entry(puuid)];
    };
    assert.equal(await f.run(controller.signal), true);
    assert.deepEqual(await f.db.select().from(schema.riotAuctionCache), []);
    assert.equal(await f.run(), false);
    await f.db.update(schema.riotAuctionJobs).set({ availableAt: new Date(0) });
    f.riot.getLeagueEntriesByPuuid = async () => [];
    f.riot.getSoloMatchIds = async () => [];
    assert.equal(await f.run(), true);
    assert.equal(await f.run(), true);
    assert.equal(await f.run(), false);
    const [row] = await f.db.select().from(schema.riotAuctionCache);
    assert.equal(row!.currentRank, null);
    assert.ok(row!.rankFetchedAt);
    assert.deepEqual(row!.champions, []);
});

test('랭크의 긴 429는 경기 재시도 시각이나 마지막 실패와 독립이다', async (t) => {
    const f = await fixture(t);
    const now = Date.now();
    t.mock.timers.enable({ apis: ['Date'], now });
    let ranks = 0,
        matches = 0;
    f.riot.getLeagueEntriesByPuuid = async () => {
        ranks++;
        if (ranks === 1) throw new RiotError('RATE_LIMITED', 'League', { retryAfterSeconds: 600 });
        return [];
    };
    f.riot.getSoloMatchIds = async () => {
        matches++;
        if (matches === 1) throw new RiotError('RATE_LIMITED', 'Match', { retryAfterSeconds: 1 });
        throw new RiotError('TIMEOUT', 'Match');
    };
    await f.db.update(schema.riotAuctionJobs).set({ matchAttempts: 4 });
    assert.equal(await f.run(), true);
    assert.equal(await f.run(), true);
    const [deferred] = await f.db.select().from(schema.riotAuctionJobs);
    assert.equal(deferred!.rankDueAt!.getTime(), now + 600_000);
    assert.equal(deferred!.matchDueAt!.getTime(), now + 1_000);
    assert.equal(deferred!.rankAttempts, 0);
    assert.equal(deferred!.matchAttempts, 4);
    // DB 시각을 기다리지 않고 Match의 대기만 만료시킨다.
    await f.db.update(schema.riotAuctionJobs).set({ matchDueAt: new Date(0) });
    assert.equal(await f.run(), true);
    assert.equal(await f.run(), false);
    const [last] = await f.db.select().from(schema.riotAuctionJobs);
    assert.equal(last!.matchDueAt, null);
    assert.equal(last!.rankDueAt!.getTime(), now + 600_000);
    assert.equal(ranks, 1);
    await f.db.update(schema.riotAuctionJobs).set({ rankDueAt: new Date(0) });
    assert.equal(await f.run(), true);
    assert.equal(await f.run(), false);
    assert.equal(matches, 2);
    const [cache] = await f.db.select().from(schema.riotAuctionCache);
    assert.ok(cache!.rankFetchedAt);
    assert.equal(cache!.matchesFetchedAt, null);
});

test('활성 지역 확인이 만료되면 이전 지역의 랭크·관측 최고·경기 목록과 상세를 버린다', async (t) => {
    const f = await fixture(t);
    const { id: accountId, puuid } = f.accounts[0]!;
    const now = new Date();
    const expired = new Date(now.getTime() - AUCTION_FRESH_MS);
    await f.db.update(schema.riotAccounts).set({ platformCheckedAt: expired });
    await f.db.insert(schema.riotAuctionCache).values({
        accountId,
        rankSeason: auctionRankSeason('kr'),
        currentRank: rank,
        rankFetchedAt: now,
        matchCount: 1,
        champions: [{ championId: 11, count: 1 }],
        matchesFetchedAt: expired
    });
    await f.db.insert(schema.riotAuctionPeaks).values({ accountId, season: '2026-S3', peak: rank });
    await f.db.insert(schema.riotAuctionMatches).values({ accountId, matchId: 'KR_1', championId: 11 });
    await f.db.update(schema.riotAuctionJobs).set({ matchIds: ['KR_1'], matchAttempts: 4 });
    let regions = 0;
    f.riot.getActiveRegion = async () => {
        regions++;
        return { puuid, region: 'NA1', game: 'lol' };
    };
    assert.equal(await f.run(), true);
    assert.deepEqual(await f.db.select().from(schema.riotAuctionCache), []);
    assert.deepEqual(await f.db.select().from(schema.riotAuctionPeaks), []);
    assert.deepEqual(await f.db.select().from(schema.riotAuctionMatches), []);
    const [job] = await f.db.select().from(schema.riotAuctionJobs);
    assert.equal(job!.matchIds, null);
    assert.equal(job!.matchAttempts, 0);
    f.riot.getLeagueEntriesByPuuid = async (id, platform) => {
        assert.equal(platform, 'na1');
        return [{ ...entry(id), leaguePoints: -5 }];
    };
    f.riot.getSoloMatchIds = async (id, platform) => {
        assert.equal(id, puuid);
        assert.equal(platform, 'na1');
        return ['NA1_2'];
    };
    f.riot.getSoloMatchParticipants = async (matchId, id, platform) => {
        assert.equal(matchId, 'NA1_2');
        assert.equal(platform, 'na1');
        return [{ puuid: id, championId: 22 }];
    };
    assert.equal(await f.run(), true);
    assert.equal(await f.run(), true);
    const [cache] = await f.db.select().from(schema.riotAuctionCache);
    assert.deepEqual(cache!.currentRank, { ...rank, leaguePoints: -5 });
    assert.deepEqual(cache!.champions, [{ championId: 22, count: 1 }]);
    // 두 자료가 최신이면 지역 확인 시각만으로 Riot을 호출하지 않는다.
    await f.db.update(schema.riotAccounts).set({ platformCheckedAt: expired });
    await f.enqueue();
    assert.equal(await f.run(), false);
    assert.equal(regions, 1);
});

test('호출 창마다 Match 요청 한 건만 가능해도 다음 창은 저장한 목록의 첫 미수집 경기부터 진행한다', async (t) => {
    const f = await fixture(t);
    const { puuid } = f.accounts[0]!;
    const ids = ['KR_2', 'KR_1'];
    let budget = 1,
        lists = 0;
    const details: string[] = [];
    const request = () => {
        if (!budget) throw new RiotError('RATE_LIMITED', '경기 예산', { retryAfterSeconds: 60 });
        budget--;
    };
    f.riot.getLeagueEntriesByPuuid = async () => [];
    f.riot.getSoloMatchIds = async () => {
        request();
        lists++;
        return ids;
    };
    f.riot.getSoloMatchParticipants = async (id) => {
        request();
        details.push(id);
        return [{ puuid, championId: Number(id.slice(3)) }];
    };
    assert.equal(await f.run(), true);
    assert.equal(await f.run(), true);
    assert.deepEqual(details, []);
    for (const id of ids) {
        assert.equal(await f.run(), false);
        budget = 1;
        await f.db.update(schema.riotAuctionJobs).set({ matchDueAt: new Date(0) });
        assert.equal(await f.run(), true);
        assert.equal(details.at(-1), id);
    }
    assert.equal(lists, 1);
    assert.deepEqual(details, ids);
    const [cache] = await f.db.select().from(schema.riotAuctionCache);
    assert.deepEqual(cache!.champions, [
        { championId: 2, count: 1 },
        { championId: 1, count: 1 }
    ]);
    assert.equal(await f.run(), false);
});
