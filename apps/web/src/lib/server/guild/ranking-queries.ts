import { and, asc, count, desc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import type { LolPosition, RankingEntry, RankingPage } from '../../features/guild/types.ts';
import type { Actor } from '../auth/types.ts';
import type { Database } from '../db/types.ts';
import {
    gameMmrApplications,
    gameParticipants,
    games,
    guildMembers,
    lolPosition,
    matches,
    mmrLedgerEntries,
    mmrSeasons,
    roflParticipantDataV1,
    scrimParticipants,
    scrims,
    userPositionMmr,
    users
} from '../db/schema.ts';
import { DomainError } from '../errors.ts';
import { readGuild } from '../scrims/queries.ts';

/** 현재 시즌의 유효 반영만 경기 수·승률에 포함하고, 점수와 순번은 반올림하지 않는다. */
export async function queryRankingPage(
    db: Database,
    actor: Actor | null,
    guildId: string,
    position: LolPosition,
    options: {
        offset: number;
        limit: number;
        userId: string | null;
        championIcon?: (championId: string) => string | null;
    }
): Promise<{ seasonName: string; page: RankingPage } | null> {
    if (
        !lolPosition.enumValues.includes(position) ||
        !Number.isInteger(options.offset) ||
        options.offset < 0 ||
        options.offset > 1_000_000 ||
        !Number.isInteger(options.limit) ||
        options.limit < 1 ||
        options.limit > 100
    ) {
        throw new DomainError('INVALID_INPUT', '순위 범위를 다시 확인해 주세요');
    }
    return readGuild(db, actor, guildId, async (tx) => {
        const season = await tx.query.mmrSeasons.findFirst({
            where: and(eq(mmrSeasons.guildId, guildId), isNull(mmrSeasons.endedAt))
        });
        if (!season) return null;
        const ranked = tx.$with('ranked').as(
            tx
                .select({
                    userId: users.id,
                    displayName: sql<string>`coalesce(${users.globalName}, ${users.username})`.as(
                        'display_name'
                    ),
                    mmr: userPositionMmr.mmr,
                    rank: sql<number>`row_number() over (order by ${userPositionMmr.mmr} desc, ${users.id} asc)::integer`.as(
                        'rank'
                    ),
                    games: sql<number>`count(${scrimParticipants.id})::integer`.as('game_count'),
                    wins: sql<number>`count(${scrimParticipants.id}) filter (where ${gameParticipants.side} = ${games.winnerSide})::integer`.as(
                        'wins'
                    )
                })
                .from(userPositionMmr)
                .innerJoin(users, eq(users.id, userPositionMmr.userId))
                .innerJoin(
                    guildMembers,
                    and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, users.id))
                )
                .leftJoin(
                    mmrLedgerEntries,
                    and(
                        eq(mmrLedgerEntries.ratingId, userPositionMmr.id),
                        eq(mmrLedgerEntries.kind, 'game_result')
                    )
                )
                .leftJoin(
                    gameMmrApplications,
                    and(
                        eq(gameMmrApplications.id, mmrLedgerEntries.applicationId),
                        isNull(gameMmrApplications.reversedAt)
                    )
                )
                .leftJoin(
                    games,
                    and(
                        eq(games.id, gameMmrApplications.gameId),
                        eq(games.roflMetadataId, gameMmrApplications.roflMetadataId),
                        eq(games.status, 'completed')
                    )
                )
                .leftJoin(matches, and(eq(matches.id, games.matchId), ne(matches.status, 'cancelled')))
                .leftJoin(
                    scrims,
                    and(
                        eq(scrims.id, matches.scrimId),
                        eq(scrims.guildId, guildId),
                        eq(scrims.mmrSeasonId, season.id),
                        ne(scrims.status, 'cancelled')
                    )
                )
                .leftJoin(
                    gameParticipants,
                    and(
                        eq(gameParticipants.gameId, games.id),
                        eq(gameParticipants.scrimId, scrims.id),
                        eq(gameParticipants.scrimParticipantId, mmrLedgerEntries.scrimParticipantId),
                        eq(gameParticipants.roflMetadataId, games.roflMetadataId),
                        eq(gameParticipants.position, userPositionMmr.position)
                    )
                )
                .leftJoin(
                    scrimParticipants,
                    and(
                        eq(scrimParticipants.id, gameParticipants.scrimParticipantId),
                        eq(scrimParticipants.userId, users.id)
                    )
                )
                .where(and(eq(userPositionMmr.seasonId, season.id), eq(userPositionMmr.position, position)))
                .groupBy(userPositionMmr.id, users.id)
                .having(sql`count(${scrimParticipants.id}) > 0`)
        );
        const rows = await tx
            .with(ranked)
            .select()
            .from(ranked)
            .orderBy(asc(ranked.rank))
            .limit(options.limit + 1)
            .offset(options.offset);
        const mine = options.userId
            ? await tx.with(ranked).select().from(ranked).where(eq(ranked.userId, options.userId)).limit(1)
            : [];
        const selectedUsers = [
            ...new Set([...rows.slice(0, options.limit), ...mine].map((row) => row.userId))
        ];
        // 대표 챔피언은 현재 시즌·실제 포지션의 정상 기록에서 최다 사용, 동률이면 식별자 순으로 고른다.
        const championCounts = selectedUsers.length
            ? await tx
                  .select({
                      userId: scrimParticipants.userId,
                      champion: roflParticipantDataV1.champion,
                      games: count()
                  })
                  .from(gameParticipants)
                  .innerJoin(scrimParticipants, eq(scrimParticipants.id, gameParticipants.scrimParticipantId))
                  .innerJoin(
                      games,
                      and(
                          eq(games.id, gameParticipants.gameId),
                          eq(games.roflMetadataId, gameParticipants.roflMetadataId),
                          eq(games.status, 'completed')
                      )
                  )
                  .innerJoin(matches, and(eq(matches.id, games.matchId), ne(matches.status, 'cancelled')))
                  .innerJoin(
                      scrims,
                      and(
                          eq(scrims.id, games.scrimId),
                          eq(scrims.guildId, guildId),
                          eq(scrims.mmrSeasonId, season.id),
                          ne(scrims.status, 'cancelled')
                      )
                  )
                  .innerJoin(
                      roflParticipantDataV1,
                      and(
                          eq(roflParticipantDataV1.roflMetadataId, gameParticipants.roflMetadataId),
                          eq(roflParticipantDataV1.participantIndex, gameParticipants.roflParticipantIndex)
                      )
                  )
                  .where(
                      and(
                          inArray(scrimParticipants.userId, selectedUsers),
                          eq(gameParticipants.position, position),
                          isNotNull(roflParticipantDataV1.champion)
                      )
                  )
                  .groupBy(scrimParticipants.userId, roflParticipantDataV1.champion)
                  .orderBy(desc(count()), asc(roflParticipantDataV1.champion))
            : [];
        const entry = (row: (typeof rows)[number]): RankingEntry => {
            const championId = championCounts.find((champion) => champion.userId === row.userId)?.champion;
            return {
                ...row,
                iconUrl: championId ? (options.championIcon?.(championId) ?? null) : null,
                isMe: row.userId === options.userId
            };
        };
        return {
            seasonName: season.name,
            page: {
                entries: rows.slice(0, options.limit).map(entry),
                hasMore: rows.length > options.limit,
                me: mine[0] ? entry(mine[0]) : null
            }
        };
    });
}
