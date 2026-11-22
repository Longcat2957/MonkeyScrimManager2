import assert from 'node:assert/strict';
import test from 'node:test';
import { eq, inArray, notInArray } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import {
    cachedAuctionMatches,
    claimAuctionJob,
    enqueueAuctionJobs,
    releaseAuctionJob,
    renewAuctionJob,
    saveAuctionMatch,
    saveAuctionPlatform,
    saveAuctionRank,
    saveAuctionSummary
} from '../../../../src/lib/server/riot/auction-cache.ts';
import { AUCTION_FRESH_MS, auctionRankSeason } from '../../../../src/lib/server/riot/auction-season.ts';
import {
    closeRecruitment,
    createRegistration,
    reopenRecruitment
} from '../../../../src/lib/server/scrims/service.ts';
import {
    createFormationFixture,
    createRecruitmentFixture,
    errorCode
} from '../../support/domain-fixtures.ts';

test('모집 마감은 같은 길드의 선발·공개 계정만 예약하고 최근 성공한 자료는 건너뛴다', async (t) => {
    const f = await createRecruitmentFixture(t);
    const close = async () =>
        closeRecruitment(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    const jobs = () => f.db.select().from(schema.riotAuctionJobs);
    await assert.rejects(close(), errorCode('CONFLICT'));
    assert.equal((await jobs()).length, 0);
    for (let i = 0; i <= 10; ++i) {
        await createRegistration(
            f.db,
            f.actors[i]!,
            f.guildId,
            f.scrimId,
            {
                riotAccountId: i === 0 ? null : f.accounts[i]!.id,
                positions: ['mid']
            },
            f.access
        );
    }
    // 지정 계정이 다른 길드로 이동해도 같은 사용자의 새 대표 계정으로 바꾸지 않는다.
    await f.db
        .update(schema.guildRiotAccounts)
        .set({ guildId: f.otherGuildId })
        .where(eq(schema.guildRiotAccounts.riotAccountId, f.accounts[1]!.id));
    await f.db
        .update(schema.guildRiotAccounts)
        .set({ userId: f.users[1]!.id })
        .where(eq(schema.guildRiotAccounts.riotAccountId, f.accounts[11]!.id));
    await f.db.update(schema.users).set({ publicRiotIds: false }).where(eq(schema.users.id, f.users[2]!.id));
    await f.db.update(schema.users).set({ publicProfile: false }).where(eq(schema.users.id, f.users[3]!.id));
    const now = new Date();
    t.mock.timers.enable({ apis: ['Date'], now: now.getTime() });
    await f.db.update(schema.riotAccounts).set({ platform: 'kr' });
    await f.db.insert(schema.riotAuctionCache).values(
        [3, 4, 5].map((index) => ({
            accountId: f.accounts[index]!.id,
            rankSeason: auctionRankSeason('kr', now),
            rankFetchedAt: new Date(now.getTime() - AUCTION_FRESH_MS + (index === 5 ? 0 : 1)),
            matchesFetchedAt: now,
            matchCount: 0,
            champions: []
        }))
    );
    await close();
    const expected = [0, 5, 6, 7, 8, 9].map((i) => f.accounts[i]!.id);
    assert.deepEqual(new Set((await jobs()).map((r) => r.accountId)), new Set(expected));
    await reopenRecruitment(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    await close();
    assert.equal((await jobs()).length, expected.length);
    assert.equal((await f.db.select().from(schema.riotAuctionJobParticipants)).length, expected.length);
});

test('점유는 중복 실행을 막고, 일부 성공은 재시도·점유 만료 후에도 재사용한다', async (t) => {
    const f = await createFormationFixture(t);
    const retained = f.accounts.slice(0, 2);
    await f.db.delete(schema.guildRiotAccounts).where(
        notInArray(
            schema.guildRiotAccounts.riotAccountId,
            retained.map((r) => r.id)
        )
    );
    await f.db.update(schema.riotAccounts).set({ platform: 'kr' });
    await f.db.transaction((tx) => enqueueAuctionJobs(tx, f.scrimId));
    const [a, b, c] = await Promise.all(Array.from({ length: 3 }, () => claimAuctionJob(f.db)));
    const active = [a, b, c].filter((job) => job !== null);
    assert.equal(active.length, 2);
    const first = active[0]!,
        second = active[1]!;
    assert.notEqual(first.accountId, second.accountId);
    assert.equal(first.rankAttempts, 0);
    assert.equal(await saveAuctionPlatform(f.db, first, 'kr'), true);
    assert.equal(await renewAuctionJob(f.db, first), true);
    const season = auctionRankSeason('kr');
    const rank = { tier: 'GOLD', rank: 'II', leaguePoints: 20 };
    assert.equal(await saveAuctionRank(f.db, first, season, rank, rank), true);
    const matchId = 'KR_101';
    const players = [
        { puuid: first.puuid, championId: 1 },
        { puuid: second.puuid, championId: 2 },
        { puuid: f.accounts[2]!.puuid, championId: 3 }
    ];
    assert.equal(await saveAuctionMatch(f.db, first, matchId, players), true);
    assert.deepEqual(await cachedAuctionMatches(f.db, second, [matchId]), new Map([[matchId, 2]]));
    assert.equal((await f.db.select().from(schema.riotAuctionMatches)).length, 2);
    assert.equal((await f.db.select().from(schema.riotAuctionCache))[0]!.matchesFetchedAt, null);
    // 429는 실패 횟수를 올리지 않지만 일시 장애 재시도는 횟수를 올린다.
    await releaseAuctionJob(f.db, second, {
        source: 'platform',
        retryAt: new Date(Date.now() + 60 * 60_000),
        attempts: 0
    });
    await releaseAuctionJob(f.db, first, { source: 'match', retryAt: new Date(0), attempts: 1 });
    const retry = await claimAuctionJob(f.db);
    assert.ok(retry);
    assert.equal(retry.matchAttempts, 1);
    assert.equal(retry.needRank, false);
    assert.equal(retry.needMatches, true);
    if (season) assert.deepEqual((await f.db.select().from(schema.riotAuctionPeaks))[0]!.peak, rank);
    assert.equal(await saveAuctionRank(f.db, first, season, null, null), false);
    await f.db
        .update(schema.riotAuctionJobs)
        .set({ availableAt: new Date(0) })
        .where(eq(schema.riotAuctionJobs.accountId, retry.accountId));
    // 이전 프로세스의 토큰은 새 점유자가 오기 전에도 만료 시각 이후로 쓸 수 없다.
    assert.equal(await saveAuctionSummary(f.db, retry, 0, [], []), false);
    const reclaimed = await claimAuctionJob(f.db);
    assert.ok(reclaimed);
    assert.notEqual(retry.token, reclaimed.token);
    await releaseAuctionJob(f.db, retry);
    assert.equal(
        await saveAuctionSummary(f.db, reclaimed, 1, [{ championId: 1, count: 1 }], [matchId]),
        true
    );
    await releaseAuctionJob(f.db, reclaimed);
    await f.db.transaction((tx) => enqueueAuctionJobs(tx, f.scrimId));
    const remaining = await f.db.select().from(schema.riotAuctionJobs);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0]!.accountId, second.accountId);
    assert.equal(remaining[0]!.platformAttempts, 0);
    assert.equal((await f.db.select().from(schema.riotAuctionJobParticipants)).length, 1);
    const [summary] = await f.db.select().from(schema.riotAuctionCache);
    assert.deepEqual(summary!.currentRank, rank);
    assert.deepEqual(summary!.champions, [{ championId: 1, count: 1 }]);
});

test('처리 중 계정 연결이 끊기면 해당 점유의 저장을 거절하고 요청 없는 작업을 회수한다', async (t) => {
    const f = await createFormationFixture(t);
    const accountId = f.accounts[0]!.id;
    await f.db.delete(schema.guildRiotAccounts).where(
        inArray(
            schema.guildRiotAccounts.riotAccountId,
            f.accounts.slice(1).map((row) => row.id)
        )
    );
    await f.db.transaction((tx) => enqueueAuctionJobs(tx, f.scrimId));
    const job = await claimAuctionJob(f.db);
    assert.ok(job);
    await f.db
        .update(schema.guildRiotAccounts)
        .set({ userId: f.users[1]!.id })
        .where(eq(schema.guildRiotAccounts.riotAccountId, accountId));
    assert.equal(await renewAuctionJob(f.db, job), false);
    assert.equal(await saveAuctionRank(f.db, job, null, null, null), false);
    assert.equal((await f.db.select().from(schema.riotAuctionCache)).length, 0);
    await releaseAuctionJob(f.db, job);
    assert.equal(await claimAuctionJob(f.db), null);
    assert.equal((await f.db.select().from(schema.riotAuctionJobs)).length, 0);
});

test('경기 처리 중 다른 내전 마감이 추가한 랭크 요청은 기존 점유 반납 뒤에도 남는다', async (t) => {
    const f = await createFormationFixture(t);
    const account = f.accounts[0]!,
        user = f.users[0]!;
    await f.db
        .update(schema.users)
        .set({ publicRiotIds: false })
        .where(
            inArray(
                schema.users.id,
                f.users.slice(1).map(({ id }) => id)
            )
        );
    const [other] = await f.db
        .insert(schema.scrims)
        .values({
            guildId: f.guildId,
            title: '동시 마감',
            status: 'preparing'
        })
        .returning();
    const [participant] = await f.db
        .insert(schema.scrimParticipants)
        .values({
            scrimId: other!.id,
            userId: user.id,
            displayName: user.username,
            riotAccountId: account.id
        })
        .returning();
    await f.db.insert(schema.scrimParticipantRegistrations).values({
        scrimParticipantId: participant!.id,
        status: 'selected'
    });
    const now = Date.now();
    t.mock.timers.enable({ apis: ['Date'], now });
    await f.db.update(schema.riotAccounts).set({ platform: 'kr', platformCheckedAt: new Date(now) });
    await f.db.insert(schema.riotAuctionCache).values({
        accountId: account.id,
        rankSeason: auctionRankSeason('kr'),
        rankFetchedAt: new Date(now - AUCTION_FRESH_MS + 1)
    });
    await f.db.transaction((tx) => enqueueAuctionJobs(tx, f.scrimId));
    const first = await claimAuctionJob(f.db);
    assert.ok(first && !first.needRank && first.needMatches);
    t.mock.timers.tick(1);
    await f.db.transaction((tx) => enqueueAuctionJobs(tx, other!.id));
    assert.ok(await saveAuctionSummary(f.db, first, 0, [], []));
    await releaseAuctionJob(f.db, first);
    const rank = await claimAuctionJob(f.db);
    assert.ok(rank?.needRank && !rank.needMatches);
    assert.equal(rank.accountId, account.id);
    assert.ok(
        (await f.db.select().from(schema.riotAuctionJobParticipants)).some(
            (row) => row.participantId === participant!.id
        )
    );
    assert.ok(await saveAuctionRank(f.db, rank, rank.season, null, null));
    await releaseAuctionJob(f.db, rank);
    assert.equal(await claimAuctionJob(f.db), null);
});
