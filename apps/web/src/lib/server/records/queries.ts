import { and, asc, count, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { ChampionRef, PlayerGame } from '../../features/players/types.ts';
import type { Actor } from '../auth/types.ts';
import type { Database, Transaction } from '../db/types.ts';
import {
    gameMmrApplications,
    gameParticipants,
    games,
    guildMembers,
    guildRiotAccounts,
    lolPosition,
    matches,
    mmrLedgerEntries,
    mmrSeasons,
    riotAccounts,
    roflGameDataV1,
    roflParticipantDataV1,
    scrimParticipants,
    scrims,
    userPositionMmr,
    users
} from '../db/schema.ts';
import { isDiscordId } from '../discord/client.ts';
import { DomainError } from '../errors.ts';
import { INITIAL_MMR } from '../mmr/rules.ts';
import { readGuild } from '../scrims/queries.ts';

type ChampionResolver = (id: string) => ChampionRef;
export type GuildPlayerRecords = {
    userId: string;
    displayName: string;
    iconUrl: string | null;
    championId: string | null;
    games: PlayerGame[];
};
type RecordedGame = { id: string; durationSec: number | null; kills: number | null };

async function activeSeason(tx: Transaction, guildId: string) {
    return tx.query.mmrSeasons.findFirst({
        where: and(eq(mmrSeasons.guildId, guildId), isNull(mmrSeasons.endedAt))
    });
}

/** 현재 계정 연결과 무관하게 당시 출전자 및 Game에 채택된 ROFL만 전적의 원천으로 사용한다. */
async function recordsInTransaction(
    tx: Transaction,
    guildId: string,
    seasonId: string | null,
    champion: ChampionResolver
) {
    if (!seasonId)
        return {
            players: [] as GuildPlayerRecords[],
            allGames: [] as PlayerGame[],
            recordedGames: [] as RecordedGame[]
        };
    const completed = await tx
        .select({ game: games, scrimTitle: scrims.title, result: roflGameDataV1 })
        .from(games)
        .innerJoin(scrims, eq(scrims.id, games.scrimId))
        .innerJoin(matches, eq(matches.id, games.matchId))
        .leftJoin(roflGameDataV1, eq(roflGameDataV1.roflMetadataId, games.roflMetadataId))
        // MSM1처럼 현재 시즌의 유효 경기만 집계한다. 중도 종료까지 정상 기록된 Game은 유지한다.
        .where(
            and(
                eq(scrims.guildId, guildId),
                eq(scrims.mmrSeasonId, seasonId),
                ne(scrims.status, 'cancelled'),
                ne(matches.status, 'cancelled'),
                eq(games.status, 'completed')
            )
        )
        .orderBy(
            sql`${games.startedAt} desc nulls last`,
            asc(games.matchId),
            desc(games.gameNumber),
            asc(games.id)
        );
    const participants = completed.length
        ? await tx
              .select({
                  participant: gameParticipants,
                  userId: scrimParticipants.userId,
                  user: users,
                  data: roflParticipantDataV1
              })
              .from(gameParticipants)
              .innerJoin(scrimParticipants, eq(scrimParticipants.id, gameParticipants.scrimParticipantId))
              .leftJoin(users, eq(users.id, scrimParticipants.userId))
              .leftJoin(
                  roflParticipantDataV1,
                  and(
                      eq(roflParticipantDataV1.roflMetadataId, gameParticipants.roflMetadataId),
                      eq(roflParticipantDataV1.participantIndex, gameParticipants.roflParticipantIndex)
                  )
              )
              .where(
                  inArray(
                      gameParticipants.gameId,
                      completed.map(({ game }) => game.id)
                  )
              )
              .orderBy(asc(gameParticipants.roflParticipantIndex))
        : [];
    const players = new Map<string, GuildPlayerRecords>();
    const allGames: PlayerGame[] = [];
    const recordedGames = completed.map(({ game, result }) => {
        const roster = participants.filter(
            (entry) =>
                entry.participant.gameId === game.id &&
                entry.participant.roflMetadataId === game.roflMetadataId
        );
        const kills = roster.map((entry) => entry.data?.stats.kills ?? null);
        return {
            id: game.id,
            durationSec: result ? Math.floor(result.gameLengthMs / 1000) : null,
            kills:
                roster.length === 10 && kills.every((value) => value !== null)
                    ? kills.reduce<number>((sum, value) => sum + value!, 0)
                    : null
        };
    });
    for (const { game, scrimTitle, result } of completed) {
        const roster = participants.filter(
            (entry) =>
                entry.participant.gameId === game.id &&
                entry.participant.roflMetadataId === game.roflMetadataId
        );
        for (const { participant, userId, user, data } of roster) {
            const s = data?.stats;
            const teammates = roster.filter((entry) => entry.participant.side === participant.side);
            const kills = teammates.map((entry) => entry.data?.stats.kills ?? null);
            const record: PlayerGame = {
                matchId: game.matchId,
                gameId: game.id,
                scrimTitle,
                playedAt: game.startedAt?.toISOString() ?? null,
                win: game.winnerSide === participant.side,
                champion: data?.champion
                    ? champion(data.champion)
                    : { id: 'unknown', name: '미확인', iconUrl: null },
                position: participant.position,
                kills: s?.kills ?? null,
                deaths: s?.deaths ?? null,
                assists: s?.assists ?? null,
                cs:
                    s?.minionsKilled != null && s.neutralMinionsKilled != null
                        ? s.minionsKilled + s.neutralMinionsKilled
                        : null,
                damage: s?.damageDealtToChampions ?? null,
                damageTaken: s?.damageTaken ?? null,
                gold: s?.goldEarned ?? null,
                visionScore: s?.visionScore ?? null,
                teamKills:
                    teammates.length === 5 && kills.every((value) => value !== null)
                        ? kills.reduce<number>((sum, value) => sum + value!, 0)
                        : null,
                durationSec: result ? Math.floor(result.gameLengthMs / 1000) : null,
                teammates: teammates.flatMap((entry) =>
                    entry.userId && entry.userId !== userId
                        ? [{ userId: entry.userId, displayName: entry.participant.displayName }]
                        : []
                )
            };
            allGames.push(record);
            if (!userId) continue;
            const player = players.get(userId) ?? {
                userId,
                displayName: user?.globalName ?? user?.username ?? participant.displayName,
                iconUrl: user?.avatarHash
                    ? `https://cdn.discordapp.com/avatars/${userId}/${user.avatarHash}.webp?size=128`
                    : null,
                championId: null,
                games: []
            };
            player.games.push(record);
            players.set(userId, player);
        }
    }
    return { players: [...players.values()], allGames, recordedGames };
}

export async function getGuildRecords(
    db: Database,
    actor: Actor | null,
    guildId: string,
    champion: ChampionResolver
) {
    return readGuild(db, actor, guildId, async (tx) =>
        recordsInTransaction(tx, guildId, (await activeSeason(tx, guildId))?.id ?? null, champion)
    );
}

export async function getPlayerRecords(
    db: Database,
    actor: Actor | null,
    guildId: string,
    userId: string,
    champion: ChampionResolver
) {
    if (!isDiscordId(userId)) throw new DomainError('NOT_FOUND', '사용자를 찾을 수 없어요');
    return readGuild(db, actor, guildId, async (tx) => {
        const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user) throw new DomainError('NOT_FOUND', '사용자를 찾을 수 없어요');
        const [member] = await tx
            .select({ id: guildMembers.userId })
            .from(guildMembers)
            .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, userId)))
            .limit(1);
        const linked = await tx
            .select({ gameName: riotAccounts.gameName, tagLine: riotAccounts.tagLine })
            .from(guildRiotAccounts)
            .innerJoin(riotAccounts, eq(riotAccounts.id, guildRiotAccounts.riotAccountId))
            .where(and(eq(guildRiotAccounts.guildId, guildId), eq(guildRiotAccounts.userId, userId)))
            .orderBy(desc(guildRiotAccounts.isPrimary), asc(guildRiotAccounts.linkedAt));
        const [participant] = await tx
            .select({ id: scrimParticipants.id })
            .from(scrimParticipants)
            .innerJoin(scrims, eq(scrims.id, scrimParticipants.scrimId))
            .where(and(eq(scrims.guildId, guildId), eq(scrimParticipants.userId, userId)))
            .limit(1);
        if (!member && !linked.length && !participant)
            throw new DomainError('NOT_FOUND', '이 서버의 사용자를 찾을 수 없어요');
        const season = await activeSeason(tx, guildId);
        const records = await recordsInTransaction(tx, guildId, season?.id ?? null, champion);
        const ratings = season
            ? await tx
                  .select({
                      id: userPositionMmr.id,
                      position: userPositionMmr.position,
                      rating: userPositionMmr.mmr
                  })
                  .from(userPositionMmr)
                  .where(and(eq(userPositionMmr.seasonId, season.id), eq(userPositionMmr.userId, userId)))
            : [];
        const counts = ratings.length
            ? await tx
                  .select({ ratingId: mmrLedgerEntries.ratingId, games: count() })
                  .from(mmrLedgerEntries)
                  .innerJoin(userPositionMmr, eq(userPositionMmr.id, mmrLedgerEntries.ratingId))
                  .innerJoin(gameMmrApplications, eq(gameMmrApplications.id, mmrLedgerEntries.applicationId))
                  .innerJoin(
                      games,
                      and(
                          eq(games.id, gameMmrApplications.gameId),
                          eq(games.roflMetadataId, gameMmrApplications.roflMetadataId)
                      )
                  )
                  .innerJoin(matches, and(eq(matches.id, games.matchId), ne(matches.status, 'cancelled')))
                  .innerJoin(
                      scrims,
                      and(
                          eq(scrims.id, games.scrimId),
                          ne(scrims.status, 'cancelled'),
                          eq(scrims.guildId, guildId)
                      )
                  )
                  .innerJoin(
                      gameParticipants,
                      and(
                          eq(gameParticipants.gameId, games.id),
                          eq(gameParticipants.scrimParticipantId, mmrLedgerEntries.scrimParticipantId),
                          eq(gameParticipants.roflMetadataId, games.roflMetadataId),
                          eq(gameParticipants.position, userPositionMmr.position)
                      )
                  )
                  .innerJoin(
                      scrimParticipants,
                      and(
                          eq(scrimParticipants.id, gameParticipants.scrimParticipantId),
                          eq(scrimParticipants.userId, userId)
                      )
                  )
                  .where(
                      and(
                          inArray(
                              mmrLedgerEntries.ratingId,
                              ratings.map((rating) => rating.id)
                          ),
                          eq(mmrLedgerEntries.kind, 'game_result'),
                          isNull(gameMmrApplications.reversedAt),
                          eq(games.status, 'completed')
                      )
                  )
                  .groupBy(mmrLedgerEntries.ratingId)
            : [];
        return {
            ...records,
            player: {
                userId,
                displayName: user.globalName ?? user.username,
                iconUrl: user.avatarHash
                    ? `https://cdn.discordapp.com/avatars/${userId}/${user.avatarHash}.webp?size=128`
                    : null,
                riotIds: linked.map((account) => `${account.gameName}#${account.tagLine}`)
            },
            games: records.players.find((player) => player.userId === userId)?.games ?? [],
            // 시즌과 사용자가 확정된 미출전 포지션의 1500은 MSM1의 초기값이며 추정 통계가 아니다.
            mmr: season
                ? lolPosition.enumValues.map((position) => {
                      const rating = ratings.find((entry) => entry.position === position);
                      return {
                          position,
                          rating: rating?.rating ?? INITIAL_MMR,
                          games: counts.find((entry) => entry.ratingId === rating?.id)?.games ?? 0
                      };
                  })
                : []
        };
    });
}
