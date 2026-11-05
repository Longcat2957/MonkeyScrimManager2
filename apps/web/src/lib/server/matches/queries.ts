import { and, asc, count, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type {
    GameDetail,
    GamePlayer,
    GameResolvers,
    MatchDetail,
    MatchListItem,
    MatchStatusFilter
} from '../../features/matches/types.ts';
import type { Actor } from '../auth/types.ts';
import type { Database, Transaction } from '../db/types.ts';
import {
    gameMmrApplications,
    gameParticipants,
    games,
    matches,
    roflGameDataV1,
    roflMetadata,
    roflParticipantDataV1,
    scrimParticipants,
    scrimTeams,
    scrims
} from '../db/schema.ts';
import { DomainError } from '../errors.ts';
import { readGuild } from '../scrims/queries.ts';
import { requireUuid } from '../scrims/validation.ts';

const teamA = alias(scrimTeams, 'match_team_a');
const teamB = alias(scrimTeams, 'match_team_b');
const baseColumns = { match: matches, scrimTitle: scrims.title, teamA: teamA.name, teamB: teamB.name };
const doneStatuses = ['completed', 'ended_early', 'cancelled'] as const;

export function winnerSlot(
    game: Pick<typeof games.$inferSelect, 'winnerSide' | 'blueTeamSlot'>
): 'a' | 'b' | null {
    if (!game.winnerSide) return null;
    return game.winnerSide === 'blue' ? game.blueTeamSlot : game.blueTeamSlot === 'a' ? 'b' : 'a';
}

function baseQuery(tx: Transaction) {
    return tx
        .select(baseColumns)
        .from(matches)
        .innerJoin(scrims, eq(scrims.id, matches.scrimId))
        .innerJoin(teamA, eq(teamA.id, matches.teamAId))
        .innerJoin(teamB, eq(teamB.id, matches.teamBId));
}

export async function listMatches(
    db: Database,
    actor: Actor | null,
    guildId: string,
    options: { status: MatchStatusFilter; q?: string; page: number; pageSize: number }
) {
    if (
        !['all', 'in_progress', 'done'].includes(options.status) ||
        !Number.isInteger(options.page) ||
        options.page < 1 ||
        options.page > 100_000 ||
        !Number.isInteger(options.pageSize) ||
        options.pageSize < 1 ||
        options.pageSize > 100
    )
        throw new DomainError('INVALID_INPUT', '목록 범위를 다시 확인해 주세요');
    return readGuild(db, actor, guildId, async (tx) => {
        const text = (options.q ?? '')
            .trim()
            .slice(0, 50)
            .replaceAll('\\', '\\\\')
            .replaceAll('%', '\\%')
            .replaceAll('_', '\\_');
        const condition = and(
            eq(scrims.guildId, guildId),
            options.status === 'done'
                ? inArray(matches.status, [...doneStatuses])
                : options.status === 'in_progress'
                  ? inArray(matches.status, ['pending', 'in_progress'])
                  : undefined,
            text
                ? or(
                      ilike(scrims.title, `%${text}%`),
                      ilike(teamA.name, `%${text}%`),
                      ilike(teamB.name, `%${text}%`)
                  )
                : undefined
        );
        const rows = await baseQuery(tx)
            .where(condition)
            .orderBy(desc(matches.createdAt), asc(matches.id))
            .limit(options.pageSize)
            .offset((options.page - 1) * options.pageSize);
        const [total] = await tx
            .select({ value: count() })
            .from(matches)
            .innerJoin(scrims, eq(scrims.id, matches.scrimId))
            .innerJoin(teamA, eq(teamA.id, matches.teamAId))
            .innerJoin(teamB, eq(teamB.id, matches.teamBId))
            .where(condition);
        const [all] = await tx
            .select({ value: count() })
            .from(matches)
            .innerJoin(scrims, eq(scrims.id, matches.scrimId))
            .where(eq(scrims.guildId, guildId));
        const recorded = rows.length
            ? await tx
                  .select()
                  .from(games)
                  .where(
                      and(
                          inArray(
                              games.matchId,
                              rows.map((row) => row.match.id)
                          ),
                          eq(games.status, 'completed')
                      )
                  )
            : [];
        const items: MatchListItem[] = rows.map((row) => {
            const list = recorded.filter((game) => game.matchId === row.match.id);
            const played = list
                .flatMap((game) => (game.startedAt ? [game.startedAt.toISOString()] : []))
                .sort();
            return {
                id: row.match.id,
                scrimTitle: row.scrimTitle,
                teamA: row.teamA,
                teamB: row.teamB,
                scoreA: list.filter((game) => winnerSlot(game) === 'a').length,
                scoreB: list.filter((game) => winnerSlot(game) === 'b').length,
                bestOf: row.match.bestOf,
                status: row.match.status,
                playedAt: played[0] ?? null
            };
        });
        return { matches: items, total: total.value, empty: all.value === 0 };
    });
}

/** 채택된 ROFL과 당시 출전 기록만 화면에 매핑하며 현재 계정 연결이나 편성으로 과거를 바꾸지 않는다. */
export async function getMatch(
    db: Database,
    actor: Actor | null,
    guildId: string,
    matchId: string,
    gameId: string | null,
    resolvers: GameResolvers
) {
    requireUuid(matchId, '경기');
    return readGuild(db, actor, guildId, async (tx) => {
        const [row] = await baseQuery(tx)
            .where(and(eq(scrims.guildId, guildId), eq(matches.id, matchId)))
            .limit(1);
        if (!row) return null;
        const recorded = await tx
            .select({ game: games, metadata: roflMetadata, result: roflGameDataV1 })
            .from(games)
            .innerJoin(roflMetadata, eq(roflMetadata.id, games.roflMetadataId))
            .leftJoin(roflGameDataV1, eq(roflGameDataV1.roflMetadataId, games.roflMetadataId))
            .where(and(eq(games.matchId, matchId), eq(games.status, 'completed')))
            .orderBy(asc(games.gameNumber));
        const players = recorded.length
            ? await tx
                  .select({
                      player: gameParticipants,
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
                          recorded.map((item) => item.game.id)
                      )
                  )
                  .orderBy(asc(gameParticipants.roflParticipantIndex))
            : [];
        const selected = recorded.find((item) => item.game.id === gameId) ?? recorded.at(-1);
        const match: MatchDetail = {
            id: row.match.id,
            scrim: { id: row.match.scrimId, title: row.scrimTitle },
            teamA: row.teamA,
            teamB: row.teamB,
            bestOf: row.match.bestOf,
            status: row.match.status,
            hardFearless: row.match.isHardFearless,
            scoreA: recorded.filter((item) => winnerSlot(item.game) === 'a').length,
            scoreB: recorded.filter((item) => winnerSlot(item.game) === 'b').length,
            games: recorded.map(({ game }) => ({
                id: game.id,
                order: game.gameNumber,
                winner: winnerSlot(game)
            }))
        };
        const usedBefore = (number: number) => {
            const used = new Set<string>();
            for (const item of recorded.filter((item) => item.game.gameNumber < number)) {
                for (const player of players.filter((player) => player.player.gameId === item.game.id)) {
                    if (player.data?.champion) used.add(player.data.champion);
                }
            }
            return used;
        };
        let game: GameDetail | null = null;
        if (selected) {
            const previous = usedBefore(selected.game.gameNumber);
            const applications = await tx
                .select({ id: gameMmrApplications.id })
                .from(gameMmrApplications)
                .where(
                    and(
                        eq(gameMmrApplications.gameId, selected.game.id),
                        eq(gameMmrApplications.roflMetadataId, selected.metadata.id),
                        isNull(gameMmrApplications.reversedAt)
                    )
                )
                .limit(1);
            game = {
                id: selected.game.id,
                order: selected.game.gameNumber,
                durationSec:
                    selected.result?.gameLengthMs == null
                        ? null
                        : Math.floor(selected.result.gameLengthMs / 1000),
                playedAt: selected.game.startedAt?.toISOString() ?? null,
                patch: selected.metadata.gameVersion,
                mmrStatus: applications.length ? 'applied' : 'pending',
                splashUrl: null,
                sides: (['blue', 'red'] as const).map((side) => {
                    const slot =
                        side === 'blue'
                            ? selected.game.blueTeamSlot
                            : selected.game.blueTeamSlot === 'a'
                              ? 'b'
                              : 'a';
                    return {
                        side,
                        slot,
                        teamName: slot === 'a' ? row.teamA : row.teamB,
                        win: selected.game.winnerSide === side,
                        players: players
                            .filter(
                                (item) => item.player.gameId === selected.game.id && item.player.side === side
                            )
                            .map(({ player, userId, data }): GamePlayer => {
                                const s = data?.stats;
                                return {
                                    key: player.scrimParticipantId,
                                    userId,
                                    displayName: player.displayName,
                                    riotId:
                                        player.riotGameName && player.riotTagLine
                                            ? `${player.riotGameName}#${player.riotTagLine}`
                                            : null,
                                    champion: data?.champion
                                        ? resolvers.champion(data.champion)
                                        : { id: 'unknown', name: '미확인', iconUrl: null },
                                    level: s?.level ?? null,
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
                                    wardsPlaced: s?.wardsPlaced ?? null,
                                    wardsKilled: s?.wardsKilled ?? null,
                                    controlWards: s?.controlWardsBought ?? null,
                                    heal: s?.totalHeal ?? null,
                                    shield: s?.damageShieldedOnTeammates ?? null,
                                    largestKillingSpree: s?.largestKillingSpree ?? null,
                                    multiKills: {
                                        double: s?.doubleKills ?? null,
                                        triple: s?.tripleKills ?? null,
                                        quadra: s?.quadraKills ?? null,
                                        penta: s?.pentaKills ?? null
                                    },
                                    items: (data?.loadout.itemIds ?? Array(7).fill(null)).map(resolvers.item),
                                    spells: (data?.loadout.summonerSpellIds ?? [null, null]).map(
                                        resolvers.spell
                                    ),
                                    keystone: resolvers.rune(data?.loadout.runeIds[0] ?? null),
                                    secondaryStyle: resolvers.rune(
                                        data?.loadout.secondaryRuneStyleId ?? null
                                    ),
                                    score: null,
                                    badge: null,
                                    fearlessViolation:
                                        row.match.isHardFearless &&
                                        Boolean(data?.champion && previous.has(data.champion))
                                };
                            })
                    };
                })
            };
        }
        const used =
            row.match.isHardFearless && row.match.status === 'in_progress' ? usedBefore(Infinity) : null;
        return {
            match,
            game,
            usedChampions: used?.size ? [...used].map(resolvers.champion) : null,
            // 서버의 ROFL 귀속 검증이 연결되면 운영자와 실제 출전자에게 업로드를 연다.
            can: { upload: false }
        };
    });
}
