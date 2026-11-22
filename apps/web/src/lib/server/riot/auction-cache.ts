import { randomUUID } from 'node:crypto';
import { and, asc, eq, gt, inArray, isNull, lte, notInArray, or, sql } from 'drizzle-orm';
import {
    guildMembers,
    guildRiotAccounts,
    guilds,
    riotAccounts,
    riotAuctionCache,
    riotAuctionJobParticipants,
    riotAuctionJobs,
    riotAuctionMatches,
    riotAuctionPeaks,
    scrimParticipantRegistrations,
    scrimParticipants,
    scrims,
    users,
    type AuctionChampionCount,
    type AuctionRank
} from '../db/schema.ts';
import type { Database, Transaction } from '../db/types.ts';
import { auctionRankSeason, AUCTION_FRESH_MS } from './auction-season.ts';

export type { AuctionRank } from '../db/schema.ts';

export interface AuctionJob {
    accountId: string;
    token: string;
    platformAttempts: number;
    rankAttempts: number;
    matchAttempts: number;
    matchIds: string[] | null;
    puuid: string;
    platform: string | null;
    verifyPlatform: boolean;
    needRank: boolean;
    needMatches: boolean;
    season: string | null;
    peak: AuctionRank | null;
}

type LockedRequesters = { userIds: string[]; accountIds: string[] };

// 마감 때와 실제 작업 때 동일한 연결을 확인한다. 지정 계정이 끊겼다면 대표 계정으로 대체하지 않는다.
function eligibleAccounts(tx: Transaction, locked?: LockedRequesters) {
    const query = tx
        .select({
            accountId: guildRiotAccounts.riotAccountId,
            userId: guildRiotAccounts.userId,
            platform: riotAccounts.platform,
            puuid: riotAccounts.puuid,
            participantId: scrimParticipantRegistrations.scrimParticipantId,
            scrimId: scrimParticipants.scrimId
        })
        .from(scrimParticipants)
        .innerJoin(scrims, eq(scrims.id, scrimParticipants.scrimId))
        .innerJoin(guilds, and(eq(guilds.id, scrims.guildId), eq(guilds.isActive, true)))
        .innerJoin(
            scrimParticipantRegistrations,
            and(
                eq(scrimParticipantRegistrations.scrimParticipantId, scrimParticipants.id),
                eq(scrimParticipantRegistrations.status, 'selected'),
                isNull(scrimParticipantRegistrations.withdrawnAt)
            )
        )
        .innerJoin(
            users,
            and(
                eq(users.id, scrimParticipants.userId),
                isNull(users.withdrawnAt),
                eq(users.publicProfile, true),
                eq(users.publicRiotIds, true)
            )
        )
        .innerJoin(
            guildMembers,
            and(eq(guildMembers.guildId, scrims.guildId), eq(guildMembers.userId, users.id))
        )
        .innerJoin(
            guildRiotAccounts,
            and(
                eq(guildRiotAccounts.guildId, scrims.guildId),
                eq(guildRiotAccounts.userId, users.id),
                or(
                    eq(guildRiotAccounts.riotAccountId, scrimParticipants.riotAccountId),
                    and(isNull(scrimParticipants.riotAccountId), eq(guildRiotAccounts.isPrimary, true))
                )
            )
        )
        .innerJoin(riotAccounts, eq(riotAccounts.id, guildRiotAccounts.riotAccountId))
        .where(
            and(
                inArray(scrims.status, ['preparing', 'ready', 'in_progress']),
                locked && inArray(users.id, locked.userIds),
                locked && inArray(riotAccounts.id, locked.accountIds)
            )
        );
    // 길드 동기화는 사용자보다 길드를 먼저 잠근다. 경합 중인 연결은 기다리지 않고 다음 작업에서 확인한다.
    return (
        locked
            ? query.for('share', { of: [guilds, guildMembers, guildRiotAccounts], skipLocked: true })
            : query
    ).as('eligible');
}

function needsRefresh(cache: typeof riotAuctionCache.$inferSelect | null, season: string | null, now: Date) {
    const cutoff = now.getTime() - AUCTION_FRESH_MS;
    return {
        needRank:
            !cache?.rankFetchedAt || cache.rankFetchedAt.getTime() <= cutoff || cache.rankSeason !== season,
        needMatches: !cache?.matchesFetchedAt || cache.matchesFetchedAt.getTime() <= cutoff
    };
}

export async function enqueueAuctionJobs(tx: Transaction, scrimId: string) {
    const eligible = eligibleAccounts(tx);
    const rows = await tx
        .select({
            accountId: eligible.accountId,
            participantId: eligible.participantId,
            platform: eligible.platform,
            cache: riotAuctionCache
        })
        .from(eligible)
        .leftJoin(riotAuctionCache, eq(riotAuctionCache.accountId, eligible.accountId))
        .where(eq(eligible.scrimId, scrimId))
        .orderBy(asc(eligible.accountId));
    const now = new Date();
    const requests = rows.flatMap(({ accountId, participantId, platform, cache }) => {
        const { needRank, needMatches } = needsRefresh(
            platform ? cache : null,
            auctionRankSeason(platform, now),
            now
        );
        return needRank || needMatches
            ? [
                  {
                      accountId,
                      participantId,
                      rankDueAt: needRank ? dbNow : null,
                      matchDueAt: needMatches ? dbNow : null
                  }
              ]
            : [];
    });
    if (!requests.length) return;
    // 작업 삭제와 요청자 추가가 엇갈리지 않게 계정순으로 잠그고, 기존 재시도·선점 시각은 유지한다.
    await tx
        .insert(riotAuctionJobs)
        .values(
            requests.map(({ accountId, rankDueAt, matchDueAt }) => ({ accountId, rankDueAt, matchDueAt }))
        )
        .onConflictDoUpdate({
            target: riotAuctionJobs.accountId,
            set: {
                rankDueAt: sql`coalesce(${riotAuctionJobs.rankDueAt}, excluded.rank_due_at)`,
                matchDueAt: sql`coalesce(${riotAuctionJobs.matchDueAt}, excluded.match_due_at)`
            }
        });
    await tx
        .insert(riotAuctionJobParticipants)
        .values(requests.map(({ accountId, participantId }) => ({ accountId, participantId })))
        .onConflictDoNothing();
}

function requestedAccounts(tx: Transaction, locked?: LockedRequesters) {
    const eligible = eligibleAccounts(tx, locked);
    return tx
        .selectDistinct({ accountId: eligible.accountId, puuid: eligible.puuid, userId: eligible.userId })
        .from(eligible)
        .innerJoin(
            riotAuctionJobParticipants,
            and(
                eq(riotAuctionJobParticipants.accountId, eligible.accountId),
                eq(riotAuctionJobParticipants.participantId, eligible.participantId)
            )
        )
        .as('requested');
}

const dbNow = sql`clock_timestamp()`;
const leaseEnd = sql`clock_timestamp() + interval '90 seconds'`;

export async function claimAuctionJob(db: Database): Promise<AuctionJob | null> {
    for (;;) {
        const job = await claimOrDiscard(db);
        if (job !== 'discarded') return job;
    }
}

async function claimOrDiscard(db: Database): Promise<AuctionJob | 'discarded' | null> {
    return db.transaction(async (tx) => {
        const rankDue = sql<boolean>`${riotAuctionJobs.rankDueAt} <= ${dbNow}`;
        const matchDue = sql<boolean>`${riotAuctionJobs.matchDueAt} <= ${dbNow}`;
        const [next] = await tx
            .select({
                job: riotAuctionJobs,
                rankDue,
                matchDue,
                platformCheckedAt: riotAccounts.platformCheckedAt,
                platform: riotAccounts.platform,
                puuid: riotAccounts.puuid,
                cache: riotAuctionCache
            })
            .from(riotAuctionJobs)
            .innerJoin(riotAccounts, eq(riotAccounts.id, riotAuctionJobs.accountId))
            .leftJoin(riotAuctionCache, eq(riotAuctionCache.accountId, riotAuctionJobs.accountId))
            .where(
                and(
                    lte(riotAuctionJobs.availableAt, dbNow),
                    or(
                        rankDue,
                        matchDue,
                        and(isNull(riotAuctionJobs.rankDueAt), isNull(riotAuctionJobs.matchDueAt))
                    )
                )
            )
            .orderBy(
                sql`case when ${rankDue} then 0 else 1 end`,
                asc(riotAuctionJobs.availableAt),
                asc(riotAuctionJobs.accountId)
            )
            .limit(1)
            .for('update', { of: riotAuctionJobs, skipLocked: true });
        if (!next) return null;
        const { accountId, platformAttempts, rankAttempts, matchAttempts, matchIds } = next.job;
        const accountJob = eq(riotAuctionJobs.accountId, accountId);
        const requested = requestedAccounts(tx);
        const [owner] = await tx
            .select({ id: requested.accountId })
            .from(requested)
            .where(eq(requested.accountId, accountId));
        const now = new Date();
        const season = auctionRankSeason(next.platform, now);
        const refresh = needsRefresh(next.platform ? next.cache : null, season, now);
        const rankDueAt = refresh.needRank ? next.job.rankDueAt : null;
        const matchDueAt = refresh.needMatches ? next.job.matchDueAt : null;
        if (!owner || (!rankDueAt && !matchDueAt)) {
            await tx.delete(riotAuctionJobs).where(accountJob);
            return 'discarded';
        }
        const needRank = !!rankDueAt && next.rankDue;
        const needMatches = !!matchDueAt && next.matchDue;
        if (!needRank && !needMatches) {
            await tx.update(riotAuctionJobs).set({ rankDueAt, matchDueAt }).where(accountJob);
            return 'discarded';
        }
        const [observed] =
            needRank && season
                ? await tx
                      .select({ peak: riotAuctionPeaks.peak })
                      .from(riotAuctionPeaks)
                      .where(
                          and(eq(riotAuctionPeaks.accountId, accountId), eq(riotAuctionPeaks.season, season))
                      )
                : [];
        const token = randomUUID();
        await tx
            .update(riotAuctionJobs)
            .set({ token, availableAt: leaseEnd, rankDueAt, matchDueAt })
            .where(accountJob);
        return {
            accountId,
            puuid: next.puuid,
            platform: next.platform,
            verifyPlatform:
                !next.platformCheckedAt ||
                now.getTime() - next.platformCheckedAt.getTime() >= AUCTION_FRESH_MS,
            platformAttempts,
            rankAttempts,
            matchAttempts,
            matchIds,
            token,
            season,
            peak: observed?.peak ?? null,
            needRank,
            needMatches
        };
    });
}

function leaseCondition(job: AuctionJob) {
    return and(
        eq(riotAuctionJobs.accountId, job.accountId),
        eq(riotAuctionJobs.token, job.token),
        gt(riotAuctionJobs.availableAt, dbNow)
    );
}

async function withLease(
    db: Database,
    job: AuctionJob,
    save?: (tx: Transaction, accounts: { accountId: string; puuid: string }[]) => Promise<void>,
    matchPuuids?: string[]
) {
    return db.transaction(async (tx) => {
        const requested = requestedAccounts(tx);
        // 연결 변경·탈퇴와 같은 순서로 경기 동료를 포함한 사용자부터 잠근다.
        const owners = await tx
            .select({ userId: users.id, accountId: requested.accountId })
            .from(users)
            .innerJoin(requested, eq(requested.userId, users.id))
            .where(
                matchPuuids ? inArray(requested.puuid, matchPuuids) : eq(requested.accountId, job.accountId)
            )
            .orderBy(asc(users.id))
            .for('share', { of: users });
        if (!owners.some(({ accountId }) => accountId === job.accountId)) return false;

        // 조회 도중 계정이 다른 플랫폼으로 이전되면 옛 지역의 랭크·경기를 저장하지 않는다.
        const accounts = await tx
            .select({ id: riotAccounts.id })
            .from(riotAccounts)
            .where(
                and(
                    inArray(
                        riotAccounts.id,
                        owners.map(({ accountId }) => accountId)
                    ),
                    job.platform === null
                        ? isNull(riotAccounts.platform)
                        : eq(riotAccounts.platform, job.platform)
                )
            )
            .orderBy(asc(riotAccounts.id))
            .for('no key update');

        // 잠금을 기다리는 동안 바뀐 공개 여부·길드·연결은 새 스냅샷으로 검사한다.
        // 처음 읽은 뒤 합류한 요청자는 그 사용자와 계정을 잠그지 않았다면 근거로 쓰지 않는다.
        const verified = requestedAccounts(tx, {
            userIds: owners.map(({ userId }) => userId),
            accountIds: accounts.map(({ id }) => id)
        });
        const authorized = await tx
            .selectDistinct({ accountId: verified.accountId, puuid: verified.puuid })
            .from(verified);
        if (!authorized.some(({ accountId }) => accountId === job.accountId)) return false;
        const [owned] = await tx
            .update(riotAuctionJobs)
            .set({ availableAt: leaseEnd })
            .where(leaseCondition(job))
            .returning({ id: riotAuctionJobs.accountId });
        if (!owned) return false;
        await save?.(tx, authorized);
        return true;
    });
}

export const renewAuctionJob = (db: Database, job: AuctionJob) => withLease(db, job);

export function saveAuctionPlatform(db: Database, job: AuctionJob, platform: string) {
    return withLease(db, job, async (tx) => {
        await tx
            .update(riotAccounts)
            .set({ platform, platformCheckedAt: dbNow })
            .where(eq(riotAccounts.id, job.accountId));
        await tx
            .update(riotAuctionJobs)
            .set({ platformAttempts: 0 })
            .where(eq(riotAuctionJobs.accountId, job.accountId));
    });
}

export function saveAuctionRank(
    db: Database,
    job: AuctionJob,
    season: string | null,
    current: AuctionRank | null,
    peak: AuctionRank | null
) {
    return withLease(db, job, async (tx) => {
        const values = { rankSeason: season, currentRank: current, rankFetchedAt: dbNow };
        await tx
            .update(riotAuctionJobs)
            .set({ rankDueAt: null, rankAttempts: 0 })
            .where(eq(riotAuctionJobs.accountId, job.accountId));
        await tx
            .insert(riotAuctionCache)
            .values({ accountId: job.accountId, ...values })
            .onConflictDoUpdate({ target: riotAuctionCache.accountId, set: values });
        if (season && peak)
            await tx
                .insert(riotAuctionPeaks)
                .values({ accountId: job.accountId, season, peak })
                .onConflictDoUpdate({
                    target: [riotAuctionPeaks.accountId, riotAuctionPeaks.season],
                    set: { peak }
                });
    });
}

export function saveAuctionMatchIds(db: Database, job: AuctionJob, matchIds: string[]) {
    return withLease(db, job, async (tx) => {
        await tx
            .update(riotAuctionJobs)
            .set({ matchIds })
            .where(eq(riotAuctionJobs.accountId, job.accountId));
    });
}

export async function cachedAuctionMatches(
    db: Database,
    job: AuctionJob,
    matchIds: readonly string[]
): Promise<Map<string, number>> {
    if (!matchIds.length) return new Map();
    const rows = await db
        .select({ matchId: riotAuctionMatches.matchId, championId: riotAuctionMatches.championId })
        .from(riotAuctionMatches)
        .where(
            and(
                eq(riotAuctionMatches.accountId, job.accountId),
                inArray(riotAuctionMatches.matchId, [...matchIds])
            )
        );
    return new Map(rows.map(({ matchId, championId }) => [matchId, championId]));
}

export function saveAuctionMatch(
    db: Database,
    job: AuctionJob,
    matchId: string,
    participants: readonly { puuid: string; championId: number }[]
) {
    const champions = new Map(participants.map(({ puuid, championId }) => [puuid, championId]));
    return withLease(
        db,
        job,
        async (tx, matches) => {
            await tx
                .insert(riotAuctionMatches)
                .values(
                    matches.map(({ accountId, puuid }) => ({
                        accountId,
                        matchId,
                        championId: champions.get(puuid)!
                    }))
                )
                .onConflictDoNothing();
        },
        [...champions.keys()]
    );
}

export function saveAuctionSummary(
    db: Database,
    job: AuctionJob,
    gameCount: number,
    champions: AuctionChampionCount[],
    matchIds: readonly string[]
) {
    return withLease(db, job, async (tx) => {
        const values = { matchCount: gameCount, champions, matchesFetchedAt: dbNow };
        await tx
            .update(riotAuctionJobs)
            .set({ matchDueAt: null, matchAttempts: 0, matchIds: null })
            .where(eq(riotAuctionJobs.accountId, job.accountId));
        await tx
            .insert(riotAuctionCache)
            .values({ accountId: job.accountId, ...values })
            .onConflictDoUpdate({ target: riotAuctionCache.accountId, set: values });
        await tx
            .delete(riotAuctionMatches)
            .where(
                and(
                    eq(riotAuctionMatches.accountId, job.accountId),
                    matchIds.length ? notInArray(riotAuctionMatches.matchId, [...matchIds]) : undefined
                )
            );
    });
}

export type AuctionSource = 'platform' | 'rank' | 'match';

export function releaseAuctionJob(
    db: Database,
    job: AuctionJob,
    failure?: { source: AuctionSource; retryAt: Date | null; attempts: number }
) {
    return db.transaction(async (tx) => {
        const change: Partial<typeof riotAuctionJobs.$inferInsert> = { token: null };
        if (failure) {
            const { source, retryAt, attempts } = failure;
            if (source === 'rank') {
                change.rankDueAt = retryAt;
                change.rankAttempts = retryAt ? attempts : 0;
            } else if (source === 'match') {
                change.matchDueAt = retryAt;
                change.matchAttempts = retryAt ? attempts : 0;
                if (!retryAt) change.matchIds = null;
            } else {
                change.platformAttempts = attempts;
                if (!retryAt) change.rankDueAt = change.matchDueAt = null;
            }
        }
        // 새 마감이 추가한 다른 자료의 예약은 남겨 둔다. 삭제 판단까지 작업 행 잠금을 유지한다.
        const [remaining] = await tx
            .update(riotAuctionJobs)
            .set({ ...change, availableAt: (failure?.source === 'platform' && failure.retryAt) || dbNow })
            .where(leaseCondition(job))
            .returning({ rank: riotAuctionJobs.rankDueAt, match: riotAuctionJobs.matchDueAt });
        if (remaining && !remaining.rank && !remaining.match)
            await tx.delete(riotAuctionJobs).where(eq(riotAuctionJobs.accountId, job.accountId));
    });
}
