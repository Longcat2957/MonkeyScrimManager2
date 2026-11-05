import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Transaction } from '../db/types.ts';
import {
    matchLineups,
    matchLineupPlayers,
    matches,
    scrimBracketNodes,
    scrimBracketSlots,
    scrimParticipants,
    scrimParticipantRegistrations
} from '../db/schema.ts';
import { DomainError } from '../errors.ts';
import { MMR_POSITIONS } from '../mmr/rules.ts';

/** 최초 수동 경기의 확정 편성과 이전 경기 승자의 확정 출전을 복사한다. */
export async function copyInitialMatchLineup(
    tx: Transaction,
    match: typeof matches.$inferSelect,
    nodeId: string,
    manual: boolean,
    actorId: string | null
) {
    const members = await tx
        .select({ participant: scrimParticipants })
        .from(scrimParticipants)
        .innerJoin(
            scrimParticipantRegistrations,
            eq(scrimParticipantRegistrations.scrimParticipantId, scrimParticipants.id)
        )
        .where(
            and(
                eq(scrimParticipants.scrimId, match.scrimId),
                inArray(scrimParticipants.teamId, [match.teamAId, match.teamBId]),
                eq(scrimParticipantRegistrations.status, 'selected'),
                isNull(scrimParticipantRegistrations.withdrawnAt)
            )
        );
    const slots = await tx.select().from(scrimBracketSlots).where(eq(scrimBracketSlots.nodeId, nodeId));
    const players: { participantId: string; teamId: string; position: (typeof MMR_POSITIONS)[number] }[] = [];
    for (const [slot, teamId] of [
        ['a', match.teamAId],
        ['b', match.teamBId]
    ] as const) {
        const sourceId = slots.find((row) => row.slot === slot)?.sourceNodeId;
        if (sourceId) {
            const previous = await tx
                .select({ player: matchLineupPlayers })
                .from(scrimBracketNodes)
                .innerJoin(matches, eq(matches.id, scrimBracketNodes.matchId))
                .innerJoin(matchLineups, eq(matchLineups.matchId, matches.id))
                .innerJoin(matchLineupPlayers, eq(matchLineupPlayers.lineupId, matchLineups.id))
                .where(
                    and(
                        eq(scrimBracketNodes.id, sourceId),
                        eq(matches.winnerTeamId, teamId),
                        eq(matchLineupPlayers.teamId, teamId)
                    )
                );
            if (previous.length !== 5)
                throw new DomainError('CONFLICT', '진출한 팀의 확정 출전 라인업을 확인해야 해요');
            players.push(
                ...previous.map(({ player }) => ({
                    participantId: player.participantId,
                    teamId,
                    position: player.position
                }))
            );
        } else if (manual) {
            for (const { participant } of members.filter((row) => row.participant.teamId === teamId)) {
                if (!participant.position)
                    throw new DomainError('CONFLICT', '확정된 수동 편성의 포지션을 확인해 주세요');
                players.push({ participantId: participant.id, teamId, position: participant.position });
            }
        }
    }
    if (!players.length) return;
    const selected = players.map(
        (player) => members.find(({ participant }) => participant.id === player.participantId)?.participant
    );
    if (
        selected.some((member) => !member?.userId) ||
        new Set(selected.map((member) => member!.userId)).size !== players.length ||
        new Set(players.map((player) => `${player.teamId}:${player.position}`)).size !== players.length
    ) {
        throw new DomainError('CONFLICT', '진출한 팀의 출전자와 현재 선발 상태를 확인해 주세요');
    }
    if (
        manual &&
        (players.length !== 10 ||
            [match.teamAId, match.teamBId].some((teamId) =>
                MMR_POSITIONS.some(
                    (position) =>
                        !players.some((player) => player.teamId === teamId && player.position === position)
                )
            ))
    ) {
        throw new DomainError('CONFLICT', '확정된 수동 편성의 양 팀 다섯 포지션을 확인해 주세요');
    }
    const [lineup] = await tx
        .insert(matchLineups)
        .values({
            scrimId: match.scrimId,
            matchId: match.id,
            confirmedAt: manual ? new Date() : null,
            confirmedByUserId: manual ? actorId : null
        })
        .returning();
    await tx
        .insert(matchLineupPlayers)
        .values(players.map((player) => ({ scrimId: match.scrimId, lineupId: lineup!.id, ...player })));
}
