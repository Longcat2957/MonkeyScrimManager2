import {
    and,
    asc,
    count,
    eq,
    gte,
    ilike,
    inArray,
    isNotNull,
    isNull,
    lt,
    min,
    ne,
    or,
    sql
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
    matchSearchTerms,
    parseMatchDateFilters,
    type MatchArchiveFilters
} from '../../features/matches/filters.ts';
import type {
    GameDetail,
    GamePlayer,
    GameResolvers,
    MatchDetail,
    MatchListItem
} from '../../features/matches/types.ts';
import type { SeriesTitleId, SetTitle } from '../../features/matches/titles.ts';
import type { Actor } from '../auth/types.ts';
import { publicDisplayName, readPublicIdentities } from '../accounts/public-identity.ts';
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
    scrims,
    users
} from '../db/schema.ts';
import { DomainError } from '../errors.ts';
import { selectRecordSeason } from '../records/seasons.ts';
import { readGuild } from '../scrims/queries.ts';
import { requireUuid } from '../scrims/validation.ts';
import { seriesTitleQuery, setTitleQuery } from './titles.ts';

const teamA = alias(scrimTeams, 'match_team_a');
const teamB = alias(scrimTeams, 'match_team_b');
const baseColumns = { match: matches, scrimTitle: scrims.title, teamA: teamA.name, teamB: teamB.name };

function literalPattern(text: string) {
    return `%${text.replace(/[\\%_]/g, '\\$&')}%`;
}

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
    options: MatchArchiveFilters
) {
    if (
        (options.bestOf != null && ![1, 3, 5].includes(options.bestOf)) ||
        !Number.isInteger(options.page) ||
        options.page < 1 ||
        options.page > 100_000 ||
        !Number.isInteger(options.pageSize) ||
        options.pageSize < 1 ||
        options.pageSize > 100
    )
        throw new DomainError('INVALID_INPUT', '목록 범위를 다시 확인해 주세요');
    const dates = parseMatchDateFilters(options);
    if (dates.error) throw new DomainError('INVALID_INPUT', dates.error);
    return readGuild(db, actor, guildId, async (tx) => {
        const selection = await selectRecordSeason(tx, guildId, options.seasonId);
        const selectedSeasonId = options.seasonId == null ? null : selection.selectedSeasonId;
        // ROFL 팀 번호가 아니라 등록 시 검증한 진영과 블루 팀 슬롯으로 시리즈 점수를 계산한다.
        const wonA = sql`((${games.winnerSide} = 'blue') = (${games.blueTeamSlot} = 'a'))`;
        const scoreA = sql<number>`count(*) filter (where ${wonA})`.mapWith(Number);
        const scoreB = sql<number>`count(*) filter (where not ${wonA})`.mapWith(Number);
        const needed = sql`(${matches.bestOf} / 2 + 1)`;
        const player = options.player?.trim().slice(0, 50);
        const champion = options.champion?.trim().slice(0, 50);
        // 상세와 같은 공개 표시 이름을 사용한다. 실제 출전 한 행에서 이름과 픽을 함께 찾는다.
        const publicName = sql`coalesce(nullif(${gameParticipants.displayName}, ''), nullif(trim(${users.globalName}), ''), ${users.username})`;
        const matchedGame =
            player || champion
                ? tx
                      .select({ id: games.id })
                      .from(games)
                      .innerJoin(
                          gameParticipants,
                          and(
                              eq(gameParticipants.gameId, games.id),
                              eq(gameParticipants.roflMetadataId, games.roflMetadataId)
                          )
                      )
                      .leftJoin(
                          scrimParticipants,
                          eq(scrimParticipants.id, gameParticipants.scrimParticipantId)
                      )
                      .leftJoin(users, eq(users.id, scrimParticipants.userId))
                      .leftJoin(
                          roflParticipantDataV1,
                          and(
                              eq(roflParticipantDataV1.roflMetadataId, gameParticipants.roflMetadataId),
                              eq(
                                  roflParticipantDataV1.participantIndex,
                                  gameParticipants.roflParticipantIndex
                              )
                          )
                      )
                      .where(
                          and(
                              eq(games.matchId, matches.id),
                              eq(games.status, 'completed'),
                              player
                                  ? and(
                                        eq(users.publicProfile, true),
                                        isNull(users.withdrawnAt),
                                        ilike(publicName, literalPattern(player))
                                    )
                                  : undefined,
                              champion
                                  ? or(
                                        ilike(roflParticipantDataV1.champion, literalPattern(champion)),
                                        options.championIds?.length
                                            ? inArray(
                                                  sql`lower(${roflParticipantDataV1.champion})`,
                                                  options.championIds.map((id) => id.toLowerCase())
                                              )
                                            : undefined
                                    )
                                  : undefined
                          )
                      )
                      .orderBy(asc(games.gameNumber), asc(games.id))
                      .limit(1)
                : null;
        const archive = tx
            .select({
                matchedGameId: sql<string | null>`${matchedGame ?? sql`null::uuid`}`.as('matched_game_id'),
                id: matches.id,
                scrimTitle: scrims.title,
                seasonId: scrims.mmrSeasonId,
                teamA: sql<string>`${teamA.name}`.as('team_a'),
                teamB: sql<string>`${teamB.name}`.as('team_b'),
                bestOf: matches.bestOf,
                status: matches.status,
                playedAt: min(games.startedAt).as('played_at'),
                scheduledAt: scrims.expectedStartAt,
                scoreA: scoreA.as('score_a'),
                scoreB: scoreB.as('score_b')
            })
            .from(matches)
            .innerJoin(scrims, eq(scrims.id, matches.scrimId))
            .innerJoin(teamA, eq(teamA.id, matches.teamAId))
            .innerJoin(teamB, eq(teamB.id, matches.teamBId))
            .innerJoin(games, and(eq(games.matchId, matches.id), eq(games.status, 'completed')))
            .leftJoin(
                roflGameDataV1,
                and(
                    eq(roflGameDataV1.roflMetadataId, games.roflMetadataId),
                    eq(roflGameDataV1.resultStatus, 'consistent')
                )
            )
            .where(
                and(
                    eq(scrims.guildId, guildId),
                    ne(scrims.status, 'cancelled'),
                    eq(matches.status, 'completed')
                )
            )
            .groupBy(matches.id, scrims.id, teamA.id, teamB.id)
            .having(
                and(
                    // 완료 세트 하나라도 검증된 ROFL 결과가 없으면 부분 점수를 기록으로 공개하지 않는다.
                    sql`count(*) = count(${roflGameDataV1.roflMetadataId})`,
                    or(
                        and(
                            eq(matches.winnerTeamId, matches.teamAId),
                            eq(scoreA, needed),
                            lt(scoreB, needed)
                        ),
                        and(eq(matches.winnerTeamId, matches.teamBId), eq(scoreB, needed), lt(scoreA, needed))
                    )
                )
            )
            .as('match_archive');
        const condition = and(
            selectedSeasonId ? eq(archive.seasonId, selectedSeasonId) : undefined,
            options.bestOf != null ? eq(archive.bestOf, options.bestOf) : undefined,
            dates.fromInclusive ? gte(archive.playedAt, dates.fromInclusive) : undefined,
            dates.toExclusive ? lt(archive.playedAt, dates.toExclusive) : undefined,
            matchedGame ? isNotNull(archive.matchedGameId) : undefined,
            ...matchSearchTerms(options.q).map((term) => ilike(archive.scrimTitle, literalPattern(term)))
        );
        const [{ value: total }] = await tx.select({ value: count() }).from(archive).where(condition);
        const offset = (options.page - 1) * options.pageSize;
        const rows =
            total > offset
                ? await tx
                      .select()
                      .from(archive)
                      .where(condition)
                      .orderBy(
                          // ROFL에는 절대 시각이 없으므로 실제 시각이 없으면 내전 예정 시각으로 최신순을 정한다.
                          sql`coalesce(${archive.playedAt}, ${archive.scheduledAt}) desc nulls last`,
                          asc(archive.id)
                      )
                      .limit(options.pageSize)
                      .offset(offset)
                : [];
        const empty =
            total === 0 &&
            (!condition || !(await tx.select({ id: archive.id }).from(archive).limit(1)).length);
        const items: MatchListItem[] = rows.map(({ seasonId: _seasonId, playedAt, scheduledAt, ...row }) => ({
            ...row,
            playedAt: playedAt?.toISOString() ?? null,
            scheduledAt: scheduledAt?.toISOString() ?? null
        }));
        return {
            matches: items,
            total,
            empty,
            seasons: selection.seasons,
            selectedSeasonId,
            from: dates.from,
            to: dates.to
        };
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
                  .innerJoin(
                      games,
                      and(
                          eq(games.id, gameParticipants.gameId),
                          eq(games.roflMetadataId, gameParticipants.roflMetadataId)
                      )
                  )
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
        const identities = await readPublicIdentities(
            tx,
            players.map((entry) => entry.userId)
        );
        const selected = recorded.find((item) => item.game.id === gameId) ?? recorded.at(-1);
        let seriesTitle: MatchDetail['seriesTitle'] = null;
        if (recorded.length && row.match.bestOf === 3 && row.match.status === 'completed') {
            const { rows } = await tx.execute<{ id: SeriesTitleId; scrim_participant_id: string }>(
                seriesTitleQuery(guildId, matchId)
            );
            if (rows.length) {
                const recipients = new Set(rows.map((award) => award.scrim_participant_id));
                const finalGameId = recorded.at(-1)!.game.id;
                seriesTitle = {
                    id: rows[0]!.id,
                    recipients: players
                        .filter(
                            ({ player }) =>
                                player.gameId === finalGameId && recipients.has(player.scrimParticipantId)
                        )
                        .map(({ player, userId }) => {
                            const identity = userId ? identities.get(userId) : undefined;
                            return {
                                key: player.scrimParticipantId,
                                userId: identity?.userId ?? null,
                                displayName: publicDisplayName(identity, player.displayName)
                            };
                        })
                };
            }
        }
        const match: MatchDetail = {
            id: row.match.id,
            scrim: { id: row.match.scrimId, title: row.scrimTitle },
            teamA: row.teamA,
            teamB: row.teamB,
            bestOf: row.match.bestOf,
            status: row.match.status,
            hardFearless: row.match.isHardFearless,
            seriesTitle,
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
            const { rows: setTitles } = await tx.execute<SetTitle & { scrim_participant_id: string }>(
                setTitleQuery(guildId, matchId, selected.game.id)
            );
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
                                const identity = userId ? identities.get(userId) : undefined;
                                return {
                                    key: player.scrimParticipantId,
                                    userId: identity?.userId ?? null,
                                    displayName: publicDisplayName(identity, player.displayName),
                                    riotId:
                                        identity?.showRiotIds && player.riotGameName && player.riotTagLine
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
                                    titles: setTitles
                                        .filter(
                                            (award) =>
                                                award.scrim_participant_id === player.scrimParticipantId
                                        )
                                        .map(({ id, value }) => ({ id, value })),
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
