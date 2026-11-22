import assert from 'node:assert/strict';
import test from 'node:test';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import type { Database } from '../../../../src/lib/server/db/types.ts';
import {
    claimAuctionJob,
    enqueueAuctionJobs,
    renewAuctionJob,
    saveAuctionMatch,
    saveAuctionRank
} from '../../../../src/lib/server/riot/auction-cache.ts';
import { createFormationFixture } from '../../support/domain-fixtures.ts';

async function saveWhileHiding(db: Database, userId: string, save: () => Promise<boolean>) {
    const { writing, blocked } = await db.transaction(async (tx) => {
        const [holder] = await tx
            .update(schema.users)
            .set({ publicRiotIds: false })
            .where(eq(schema.users.id, userId))
            .returning({ pid: sql<number>`pg_backend_pid()` });
        let finished = false;
        const writing = Promise.allSettled([save()] as const).then(([result]) => {
            finished = true;
            return result;
        });
        // 저장 트랜잭션이 실제로 비공개 전환을 기다리는 시점에 커밋한다.
        const deadline = Date.now() + 3_000;
        do {
            const { rowCount } = await db.execute(
                sql`select pid from pg_stat_activity where ${holder!.pid} = any(pg_blocking_pids(pid))`
            );
            if (rowCount) return { writing, blocked: true };
        } while (!finished && Date.now() < deadline);
        return { writing, blocked: false };
    });
    const result = await writing;
    if (result.status === 'rejected') throw result.reason;
    assert.ok(blocked, '개인정보 변경과 저장 권한 검사가 같은 사용자 행에서 경합해야 한다');
    return result.value;
}

test('비공개 전환과 경합하면 동료의 경기와 본인의 랭크를 새로 저장하지 않는다', async (t) => {
    const f = await createFormationFixture(t);
    await f.db.update(schema.riotAccounts).set({ platform: 'kr' });
    await f.db.transaction((tx) => enqueueAuctionJobs(tx, f.scrimId));
    const job = await claimAuctionJob(f.db);
    assert.ok(job);
    const owner = f.participants.find((p) => p.riotAccountId === job.accountId)!;
    const other = f.participants.find((p) => p.riotAccountId !== job.accountId)!;
    const teammate = f.accounts.find((account) => account.id === other.riotAccountId)!;
    const matchId = 'KR_101';
    const players = [
        { puuid: job.puuid, championId: 1 },
        { puuid: teammate.puuid, championId: 2 }
    ];
    assert.equal(
        await saveWhileHiding(f.db, other.userId!, () => saveAuctionMatch(f.db, job, matchId, players)),
        true
    );
    assert.deepEqual(await f.db.select().from(schema.riotAuctionMatches), [
        { accountId: job.accountId, matchId, championId: 1 }
    ]);
    const rank = { tier: 'GOLD', rank: 'I', leaguePoints: 55 };
    assert.equal(
        await saveWhileHiding(f.db, owner.userId!, () => saveAuctionRank(f.db, job, job.season, rank, rank)),
        false
    );
    assert.deepEqual(await f.db.select().from(schema.riotAuctionCache), []);
    assert.deepEqual(await f.db.select().from(schema.riotAuctionPeaks), []);
});

test('봇이 나간 길드는 마감·선점·저장에서 요청 자격을 부여하지 않는다', async (t) => {
    const f = await createFormationFixture(t);
    const active = (isActive: boolean) =>
        f.db.update(schema.guilds).set({ isActive }).where(eq(schema.guilds.id, f.guildId));
    await active(false);
    await f.db.transaction((tx) => enqueueAuctionJobs(tx, f.scrimId));
    assert.deepEqual(await f.db.select().from(schema.riotAuctionJobs), []);
    await active(true);
    await f.db.transaction((tx) => enqueueAuctionJobs(tx, f.scrimId));
    const job = await claimAuctionJob(f.db);
    assert.ok(job);
    await active(false);
    assert.equal(await renewAuctionJob(f.db, job), false);
    assert.equal(await saveAuctionRank(f.db, job, job.season, null, null), false);
    assert.deepEqual(await f.db.select().from(schema.riotAuctionCache), []);
    assert.equal(await claimAuctionJob(f.db), null);
});
