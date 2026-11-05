import { and, asc, desc, eq, gt, inArray, isNull, lt, or } from 'drizzle-orm';
import type { LolPosition } from '../../features/guild/types.ts';
import type { Transaction } from '../db/types.ts';
import {
    gameMmrApplications,
    gameParticipants,
    games,
    matches,
    mmrLedgerEntries,
    mmrSeasons,
    scrimParticipants,
    scrims,
    userPositionMmr
} from '../db/schema.ts';
import { DomainError } from '../errors.ts';
import { requireUuid } from '../scrims/validation.ts';
import { calculateGameMmr, INITIAL_MMR, MMR_POSITIONS, type MmrPlayer } from './rules.ts';

type Rating = typeof userPositionMmr.$inferSelect;
type ResultEntry = typeof mmrLedgerEntries.$inferSelect;
type Player = { userId: string; participantId: string; position: LolPosition; side: 'blue' | 'red' };
export type MmrApplicationResult = { status: 'applied' | 'already_applied'; applicationId: string };
export type MmrReversalResult = { status: 'reversed' | 'already_reversed'; applicationId: string };

function conflict(message: string): never {
    throw new DomainError('CONFLICT', message);
}

/** 새 결과를 쓰는 최상위 서비스는 내전·경기 잠금보다 먼저 고정 시즌을 잠근다. */
export async function lockMmrSeason(tx: Transaction, guildId: string, seasonId: string) {
    requireUuid(seasonId, '시즌');
    const [season] = await tx
        .select()
        .from(mmrSeasons)
        .where(and(eq(mmrSeasons.guildId, guildId), eq(mmrSeasons.id, seasonId)))
        .for('update');
    if (!season) throw new DomainError('NOT_FOUND', '이 서버의 MMR 시즌을 찾을 수 없어요');
    return season;
}

/** 모든 경로가 시즌 → 내전 → 경기 → Game → 점수 순서로 잠근다. */
async function lockContext(tx: Transaction, guildId: string, gameId: string) {
    requireUuid(gameId, '게임');
    const [target] = await tx
        .select({ scrimId: scrims.id, seasonId: scrims.mmrSeasonId, matchId: games.matchId })
        .from(games)
        .innerJoin(scrims, eq(scrims.id, games.scrimId))
        .where(and(eq(games.id, gameId), eq(scrims.guildId, guildId)))
        .limit(1);
    if (!target) throw new DomainError('NOT_FOUND', '이 서버의 게임을 찾을 수 없어요');
    if (!target.seasonId) conflict('내전에 고정된 MMR 시즌이 없어요');
    const season = await lockMmrSeason(tx, guildId, target.seasonId);
    const [scrim] = await tx
        .select()
        .from(scrims)
        .where(and(eq(scrims.id, target.scrimId), eq(scrims.guildId, guildId)))
        .for('update');
    if (!scrim || scrim.mmrSeasonId !== season.id) conflict('내전의 MMR 시즌이 변경됐어요');
    const [match] = await tx
        .select()
        .from(matches)
        .where(and(eq(matches.id, target.matchId), eq(matches.scrimId, scrim.id)))
        .for('update');
    const [game] = await tx
        .select()
        .from(games)
        .where(and(eq(games.id, gameId), eq(games.scrimId, scrim.id), eq(games.matchId, target.matchId)))
        .for('update');
    if (!match || !game) throw new DomainError('NOT_FOUND', '이 내전의 경기를 찾을 수 없어요');
    return { season, scrim, match, game };
}

function requireCompleted(
    game: typeof games.$inferSelect
): asserts game is typeof games.$inferSelect & { roflMetadataId: string; winnerSide: 'blue' | 'red' } {
    if (game.status !== 'completed' || !game.roflMetadataId || !game.winnerSide)
        conflict('채택된 ROFL 결과가 있는 완료 게임만 MMR을 처리할 수 있어요');
}

async function readPlayers(
    tx: Transaction,
    context: Awaited<ReturnType<typeof lockContext>>
): Promise<Player[]> {
    const { game } = context;
    const rows = await tx
        .select({ played: gameParticipants, participant: scrimParticipants })
        .from(gameParticipants)
        .innerJoin(scrimParticipants, eq(scrimParticipants.id, gameParticipants.scrimParticipantId))
        .where(eq(gameParticipants.gameId, game.id))
        .orderBy(asc(scrimParticipants.userId), asc(gameParticipants.position))
        .for('update', { of: [gameParticipants, scrimParticipants] });
    if (rows.length !== 10) conflict('확정된 출전자 열 명이 필요해요');
    const players = rows.map(({ played, participant }): Player => {
        if (
            !participant.userId ||
            !played.position ||
            !MMR_POSITIONS.includes(played.position) ||
            played.scrimId !== game.scrimId ||
            participant.scrimId !== game.scrimId ||
            played.roflMetadataId !== game.roflMetadataId
        ) {
            conflict('채택된 결과의 출전자와 확정된 팀·포지션을 확인해 주세요');
        }
        return {
            userId: participant.userId,
            participantId: participant.id,
            position: played.position,
            side: played.side
        };
    });
    // 최상위 결과 서비스가 확정한 당시 출전을 사용한다. 현재 편성·희망 포지션·계정 소유자로 대체하지 않는다.
    calculateGameMmr(
        players.map((player) => ({ ...player, mmr: INITIAL_MMR })),
        game.winnerSide!
    );
    return players;
}

async function lockRatings(tx: Transaction, seasonId: string, players: readonly Player[]) {
    const ordered = [...players].sort(
        (a, b) => a.userId.localeCompare(b.userId) || a.position.localeCompare(b.position)
    );
    await tx
        .insert(userPositionMmr)
        .values(
            ordered.map((player) => ({
                seasonId,
                userId: player.userId,
                position: player.position,
                mmr: INITIAL_MMR
            }))
        )
        .onConflictDoNothing({
            target: [userPositionMmr.seasonId, userPositionMmr.userId, userPositionMmr.position]
        });
    return tx
        .select()
        .from(userPositionMmr)
        .where(
            and(
                eq(userPositionMmr.seasonId, seasonId),
                or(
                    ...ordered.map((player) =>
                        and(
                            eq(userPositionMmr.userId, player.userId),
                            eq(userPositionMmr.position, player.position)
                        )
                    )
                )
            )
        )
        .orderBy(asc(userPositionMmr.userId), asc(userPositionMmr.position))
        .for('update');
}

async function assertCurrentRating(tx: Transaction, rating: Rating) {
    const [latest] = await tx
        .select()
        .from(mmrLedgerEntries)
        .where(eq(mmrLedgerEntries.ratingId, rating.id))
        .orderBy(desc(mmrLedgerEntries.revision))
        .limit(1);
    if (
        rating.revision >= 2_147_483_647 ||
        (rating.revision === 0
            ? Boolean(latest) || rating.mmr !== INITIAL_MMR
            : !latest || latest.revision !== rating.revision || latest.afterMmr !== rating.mmr)
    ) {
        conflict('현재 MMR과 변경 이력이 일치하지 않아요');
    }
}

async function requirePreviousGamesApplied(tx: Transaction, game: typeof games.$inferSelect) {
    const earlier = await tx
        .select({ id: games.id, applicationId: gameMmrApplications.id })
        .from(games)
        .leftJoin(
            gameMmrApplications,
            and(
                eq(gameMmrApplications.gameId, games.id),
                eq(gameMmrApplications.roflMetadataId, games.roflMetadataId),
                isNull(gameMmrApplications.reversedAt)
            )
        )
        .where(
            and(
                eq(games.matchId, game.matchId),
                eq(games.status, 'completed'),
                lt(games.gameNumber, game.gameNumber)
            )
        );
    if (earlier.length !== game.gameNumber - 1 || earlier.some((row) => !row.applicationId))
        conflict('앞선 게임의 MMR을 먼저 처리해 주세요');
    const [later] = await tx
        .select({ id: games.id })
        .from(games)
        .innerJoin(
            gameMmrApplications,
            and(eq(gameMmrApplications.gameId, games.id), isNull(gameMmrApplications.reversedAt))
        )
        .where(and(eq(games.matchId, game.matchId), gt(games.gameNumber, game.gameNumber)))
        .limit(1);
    if (later) conflict('후속 게임의 MMR이 이미 반영되어 있어요');
}

/**
 * 인증·결과 귀속을 검증한 최상위 업무 트랜잭션에서 호출한다. 독립 커밋하지 않는다.
 * 새 Game을 저장할 때는 lockMmrSeason을 먼저 호출하고, 실패는 전파해 전체 결과 저장을 롤백한다.
 * 절대 경기 시각은 추정하지 않으며 현재 운영 슬롯과 서비스 반영 순서를 사용한다.
 */
export async function applyGameMmr(
    tx: Transaction,
    guildId: string,
    gameId: string,
    actorUserId: string | null
): Promise<MmrApplicationResult> {
    const context = await lockContext(tx, guildId, gameId);
    const { game, season, scrim } = context;
    requireCompleted(game);
    const applications = await tx
        .select()
        .from(gameMmrApplications)
        .where(eq(gameMmrApplications.gameId, game.id))
        .orderBy(desc(gameMmrApplications.revision))
        .for('update');
    const active = applications.find((application) => !application.reversedAt);
    if (active) {
        if (active.roflMetadataId !== game.roflMetadataId || active.seasonId !== season.id)
            conflict('기존 MMR 반영을 먼저 되돌려야 해요');
        const existing = await tx
            .select({ id: mmrLedgerEntries.id })
            .from(mmrLedgerEntries)
            .where(
                and(eq(mmrLedgerEntries.applicationId, active.id), eq(mmrLedgerEntries.kind, 'game_result'))
            );
        if (existing.length !== 10) conflict('기존 MMR 반영 이력을 확인해야 해요');
        return { status: 'already_applied', applicationId: active.id };
    }
    if (scrim.status === 'cancelled' || context.match.status === 'cancelled')
        conflict('취소된 내전이나 경기에는 MMR을 반영할 수 없어요');
    await requirePreviousGamesApplied(tx, game);
    const players = await readPlayers(tx, context);
    const ratings = await lockRatings(tx, season.id, players);
    if (ratings.length !== 10) conflict('출전자별 MMR을 확인할 수 없어요');
    for (const rating of ratings) await assertCurrentRating(tx, rating);
    const rated: MmrPlayer[] = players.map((player) => ({
        ...player,
        mmr: ratings.find((rating) => rating.userId === player.userId && rating.position === player.position)!
            .mmr
    }));
    const changes = calculateGameMmr(rated, game.winnerSide);
    const revision = (applications[0]?.revision ?? 0) + 1;
    if (revision > 2_147_483_647) conflict('MMR 반영 회차를 확인해야 해요');
    const [application] = await tx
        .insert(gameMmrApplications)
        .values({
            scrimId: scrim.id,
            gameId: game.id,
            seasonId: season.id,
            roflMetadataId: game.roflMetadataId,
            revision,
            appliedByUserId: actorUserId
        })
        .returning();
    for (const change of changes) {
        const rating = ratings.find(
            (entry) => entry.userId === change.userId && entry.position === change.position
        )!;
        const player = players.find((entry) => entry.userId === change.userId)!;
        await tx.insert(mmrLedgerEntries).values({
            seasonId: season.id,
            ratingId: rating.id,
            revision: rating.revision + 1,
            kind: 'game_result',
            applicationId: application!.id,
            scrimId: scrim.id,
            scrimParticipantId: player.participantId,
            beforeMmr: change.beforeMmr,
            afterMmr: change.afterMmr,
            recordedByUserId: actorUserId
        });
        await tx
            .update(userPositionMmr)
            .set({ mmr: change.afterMmr, revision: rating.revision + 1 })
            .where(eq(userPositionMmr.id, rating.id));
    }
    return { status: 'applied', applicationId: application!.id };
}

async function requireSafeReversal(
    tx: Transaction,
    entries: readonly ResultEntry[],
    ratings: readonly Rating[]
) {
    for (const entry of entries) {
        const rating = ratings.find((item) => item.id === entry.ratingId);
        if (!rating || rating.mmr !== entry.afterMmr)
            conflict('후속 변경이 있어 이 게임의 MMR을 되돌릴 수 없어요');
        await assertCurrentRating(tx, rating);
        const later = await tx
            .select({ entry: mmrLedgerEntries, reversedAt: gameMmrApplications.reversedAt })
            .from(mmrLedgerEntries)
            .leftJoin(gameMmrApplications, eq(gameMmrApplications.id, mmrLedgerEntries.applicationId))
            .where(
                and(eq(mmrLedgerEntries.ratingId, rating.id), gt(mmrLedgerEntries.revision, entry.revision))
            );
        if (
            later.some(
                (item) =>
                    item.entry.kind === 'adjustment' ||
                    (item.entry.kind === 'game_result' && !item.reversedAt)
            )
        ) {
            conflict('후속 경기나 점수 조정이 있어 이 게임의 MMR을 되돌릴 수 없어요');
        }
    }
}

/** 마지막 완료 Game의 안전한 역분개다. Game 취소·대진 복원은 호출자가 같은 트랜잭션에서 수행한다. */
export async function reverseGameMmr(
    tx: Transaction,
    guildId: string,
    gameId: string,
    input: { applicationId: string; actorUserId: string | null; reason: string }
): Promise<MmrReversalResult> {
    requireUuid(input.applicationId, 'MMR 반영');
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (!reason || reason.length > 500)
        throw new DomainError('INVALID_INPUT', 'MMR 변경 사유를 500자 이내로 입력해 주세요');
    const { game, season } = await lockContext(tx, guildId, gameId);
    const [application] = await tx
        .select()
        .from(gameMmrApplications)
        .where(and(eq(gameMmrApplications.id, input.applicationId), eq(gameMmrApplications.gameId, game.id)))
        .for('update');
    if (!application) throw new DomainError('NOT_FOUND', '이 게임의 MMR 반영을 찾을 수 없어요');
    if (application.reversedAt) return { status: 'already_reversed', applicationId: application.id };
    requireCompleted(game);
    if (application.seasonId !== season.id || application.roflMetadataId !== game.roflMetadataId)
        conflict('현재 채택 결과와 MMR 근거가 일치하지 않아요');
    const [laterGame] = await tx
        .select({ id: games.id })
        .from(games)
        .where(
            and(
                eq(games.matchId, game.matchId),
                eq(games.status, 'completed'),
                gt(games.gameNumber, game.gameNumber)
            )
        )
        .limit(1);
    if (laterGame) conflict('마지막 완료 게임부터 되돌려 주세요');
    const entries = await tx
        .select()
        .from(mmrLedgerEntries)
        .where(
            and(eq(mmrLedgerEntries.applicationId, application.id), eq(mmrLedgerEntries.kind, 'game_result'))
        )
        .orderBy(asc(mmrLedgerEntries.ratingId));
    if (entries.length !== 10 || new Set(entries.map((entry) => entry.ratingId)).size !== 10)
        conflict('MMR 반영 이력을 확인해야 해요');
    const ratings = await tx
        .select()
        .from(userPositionMmr)
        .where(
            and(
                eq(userPositionMmr.seasonId, season.id),
                inArray(
                    userPositionMmr.id,
                    entries.map((entry) => entry.ratingId)
                )
            )
        )
        .orderBy(asc(userPositionMmr.userId), asc(userPositionMmr.position))
        .for('update');
    await requireSafeReversal(tx, entries, ratings);
    for (const entry of entries) {
        const rating = ratings.find((item) => item.id === entry.ratingId)!;
        await tx.insert(mmrLedgerEntries).values({
            seasonId: season.id,
            ratingId: rating.id,
            revision: rating.revision + 1,
            kind: 'game_reversal',
            applicationId: application.id,
            scrimId: entry.scrimId,
            scrimParticipantId: entry.scrimParticipantId,
            beforeMmr: rating.mmr,
            afterMmr: entry.beforeMmr,
            reversesEntryId: entry.id,
            reason,
            recordedByUserId: input.actorUserId
        });
        await tx
            .update(userPositionMmr)
            .set({ mmr: entry.beforeMmr, revision: rating.revision + 1 })
            .where(eq(userPositionMmr.id, rating.id));
    }
    await tx
        .update(gameMmrApplications)
        .set({ reversedAt: new Date(), reversedByUserId: input.actorUserId, reversalReason: reason })
        .where(eq(gameMmrApplications.id, application.id));
    return { status: 'reversed', applicationId: application.id };
}
