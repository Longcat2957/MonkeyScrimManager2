import type { AuctionRank } from '../db/schema.ts';
import type { Database } from '../db/types.ts';
import type { getActiveRegion } from './account.ts';
import type { getLeagueEntriesByPuuid, LeagueEntryDto } from './lol/league.ts';
import type { getSoloMatchIds, getSoloMatchParticipants } from './lol/match.ts';
import {
    cachedAuctionMatches,
    claimAuctionJob,
    releaseAuctionJob,
    renewAuctionJob,
    saveAuctionMatch,
    saveAuctionMatchIds,
    saveAuctionPlatform,
    saveAuctionRank,
    saveAuctionSummary,
    type AuctionSource
} from './auction-cache.ts';
import { auctionRankSeason } from './auction-season.ts';
import { RiotError } from './errors.ts';
import { parsePlatformRouting, PLATFORM_ROUTINGS, type PlatformRouting } from './transport.ts';

export interface AuctionRiot {
    getActiveRegion: typeof getActiveRegion;
    getLeagueEntriesByPuuid: typeof getLeagueEntriesByPuuid;
    getSoloMatchIds: typeof getSoloMatchIds;
    getSoloMatchParticipants: typeof getSoloMatchParticipants;
}

const tiers = [
    'IRON',
    'BRONZE',
    'SILVER',
    'GOLD',
    'PLATINUM',
    'EMERALD',
    'DIAMOND',
    'MASTER',
    'GRANDMASTER',
    'CHALLENGER'
];
const divisions = ['IV', 'III', 'II', 'I'];

function higherRank(previous: AuctionRank | null, current: AuctionRank | null) {
    if (!previous || !current) return current ?? previous;
    const delta =
        tiers.indexOf(current.tier) - tiers.indexOf(previous.tier) ||
        divisions.indexOf(current.rank) - divisions.indexOf(previous.rank) ||
        current.leaguePoints - previous.leaguePoints;
    return delta > 0 ? current : previous;
}

function soloRank(entries: LeagueEntryDto[], puuid: string): AuctionRank | null {
    let current: AuctionRank | null = null;
    for (const entry of entries) {
        if (entry.puuid !== puuid) throw new RiotError('INVALID_RESPONSE', 'Unexpected League entry owner.');
        if (entry.queueType !== 'RANKED_SOLO_5x5') continue;
        const { tier, rank, leaguePoints } = entry;
        if (current || !tiers.includes(tier) || !divisions.includes(rank))
            throw new RiotError('INVALID_RESPONSE', 'Invalid solo rank.');
        current = { tier, rank, leaguePoints };
    }
    return current;
}

const maxFailures = 5;
const terminalCodes = ['NOT_CONFIGURED', 'INVALID_CONFIGURATION', 'UPSTREAM_AUTH_ERROR', 'INVALID_ARGUMENT'];

function retryDeadline(error: RiotError) {
    return Math.min(Date.now() + Math.max(1, error.retryAfterSeconds ?? 60) * 1000, 8.64e15);
}

/** 선점과 저장 사이에서는 DB 연결을 점유하지 않는다. 외부 요청 전마다 현재 소유권을 다시 검사한다. */
export async function processNextAuctionJob(
    db: Database,
    riot: AuctionRiot,
    signal?: AbortSignal
): Promise<boolean> {
    if (signal?.aborted) return false;
    const job = await claimAuctionJob(db);
    if (!job) return false;
    const eligible = async () => !signal?.aborted && (await renewAuctionJob(db, job)) && !signal?.aborted;
    let source: AuctionSource = 'platform';
    try {
        let platform = job.platform as PlatformRouting;
        if (job.verifyPlatform || !PLATFORM_ROUTINGS.includes(platform)) {
            if (!(await eligible())) return true;
            const active = await riot.getActiveRegion(job.puuid, undefined, true);
            if (active.puuid !== job.puuid)
                throw new RiotError('INVALID_RESPONSE', 'Unexpected active region owner.');
            platform = parsePlatformRouting(active.region.toLowerCase());
            if (signal?.aborted || !(await saveAuctionPlatform(db, job, platform))) return true;
            // 지역 변경은 기존 점유와 캐시를 함께 무효화한다. 새 지역의 시즌·최고값으로 다시 선점한다.
            if (platform !== job.platform) return true;
        }
        if (job.needRank) {
            source = 'rank';
            if (!(await eligible())) return true;
            const before = auctionRankSeason(platform);
            const current = soloRank(
                await riot.getLeagueEntriesByPuuid(job.puuid, platform, true),
                job.puuid
            );
            const season = auctionRankSeason(platform);
            // 응답을 기다리는 중 시즌이 넘어갔다면 어느 시즌의 값인지 추측하지 않는다.
            if (before === season && job.season === season) {
                const peak = season ? higherRank(job.peak, current) : null;
                if (signal?.aborted || !(await saveAuctionRank(db, job, season, current, peak))) return true;
            }
            // 경기 상세보다 다른 후보의 랭크를 먼저 조회하도록 한 자료씩 선점을 반납한다.
        } else {
            source = 'match';
            if (!(await eligible())) return true;
            let ids = job.matchIds;
            if (!ids) {
                ids = await riot.getSoloMatchIds(job.puuid, platform);
                if (signal?.aborted || !(await saveAuctionMatchIds(db, job, ids))) return true;
            }
            const cached = await cachedAuctionMatches(db, job, ids);
            const counts = new Map<number, number>();
            for (const id of ids) {
                let champion = cached.get(id);
                if (champion === undefined) {
                    if (!(await eligible())) return true;
                    const players = await riot.getSoloMatchParticipants(id, job.puuid, platform);
                    champion = players.find((player) => player.puuid === job.puuid)?.championId;
                    if (champion === undefined)
                        throw new RiotError('INVALID_RESPONSE', 'Missing match participant.');
                    if (signal?.aborted || !(await saveAuctionMatch(db, job, id, players))) return true;
                }
                counts.set(champion, (counts.get(champion) ?? 0) + 1);
            }
            // 목록이 최신순이므로 동률은 안정 정렬의 최초 등장 순서가 된다.
            const champions = [...counts]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([championId, count]) => ({ championId, count }));
            if (signal?.aborted || !(await saveAuctionSummary(db, job, ids.length, champions, ids)))
                return true;
        }
        if (!signal?.aborted) await releaseAuctionJob(db, job);
    } catch (error) {
        if (signal?.aborted) return true;
        if (!(error instanceof RiotError)) throw error;
        const attempts = job[`${source}Attempts`];
        const deferred = error.code === 'RATE_LIMITED' || error.code === 'BUSY';
        const terminal = !deferred && (terminalCodes.includes(error.code) || attempts + 1 >= maxFailures);
        const retryAt = terminal
            ? null
            : new Date(deferred ? retryDeadline(error) : Date.now() + 15_000 * 2 ** attempts);
        await releaseAuctionJob(db, job, { source, retryAt, attempts: deferred ? attempts : attempts + 1 });
        if (deferred) console.info('riot_auction_job', 'deferred', source, error.code);
        else console.warn('riot_auction_job', terminal ? 'stopped' : 'retry', source, error.code);
    }
    return true;
}

/** 단일 프로세스에서는 직렬로 소비하고, DB 선점은 다른 인스턴스 및 재시작을 보호한다. */
export function startAuctionWorker(getDb: () => Database, riot: AuctionRiot) {
    const controller = new AbortController();
    let timer: NodeJS.Timeout;
    const poll = async () => {
        let delay = 5000;
        try {
            if (await processNextAuctionJob(getDb(), riot, controller.signal)) delay = 0;
        } catch {
            // DB 주소·쿼리·PUUID가 든 원시 오류는 기록하지 않는다. 미완료 작업은 선점 만료 후 회수된다.
            if (!controller.signal.aborted) console.warn('riot_auction_job', 'storage_unavailable');
        }
        if (!controller.signal.aborted) timer = setTimeout(poll, delay).unref();
    };
    timer = setTimeout(poll, 0).unref();
    return () => {
        controller.abort();
        clearTimeout(timer);
    };
}
