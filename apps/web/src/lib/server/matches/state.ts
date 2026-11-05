import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Actor } from '../auth/types.ts';
import type { Database, Transaction } from '../db/types.ts';
import {
    games,
    matches,
    matchLineups,
    matchLineupPlayers,
    scrims,
    scrimParticipants,
    scrimParticipantRegistrations
} from '../db/schema.ts';
import { DomainError } from '../errors.ts';
import { assertGuildAccess } from '../guild/access.ts';
import { lockMmrSeason } from '../mmr/service.ts';
import { assertRevision, requireRevision, requireUuid } from '../scrims/validation.ts';
import { bumpRevision } from '../scrims/service.ts';

export function conflict(message: string): never {
    throw new DomainError('CONFLICT', message);
}

export function requireGameNumber(value: unknown): number {
    if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 5) {
        throw new DomainError('INVALID_INPUT', '다음 게임 번호를 확인해 주세요');
    }
    return value as number;
}

export async function findMatch(db: Database | Transaction, guildId: string, matchId: string) {
    requireUuid(matchId, '경기');
    const [row] = await db
        .select({ match: matches, scrim: scrims })
        .from(matches)
        .innerJoin(scrims, eq(scrims.id, matches.scrimId))
        .where(and(eq(matches.id, matchId), eq(scrims.guildId, guildId)))
        .limit(1);
    if (!row) throw new DomainError('NOT_FOUND', '이 서버의 경기를 찾을 수 없어요');
    return row;
}

/** 결과·역분개는 시즌 → 내전 → 경기 순서를 공유한다. 외부 API 호출은 이 함수 전에 끝낸다. */
export async function lockMatch(
    tx: Transaction,
    actor: Actor,
    guildId: string,
    matchId: string,
    manager: boolean,
    withSeason = false
) {
    const found = await findMatch(tx, guildId, matchId);
    if (withSeason) {
        if (!found.scrim.mmrSeasonId) conflict('내전에 고정된 MMR 시즌이 없어요');
        await lockMmrSeason(tx, guildId, found.scrim.mmrSeasonId);
    }
    const [scrim] = await tx
        .select()
        .from(scrims)
        .where(and(eq(scrims.id, found.scrim.id), eq(scrims.guildId, guildId)))
        .for('update');
    const [match] = await tx
        .select()
        .from(matches)
        .where(and(eq(matches.id, matchId), eq(matches.scrimId, found.scrim.id)))
        .for('update');
    if (!scrim || !match) throw new DomainError('NOT_FOUND', '이 서버의 경기를 찾을 수 없어요');
    if (withSeason && scrim.mmrSeasonId !== found.scrim.mmrSeasonId) conflict('내전의 MMR 시즌이 변경됐어요');
    const guild = await assertGuildAccess(tx, actor, guildId, manager);
    return { scrim, match, guild };
}

export async function completedGames(db: Database | Transaction, matchId: string) {
    return db
        .select()
        .from(games)
        .where(and(eq(games.matchId, matchId), eq(games.status, 'completed')))
        .orderBy(asc(games.gameNumber));
}

export async function nextGameNumber(db: Database | Transaction, matchId: string) {
    const completed = await completedGames(db, matchId);
    if (completed.some((game, index) => game.gameNumber !== index + 1))
        conflict('기록된 게임 순서를 확인해야 해요');
    return completed.length + 1;
}

export async function requireCurrentSlot(
    tx: Transaction,
    context: Awaited<ReturnType<typeof lockMatch>>,
    input: { expectedRevision: number; nextGameNumber: number }
) {
    assertRevision(context.match.revision, requireRevision(input.expectedRevision));
    requireGameNumber(input.nextGameNumber);
    if (context.scrim.status !== 'in_progress' || context.match.status !== 'in_progress')
        conflict('진행 중인 경기에서만 결과를 등록할 수 있어요');
    if (
        input.nextGameNumber !== (await nextGameNumber(tx, context.match.id)) ||
        input.nextGameNumber > context.match.bestOf
    )
        conflict('다음 게임 번호가 변경됐어요. 새로고침 후 다시 시도해 주세요');
}

export async function readLineup(db: Database | Transaction, matchId: string) {
    const [lineup] = await db.select().from(matchLineups).where(eq(matchLineups.matchId, matchId)).limit(1);
    if (!lineup) return null;
    const players = await db
        .select()
        .from(matchLineupPlayers)
        .where(eq(matchLineupPlayers.lineupId, lineup.id))
        .orderBy(asc(matchLineupPlayers.teamId), asc(matchLineupPlayers.position));
    return { ...lineup, players };
}

export async function readRoster(db: Database | Transaction, match: typeof matches.$inferSelect) {
    return db
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
        )
        .orderBy(asc(scrimParticipants.id));
}

export async function bumpMatchRevision(tx: Transaction, matchId: string, scrimId: string) {
    await tx
        .update(matches)
        .set({ revision: sql`${matches.revision} + 1` })
        .where(eq(matches.id, matchId));
    await bumpRevision(tx, scrimId);
}
