import { and, asc, desc, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import {
    LANES,
    type AuctionRiotProfile,
    type ChampionRef,
    type TargetProfile
} from '../../features/scrims/formation.ts';
import type { LolPosition } from '../../features/guild/types.ts';
import type { Transaction } from '../db/types.ts';
import { AUCTION_FRESH_MS, auctionRankSeason } from '../riot/auction-season.ts';
import {
    gameParticipants,
    games,
    guildMembers,
    guildRiotAccounts,
    matches,
    riotAccounts,
    riotAuctionCache,
    riotAuctionJobParticipants,
    riotAuctionPeaks,
    type AuctionRank,
    roflParticipantDataV1,
    scrimParticipants,
    scrims,
    userChampionPreferences,
    users
} from '../db/schema.ts';

export type AuctionChampionResolver = (id: string) => ChampionRef;
export type AuctionPreferredChampionResolver = (championId: number) => ChampionRef | null;

type OpenParticipant = Pick<typeof scrimParticipants.$inferSelect, 'id' | 'userId' | 'riotAccountId'>;

// JSON 캐시의 필드가 늘어나도 공개 응답에는 티어·단계·LP만 노출한다.
function publicRank(value: AuctionRank | null): AuctionRank | null {
    return value && { tier: value.tier, rank: value.rank, leaguePoints: value.leaguePoints };
}

async function publicRiotProfile(
    tx: Transaction,
    guildId: string,
    userId: string,
    { id, riotAccountId }: OpenParticipant,
    resolveChampion?: AuctionPreferredChampionResolver
): Promise<AuctionRiotProfile | null> {
    const [row] = await tx
        .select({
            platform: riotAccounts.platform,
            season: riotAuctionCache.rankSeason,
            current: riotAuctionCache.currentRank,
            rankFetchedAt: riotAuctionCache.rankFetchedAt,
            peak: riotAuctionPeaks.peak,
            games: riotAuctionCache.matchCount,
            champions: riotAuctionCache.champions,
            matchesFetchedAt: riotAuctionCache.matchesFetchedAt,
            job: riotAuctionJobParticipants.accountId
        })
        .from(guildRiotAccounts)
        .innerJoin(users, eq(users.id, guildRiotAccounts.userId))
        .innerJoin(
            guildMembers,
            and(
                eq(guildMembers.guildId, guildRiotAccounts.guildId),
                eq(guildMembers.userId, guildRiotAccounts.userId)
            )
        )
        .innerJoin(riotAccounts, eq(riotAccounts.id, guildRiotAccounts.riotAccountId))
        // 지역 변경 트랜잭션에서 캐시를 폐기하며, 지역 미확인 계정에는 성공값을 표시하지 않는다.
        .leftJoin(
            riotAuctionCache,
            and(eq(riotAuctionCache.accountId, riotAccounts.id), isNotNull(riotAccounts.platform))
        )
        .leftJoin(
            riotAuctionPeaks,
            and(
                eq(riotAuctionPeaks.accountId, riotAccounts.id),
                eq(riotAuctionPeaks.season, riotAuctionCache.rankSeason)
            )
        )
        .leftJoin(
            riotAuctionJobParticipants,
            and(
                eq(riotAuctionJobParticipants.accountId, riotAccounts.id),
                eq(riotAuctionJobParticipants.participantId, id)
            )
        )
        .where(
            and(
                eq(guildRiotAccounts.guildId, guildId),
                eq(guildRiotAccounts.userId, userId),
                // 지정 계정 연결이 해제되면 대표 계정으로 대체하지 않는다.
                riotAccountId !== null
                    ? eq(guildRiotAccounts.riotAccountId, riotAccountId)
                    : eq(guildRiotAccounts.isPrimary, true),
                eq(users.publicProfile, true),
                eq(users.publicRiotIds, true),
                isNull(users.withdrawnAt)
            )
        );
    if (!row) return null;
    const now = new Date();
    const season = auctionRankSeason(row.platform, now);
    const cutoff = now.getTime() - AUCTION_FRESH_MS;
    const rank =
        row.rankFetchedAt && (!season || row.season === season)
            ? {
                  current: publicRank(row.current),
                  peak: season && row.season === season ? publicRank(row.peak) : null,
                  fetchedAt: row.rankFetchedAt.toISOString(),
                  stale: row.rankFetchedAt.getTime() <= cutoff
              }
            : null;
    const recent =
        row.matchesFetchedAt && row.games !== null && row.champions
            ? {
                  games: row.games,
                  champions: row.champions.map(({ championId, count }) => ({
                      champion: resolveChampion?.(championId) ?? {
                          id: String(championId),
                          name: `챔피언 #${championId}`,
                          iconUrl: null
                      },
                      count
                  })),
                  fetchedAt: row.matchesFetchedAt.toISOString(),
                  stale: row.matchesFetchedAt.getTime() <= cutoff
              }
            : null;
    return rank || recent || row.job ? { rank, recent, pending: row.job !== null } : null;
}

/** 현재 계정 소유자가 아니라 해당 시즌의 실제 출전자에게 귀속된 경매 참고 전적을 읽는다. */
export async function auctionTargetProfile(
    tx: Transaction,
    guildId: string,
    seasonId: string | null,
    participant: OpenParticipant,
    champion: AuctionChampionResolver,
    preferredPosition: LolPosition | null = null,
    preferredChampion?: AuctionPreferredChampionResolver
): Promise<(TargetProfile & { recentChronologyKnown: boolean }) | null> {
    const { userId } = participant;
    if (!userId) return null;
    const riot = await publicRiotProfile(tx, guildId, userId, participant, preferredChampion);
    if (!seasonId) {
        if (!riot) return null;
        return {
            summary: null,
            mainLane: null,
            laneGames: null,
            championRecords: [],
            recentGames: [],
            recentChronologyKnown: false,
            preferredChampions: [],
            preferredChampionPosition: null,
            riot
        };
    }
    const records = await tx
        .select({
            gameId: games.id,
            playedAt: games.startedAt,
            position: gameParticipants.position,
            side: gameParticipants.side,
            winnerSide: games.winnerSide,
            championId: roflParticipantDataV1.champion
        })
        .from(gameParticipants)
        .innerJoin(
            games,
            and(
                eq(games.id, gameParticipants.gameId),
                eq(games.scrimId, gameParticipants.scrimId),
                eq(games.roflMetadataId, gameParticipants.roflMetadataId)
            )
        )
        .innerJoin(
            scrimParticipants,
            and(
                eq(scrimParticipants.id, gameParticipants.scrimParticipantId),
                eq(scrimParticipants.scrimId, gameParticipants.scrimId)
            )
        )
        .innerJoin(scrims, eq(scrims.id, games.scrimId))
        .innerJoin(matches, and(eq(matches.id, games.matchId), eq(matches.scrimId, scrims.id)))
        .leftJoin(
            roflParticipantDataV1,
            and(
                eq(roflParticipantDataV1.roflMetadataId, gameParticipants.roflMetadataId),
                eq(roflParticipantDataV1.participantIndex, gameParticipants.roflParticipantIndex)
            )
        )
        .where(
            and(
                eq(scrims.guildId, guildId),
                eq(scrims.mmrSeasonId, seasonId),
                eq(scrimParticipants.userId, userId),
                ne(scrims.status, 'cancelled'),
                ne(matches.status, 'cancelled'),
                eq(games.status, 'completed'),
                isNotNull(games.winnerSide)
            )
        )
        // 실제 시각 미확인은 마지막에 두되 최근 순서를 안다고 알리지 않는다.
        .orderBy(sql`${games.startedAt} desc nulls last`, desc(games.id));

    const laneGames = Object.fromEntries(LANES.map((lane) => [lane, 0])) as Record<LolPosition, number>;
    const champions = new Map<string, TargetProfile['championRecords'][number]>();
    let wins = 0;
    for (const record of records) {
        const won = record.side === record.winnerSide;
        if (won) wins++;
        if (record.position) laneGames[record.position]++;
        if (record.championId) {
            const previous = champions.get(record.championId) ?? {
                champion: champion(record.championId),
                games: 0,
                wins: 0
            };
            previous.games++;
            if (won) previous.wins++;
            champions.set(record.championId, previous);
        }
    }
    const playedLanes = [...new Set(records.flatMap((record) => (record.position ? [record.position] : [])))];
    // 기존 개인 전적처럼 출전 수 동률이면 정렬된 기록에 먼저 나온 포지션을 유지한다.
    const mainLane = playedLanes.sort((left, right) => laneGames[right] - laneGames[left])[0] ?? null;
    // 희망 포지션은 선호 목록 선택에만 사용하고 실제 출전·주력 포지션을 바꾸지 않는다.
    const preferredLane = preferredPosition ?? mainLane;
    const preferred =
        preferredLane && preferredChampion
            ? await tx
                  .select({ championId: userChampionPreferences.championId })
                  .from(userChampionPreferences)
                  .innerJoin(users, eq(users.id, userChampionPreferences.userId))
                  .where(
                      and(
                          eq(userChampionPreferences.userId, userId),
                          eq(userChampionPreferences.position, preferredLane),
                          eq(users.publicProfile, true),
                          isNull(users.withdrawnAt)
                      )
                  )
                  .orderBy(asc(userChampionPreferences.ordinal), asc(userChampionPreferences.championId))
                  .limit(10)
            : [];
    const preferredChampions = preferred.flatMap(({ championId }) => {
        const resolved = preferredChampion?.(championId);
        return resolved ? [resolved] : [];
    });
    return {
        summary: { games: records.length, wins, losses: records.length - wins },
        mainLane,
        laneGames,
        // MSM1 경매 프로필처럼 게임 수·승수·챔피언 ID 순으로 세 챔피언을 제공한다.
        championRecords: [...champions.values()]
            .sort(
                (left, right) =>
                    right.games - left.games ||
                    right.wins - left.wins ||
                    (left.champion.id < right.champion.id ? -1 : left.champion.id > right.champion.id ? 1 : 0)
            )
            .slice(0, 3),
        recentGames: records.slice(0, 8).map((record) => ({
            id: record.gameId,
            champion: record.championId
                ? champion(record.championId)
                : { id: 'unknown', name: '미확인', iconUrl: null },
            lane: record.position,
            win: record.side === record.winnerSide,
            playedAt: record.playedAt?.toISOString() ?? null
        })),
        recentChronologyKnown: records.every((record) => record.playedAt !== null),
        preferredChampions,
        preferredChampionPosition: preferredChampions.length ? preferredLane : null,
        riot
    };
}
