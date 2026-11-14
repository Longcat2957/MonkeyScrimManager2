import { and, count, eq, inArray, lt, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { pairKey, type FormationPlayer, type PairRecord } from '../../features/scrims/formation.ts';
import type { Transaction } from '../db/types.ts';
import { gameParticipants, games, matches, scrimParticipants, scrims } from '../db/schema.ts';

/** 현재 편성의 사용자 쌍을 같은 시즌의 채택 ROFL 실출전과 연결한다. */
export async function formationPairRecords(
    tx: Transaction,
    guildId: string,
    seasonId: string | null,
    players: FormationPlayer[]
): Promise<Record<string, PairRecord>> {
    const people = new Map(
        players.flatMap((player) => (player.userId ? [[player.userId, player] as const] : []))
    );
    if (!seasonId || people.size < 2) return {};

    const firstParticipation = alias(gameParticipants, 'formation_first_participation');
    const secondParticipation = alias(gameParticipants, 'formation_second_participation');
    const firstPerson = alias(scrimParticipants, 'formation_first_person');
    const secondPerson = alias(scrimParticipants, 'formation_second_person');
    const sameTeam = sql<boolean>`${firstParticipation.side} = ${secondParticipation.side}`;
    const firstWon = sql<boolean>`${firstParticipation.side} = ${games.winnerSide}`;
    const userIds = [...people.keys()];
    // 현재 계정 소유·희망 포지션 대신 당시 사용자 귀속·진영·확정 출전 포지션만 읽는다.
    const history = await tx
        .select({
            firstUserId: firstPerson.userId,
            secondUserId: secondPerson.userId,
            firstPosition: firstParticipation.position,
            secondPosition: secondParticipation.position,
            sameTeam,
            firstWon,
            plays: count()
        })
        .from(games)
        .innerJoin(scrims, eq(scrims.id, games.scrimId))
        .innerJoin(matches, eq(matches.id, games.matchId))
        .innerJoin(
            firstParticipation,
            and(
                eq(firstParticipation.gameId, games.id),
                eq(firstParticipation.roflMetadataId, games.roflMetadataId)
            )
        )
        .innerJoin(firstPerson, eq(firstPerson.id, firstParticipation.scrimParticipantId))
        .innerJoin(
            secondParticipation,
            and(
                eq(secondParticipation.gameId, games.id),
                eq(secondParticipation.roflMetadataId, games.roflMetadataId)
            )
        )
        .innerJoin(secondPerson, eq(secondPerson.id, secondParticipation.scrimParticipantId))
        .where(
            and(
                eq(scrims.guildId, guildId),
                eq(scrims.mmrSeasonId, seasonId),
                ne(scrims.status, 'cancelled'),
                ne(matches.status, 'cancelled'),
                eq(games.status, 'completed'),
                inArray(firstPerson.userId, userIds),
                inArray(secondPerson.userId, userIds),
                lt(firstPerson.userId, secondPerson.userId)
            )
        )
        .groupBy(
            firstPerson.userId,
            secondPerson.userId,
            firstParticipation.position,
            secondParticipation.position,
            sameTeam,
            firstWon
        );

    const pairs: Record<string, PairRecord> = {};
    for (const entry of history) {
        const first = entry.firstUserId ? people.get(entry.firstUserId) : undefined;
        const second = entry.secondUserId ? people.get(entry.secondUserId) : undefined;
        if (!first || !second) continue;
        const lane =
            entry.firstPosition && entry.firstPosition === entry.secondPosition ? entry.firstPosition : null;
        if (!entry.sameTeam && !lane) continue;

        const key = pairKey(first.participantId, second.participantId);
        const pair = (pairs[key] ??= {
            together: { plays: 0, wins: 0 },
            against: { plays: 0, firstWins: 0 },
            againstByLane: {}
        });
        if (entry.sameTeam) {
            pair.together.plays += entry.plays;
            if (entry.firstWon) pair.together.wins += entry.plays;
        } else if (lane) {
            // pairKey는 현재 참가자 UUID 순서이므로 과거 사용자 ID 정렬과 승수 방향을 맞춘다.
            const firstInPairWon =
                first.participantId < second.participantId ? entry.firstWon : !entry.firstWon;
            const laneRecord = (pair.againstByLane![lane] ??= { plays: 0, firstWins: 0 });
            pair.against.plays += entry.plays;
            laneRecord.plays += entry.plays;
            if (firstInPairWon) {
                pair.against.firstWins += entry.plays;
                laneRecord.firstWins += entry.plays;
            }
        }
    }
    return pairs;
}
