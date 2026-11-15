import { and, asc, count, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { ChampionRef, PlayerGame } from '../../features/players/types.ts';
import type { Actor } from '../auth/types.ts';
import { publicDisplayName, readPublicIdentities, resolveRecordUser } from '../accounts/public-identity.ts';
import type { Database, Transaction } from '../db/types.ts';
import {
    gameMmrApplications,
    gameParticipants,
    games,
    guildMembers,
    guildRiotAccounts,
    lolPosition,
    matches,
    mmrSeasons,
    mmrLedgerEntries,
    riotAccounts,
    roflGameDataV1,
    roflParticipantDataV1,
    scrimParticipants,
    scrims,
    userPositionMmr,
    users
} from '../db/schema.ts';
import { DiscordError, isDiscordId } from '../discord/client.ts';
import { DomainError } from '../errors.ts';
import { requireGuildAdmin } from '../guild/access.ts';
import { INITIAL_MMR } from '../mmr/rules.ts';
import { readGuild } from '../scrims/queries.ts';
import type { ScrimAccessDependencies } from '../scrims/service.ts';
import { selectRecordSeason } from './seasons.ts';

type ChampionResolver = (id: string) => ChampionRef;
export type GuildPlayerRecords = {
    userId: string;
    displayName: string;
    iconUrl: string | null;
    championId: string | null;
    games: PlayerGame[];
};
type RecordedGame = { id: string; durationSec: number | null; kills: number | null };

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
        // MSM1처럼 선택한 시즌의 유효 경기만 집계한다. 중도 종료까지 정상 기록된 Game은 유지한다.
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
                  data: roflParticipantDataV1
              })
              .from(gameParticipants)
              .innerJoin(scrimParticipants, eq(scrimParticipants.id, gameParticipants.scrimParticipantId))
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
    const identities = await readPublicIdentities(
        tx,
        participants.map((entry) => entry.userId)
    );
    const participantsByGame = new Map<string, typeof participants>();
    for (const entry of participants) {
        const gameId = entry.participant.gameId;
        const roster = participantsByGame.get(gameId);
        if (roster) roster.push(entry);
        else participantsByGame.set(gameId, [entry]);
    }
    const players = new Map<string, GuildPlayerRecords>();
    const allGames: PlayerGame[] = [];
    const recordedGames = completed.map(({ game, result }) => {
        const roster = (participantsByGame.get(game.id) ?? []).filter(
            (entry) => entry.participant.roflMetadataId === game.roflMetadataId
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
        const roster = (participantsByGame.get(game.id) ?? []).filter(
            (entry) => entry.participant.roflMetadataId === game.roflMetadataId
        );
        for (const { participant, userId, data } of roster) {
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
                teammates: teammates.flatMap((entry) => {
                    const identity = entry.userId ? identities.get(entry.userId) : undefined;
                    return identity && entry.userId !== userId
                        ? [
                              {
                                  userId: identity.userId,
                                  displayName: publicDisplayName(identity, entry.participant.displayName)
                              }
                          ]
                        : [];
                })
            };
            allGames.push(record);
            if (!userId) continue;
            const identity = identities.get(userId);
            if (!identity) continue;
            const player = players.get(userId) ?? {
                userId: identity.userId,
                displayName: publicDisplayName(identity),
                iconUrl: identity.avatarUrl,
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
    champion: ChampionResolver,
    seasonId?: string | null
) {
    return readGuild(db, actor, guildId, async (tx) => {
        const selection = await selectRecordSeason(tx, guildId, seasonId);
        return {
            ...selection,
            ...(await recordsInTransaction(tx, guildId, selection.selectedSeasonId, champion))
        };
    });
}

export async function getPlayerRecords(
    db: Database,
    actor: Actor | null,
    guildId: string,
    identifier: string,
    champion: ChampionResolver,
    seasonId?: string | null,
    access?: ScrimAccessDependencies
) {
    // 기존 Discord 경로의 관리자 예외만 실효 권한을 확인한다. 공개 UUID 조회는 외부 연동이 필요 없다.
    let privateLegacyAdmin = false;
    if (isDiscordId(identifier) && actor && actor.userId !== identifier) {
        const [profile] = await db
            .select({ publicProfile: users.publicProfile, withdrawnAt: users.withdrawnAt })
            .from(users)
            .where(eq(users.id, identifier));
        if (profile && (!profile.publicProfile || profile.withdrawnAt !== null)) {
            try {
                await requireGuildAdmin(actor, guildId, { ...access, db });
                privateLegacyAdmin = true;
            } catch (cause) {
                if (!(cause instanceof DomainError || cause instanceof DiscordError)) throw cause;
                throw new DomainError('NOT_FOUND', '사용자를 찾을 수 없어요');
            }
        }
    }
    return readGuild(db, actor, guildId, async (tx) => {
        const user = await resolveRecordUser(tx, identifier, actor, privateLegacyAdmin);
        const userId = user.id;
        const identity = (await readPublicIdentities(tx, [userId])).get(userId)!;
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
        if (!member && !linked.length && !participant) {
            const [rating] = await tx
                .select({ id: userPositionMmr.id })
                .from(userPositionMmr)
                .innerJoin(mmrSeasons, eq(mmrSeasons.id, userPositionMmr.seasonId))
                .where(and(eq(mmrSeasons.guildId, guildId), eq(userPositionMmr.userId, userId)))
                .limit(1);
            if (!rating) throw new DomainError('NOT_FOUND', '이 서버의 사용자를 찾을 수 없어요');
        }
        const selection = await selectRecordSeason(tx, guildId, seasonId);
        const selectedId = selection.selectedSeasonId;
        const records = await recordsInTransaction(tx, guildId, selectedId, champion);
        const ratings = selectedId
            ? await tx
                  .select({
                      id: userPositionMmr.id,
                      position: userPositionMmr.position,
                      rating: userPositionMmr.mmr
                  })
                  .from(userPositionMmr)
                  .where(and(eq(userPositionMmr.seasonId, selectedId), eq(userPositionMmr.userId, userId)))
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
            ...selection,
            ...records,
            player: {
                userId: identity.userId,
                displayName: publicDisplayName(identity),
                iconUrl: identity.avatarUrl,
                riotIds: identity.showRiotIds
                    ? linked.map((account) => `${account.gameName}#${account.tagLine}`)
                    : []
            },
            games: records.players.find((player) => player.userId === identity.userId)?.games ?? [],
            // 시즌과 사용자가 확정된 미출전 포지션의 1500은 MSM1의 초기값이며 추정 통계가 아니다.
            mmr: selectedId
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
