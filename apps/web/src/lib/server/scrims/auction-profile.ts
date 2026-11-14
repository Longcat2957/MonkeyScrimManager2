import { and, desc, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { LANES, type ChampionRef, type TargetProfile } from '../../features/scrims/formation.ts';
import type { Transaction } from '../db/types.ts';
import {
    gameParticipants,
    games,
    matches,
    roflParticipantDataV1,
    scrimParticipants,
    scrims
} from '../db/schema.ts';

export type AuctionChampionResolver = (id: string) => ChampionRef;

/** 현재 계정 소유자가 아니라 해당 시즌의 실제 출전자에게 귀속된 경매 참고 전적을 읽는다. */
export async function auctionTargetProfile(
    tx: Transaction,
    guildId: string,
    seasonId: string | null,
    userId: string | null,
    champion: AuctionChampionResolver
): Promise<(TargetProfile & { recentChronologyKnown: boolean }) | null> {
    if (!seasonId || !userId) return null;
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

    const laneGames = Object.fromEntries(LANES.map((lane) => [lane, 0])) as TargetProfile['laneGames'];
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
        // 실제 제공하지 않는 선호 챔피언·외부 Riot 캐시를 내전 기록으로 대체하지 않는다.
        preferredChampions: [],
        riot: null
    };
}
