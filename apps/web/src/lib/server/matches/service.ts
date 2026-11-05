import { eq } from 'drizzle-orm';
import type { LolPosition } from '../../features/guild/types.ts';
import { requireUser } from '../auth/guards.ts';
import type { Actor } from '../auth/types.ts';
import type { Database, Transaction } from '../db/types.ts';
import { games, matchLineups, matchLineupPlayers } from '../db/schema.ts';
import type { DiscordClient } from '../discord/client.ts';
import { DomainError } from '../errors.ts';
import { requireGuildAdmin } from '../guild/access.ts';
import { MMR_POSITIONS } from '../mmr/rules.ts';
import { assertRevision, requireRevision, requireUuid } from '../scrims/validation.ts';
import { bumpMatchRevision, conflict, lockMatch, readLineup, readRoster } from './state.ts';

export type MatchDependencies = {
    discord?: DiscordClient;
    riot?: Pick<typeof import('../riot/account.ts'), 'getAccountByRiotId'>;
};
export type MatchSlotInput = { expectedRevision: number; nextGameNumber: number };
export type MatchLineupInput = {
    expectedRevision: number;
    players: { participantId: string; position: LolPosition }[];
};

function validateLineupInput(input: MatchLineupInput) {
    requireRevision(input.expectedRevision);
    if (!Array.isArray(input.players) || input.players.length > 10) {
        throw new DomainError('INVALID_INPUT', '출전 라인업을 확인해 주세요');
    }
    for (const player of input.players) {
        if (!player || !MMR_POSITIONS.includes(player.position))
            throw new DomainError('INVALID_INPUT', '출전 포지션을 확인해 주세요');
        requireUuid(player.participantId, '출전자');
    }
    if (new Set(input.players.map((player) => player.participantId)).size !== input.players.length) {
        throw new DomainError('INVALID_INPUT', '같은 출전자를 두 자리에 배치할 수 없어요');
    }
}

/** 양 팀의 실제 선발자를 포지션별로 검증한다. 희망 포지션을 대신 사용하지 않는다. */
export async function validateLineupRoster(
    tx: Transaction,
    match: Awaited<ReturnType<typeof lockMatch>>['match'],
    players: MatchLineupInput['players'],
    complete: boolean
) {
    const roster = await readRoster(tx, match);
    const assigned = players.map((player) => {
        const member = roster.find(({ participant }) => participant.id === player.participantId)?.participant;
        if (!member?.userId || !member.teamId) conflict('현재 선발된 해당 팀의 참가자만 출전할 수 있어요');
        return { ...player, member, teamId: member.teamId };
    });
    if (
        new Set(assigned.map((row) => row.member.userId)).size !== assigned.length ||
        new Set(assigned.map((row) => `${row.teamId}:${row.position}`)).size !== assigned.length
    ) {
        conflict('각 팀의 포지션마다 서로 다른 한 명을 배치해 주세요');
    }
    if (
        complete &&
        (assigned.length !== 10 ||
            [match.teamAId, match.teamBId].some((teamId) =>
                MMR_POSITIONS.some(
                    (position) =>
                        !assigned.some((player) => player.teamId === teamId && player.position === position)
                )
            ))
    ) {
        conflict('양 팀의 다섯 포지션과 출전자 열 명을 모두 확정해 주세요');
    }
    return assigned;
}

async function requireLineupEditable(
    tx: Transaction,
    context: Awaited<ReturnType<typeof lockMatch>>,
    revision: number
) {
    assertRevision(context.match.revision, revision);
    if (context.scrim.status !== 'in_progress' || context.match.status !== 'in_progress')
        conflict('진행 중인 경기에서만 출전 라인업을 변경할 수 있어요');
    const [game] = await tx
        .select({ id: games.id })
        .from(games)
        .where(eq(games.matchId, context.match.id))
        .limit(1);
    if (game) conflict('결과 기록이 있는 경기의 출전 라인업은 변경할 수 없어요');
}

async function writeLineup(
    db: Database,
    actor: Actor | null,
    guildId: string,
    matchId: string,
    input: MatchLineupInput,
    confirmed: boolean,
    dependencies: MatchDependencies
) {
    const user = requireUser(actor);
    validateLineupInput(input);
    await requireGuildAdmin(user, guildId, { db, discord: dependencies.discord });
    await db.transaction(async (tx) => {
        const context = await lockMatch(tx, user, guildId, matchId, true);
        await requireLineupEditable(tx, context, input.expectedRevision);
        const existing = await readLineup(tx, matchId);
        if (existing?.confirmedAt) conflict('확정한 라인업을 먼저 해제해 주세요');
        const players = await validateLineupRoster(tx, context.match, input.players, confirmed);
        const values = {
            confirmedAt: confirmed ? new Date() : null,
            confirmedByUserId: confirmed ? user.userId : null
        };
        const [lineup] = existing
            ? await tx.update(matchLineups).set(values).where(eq(matchLineups.id, existing.id)).returning()
            : await tx
                  .insert(matchLineups)
                  .values({ ...values, scrimId: context.scrim.id, matchId })
                  .returning();
        await tx.delete(matchLineupPlayers).where(eq(matchLineupPlayers.lineupId, lineup!.id));
        if (players.length)
            await tx.insert(matchLineupPlayers).values(
                players.map((player) => ({
                    scrimId: context.scrim.id,
                    lineupId: lineup!.id,
                    participantId: player.participantId,
                    teamId: player.teamId,
                    position: player.position
                }))
            );
        await bumpMatchRevision(tx, matchId, context.scrim.id);
    });
}

export async function saveMatchLineup(
    db: Database,
    actor: Actor | null,
    guildId: string,
    matchId: string,
    input: MatchLineupInput,
    dependencies: MatchDependencies = {}
): Promise<void> {
    await writeLineup(db, actor, guildId, matchId, input, false, dependencies);
}

export async function confirmMatchLineup(
    db: Database,
    actor: Actor | null,
    guildId: string,
    matchId: string,
    input: MatchLineupInput,
    dependencies: MatchDependencies = {}
): Promise<void> {
    await writeLineup(db, actor, guildId, matchId, input, true, dependencies);
}

export async function releaseMatchLineup(
    db: Database,
    actor: Actor | null,
    guildId: string,
    matchId: string,
    input: { expectedRevision: number; lineupId?: string },
    dependencies: MatchDependencies = {}
): Promise<void> {
    const user = requireUser(actor);
    requireRevision(input.expectedRevision);
    if (input.lineupId !== undefined) requireUuid(input.lineupId, '라인업');
    await requireGuildAdmin(user, guildId, { db, discord: dependencies.discord });
    await db.transaction(async (tx) => {
        const context = await lockMatch(tx, user, guildId, matchId, true);
        await requireLineupEditable(tx, context, input.expectedRevision);
        const lineup = await readLineup(tx, matchId);
        if (!lineup?.confirmedAt || (input.lineupId !== undefined && input.lineupId !== lineup.id))
            conflict('현재 확정된 라인업을 다시 확인해 주세요');
        await tx
            .update(matchLineups)
            .set({ confirmedAt: null, confirmedByUserId: null })
            .where(eq(matchLineups.id, lineup.id));
        await bumpMatchRevision(tx, matchId, context.scrim.id);
    });
}

export { importMatchRofl, revertLastMatchGame } from './results.ts';
