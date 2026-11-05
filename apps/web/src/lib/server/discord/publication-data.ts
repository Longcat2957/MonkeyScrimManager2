import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { BotPublicationData } from '../../../../../../shared/bot-api.js';
import type { Transaction } from '../db/types.ts';
import {
    discordPublicationJobs,
    gameParticipants,
    games,
    matches,
    matchLineups,
    matchLineupPlayers,
    roflParticipantDataV1,
    scrimParticipantPreferences,
    scrimParticipantRegistrations,
    scrimParticipants,
    scrims,
    scrimTeams
} from '../db/schema.ts';
import { DomainError } from '../errors.ts';

type Job = typeof discordPublicationJobs.$inferSelect;

// 게시용 조회는 업무 데이터를 변경하지 않으며 실제 저장된 출전·결과 스냅샷만 조합한다.
export async function publicationData(tx: Transaction, scrimId: string): Promise<BotPublicationData> {
    const [row] = await tx.select().from(scrims).where(eq(scrims.id, scrimId));
    if (!row) throw new DomainError('NOT_FOUND', '내전을 찾을 수 없어요');
    const people = await tx
        .select({
            id: scrimParticipants.id,
            name: scrimParticipants.displayName,
            teamId: scrimParticipants.teamId,
            position: scrimParticipants.position,
            status: scrimParticipantRegistrations.status
        })
        .from(scrimParticipantRegistrations)
        .innerJoin(
            scrimParticipants,
            eq(scrimParticipants.id, scrimParticipantRegistrations.scrimParticipantId)
        )
        .where(and(eq(scrimParticipants.scrimId, scrimId), isNull(scrimParticipantRegistrations.withdrawnAt)))
        .orderBy(asc(scrimParticipantRegistrations.joinedAt), asc(scrimParticipantRegistrations.id));
    const ids = people.map((person) => person.id);
    const preferences = ids.length
        ? await tx
              .select()
              .from(scrimParticipantPreferences)
              .where(inArray(scrimParticipantPreferences.scrimParticipantId, ids))
              .orderBy(asc(scrimParticipantPreferences.priority))
        : [];
    const teams = await tx
        .select()
        .from(scrimTeams)
        .where(and(eq(scrimTeams.scrimId, scrimId), eq(scrimTeams.isActive, true)))
        .orderBy(asc(scrimTeams.ordinal));
    return {
        title: row.title,
        status: row.status,
        scheduledAt: row.expectedStartAt?.toISOString() ?? null,
        teamCount: row.teamCount,
        formationMethod: row.formationMethod,
        hardFearless: row.isHardFearless,
        selected: people.filter((person) => person.status === 'selected').length,
        standby: people.filter((person) => person.status === 'standby').length,
        capacity: row.teamCount * 5 + row.reserveCapacity,
        participants: people
            .filter((person) => person.status === 'selected' || person.status === 'standby')
            .map((person) => ({
                name: person.name,
                status: person.status as 'selected' | 'standby',
                positions: preferences
                    .filter((preference) => preference.scrimParticipantId === person.id)
                    .map((preference) => preference.position)
            })),
        teams: teams.map((team) => ({
            name: team.name,
            players: people
                .filter((person) => person.teamId === team.id && person.status === 'selected')
                .map((person) => ({ name: person.name, position: person.position }))
        }))
    };
}

export async function matchPublicationData(tx: Transaction, job: Job): Promise<BotPublicationData['match']> {
    const [context] =
        job.kind === 'lineup'
            ? await tx
                  .select()
                  .from(matchLineups)
                  .where(and(eq(matchLineups.id, job.subjectId), eq(matchLineups.scrimId, job.scrimId)))
            : await tx
                  .select()
                  .from(games)
                  .where(and(eq(games.id, job.subjectId), eq(games.scrimId, job.scrimId)));
    if (!context) return undefined;
    const [match] = await tx.select().from(matches).where(eq(matches.id, context.matchId));
    if (!match) return undefined;
    const teams = await tx.select().from(scrimTeams).where(eq(scrimTeams.scrimId, job.scrimId));
    const teamName = (id: string) => teams.find((team) => team.id === id)?.name ?? '팀';
    const completed = await tx
        .select()
        .from(games)
        .where(and(eq(games.matchId, match.id), eq(games.status, 'completed')));
    const scoreA = completed.filter(
        (game) => (game.winnerSide === 'blue') === (game.blueTeamSlot === 'a')
    ).length;
    const blueTeamSlot = 'blueTeamSlot' in context ? context.blueTeamSlot : null;
    const blueTeamId = blueTeamSlot === null ? null : blueTeamSlot === 'a' ? match.teamAId : match.teamBId;
    let players: NonNullable<BotPublicationData['match']>['players'];
    if (job.kind === 'lineup') {
        const rows = await tx
            .select({ player: matchLineupPlayers, name: scrimParticipants.displayName })
            .from(matchLineupPlayers)
            .innerJoin(scrimParticipants, eq(scrimParticipants.id, matchLineupPlayers.participantId))
            .where(eq(matchLineupPlayers.lineupId, context.id));
        players = rows.map(({ player, name }) => ({
            name,
            position: player.position,
            side: null,
            teamSlot: player.teamId === match.teamAId ? 'a' : 'b',
            champion: null,
            kills: null,
            deaths: null,
            assists: null
        }));
    } else {
        const rows = await tx
            .select({ player: gameParticipants, rofl: roflParticipantDataV1 })
            .from(gameParticipants)
            .leftJoin(
                roflParticipantDataV1,
                and(
                    eq(roflParticipantDataV1.roflMetadataId, gameParticipants.roflMetadataId),
                    eq(roflParticipantDataV1.participantIndex, gameParticipants.roflParticipantIndex)
                )
            )
            .where(eq(gameParticipants.gameId, context.id));
        players = rows.map(({ player, rofl }) => ({
            name: player.displayName,
            position: player.position,
            side: player.side,
            teamSlot: (player.side === 'blue') === (blueTeamSlot === 'a') ? 'a' : 'b',
            champion: rofl?.champion ?? null,
            kills: rofl?.stats.kills ?? null,
            deaths: rofl?.stats.deaths ?? null,
            assists: rofl?.stats.assists ?? null
        }));
    }
    return {
        id: match.id,
        label: match.label ?? '경기',
        gameNumber: job.kind === 'result' && 'gameNumber' in context ? context.gameNumber : null,
        bestOf: match.bestOf,
        teamAName: teamName(match.teamAId),
        teamBName: teamName(match.teamBId),
        blueTeamName: blueTeamId ? teamName(blueTeamId) : null,
        redTeamName: blueTeamSlot ? teamName(blueTeamSlot === 'a' ? match.teamBId : match.teamAId) : null,
        scoreA,
        scoreB: completed.length - scoreA,
        winnerSide: 'winnerSide' in context ? context.winnerSide : null,
        seriesWinnerName: match.winnerTeamId ? teamName(match.winnerTeamId) : null,
        players
    };
}
