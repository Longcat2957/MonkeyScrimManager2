import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { Actor } from '../auth/types.ts';
import type { Database, Transaction } from '../db/types.ts';
import {
    auctionAcquisitions,
    auctionLots,
    auctionQueueEntries,
    auctionTeams,
    auctions,
    gameMmrApplications,
    games,
    matches,
    matchLineupPlayers,
    matchLineups,
    matchRoflImports,
    mmrLedgerEntries,
    scrimBracketNodes,
    scrimBracketSlots,
    scrimCancellations,
    scrimParticipants,
    scrimRounds,
    scrims
} from '../db/schema.ts';
import { enqueueScrimPublications } from '../discord/publications.ts';
import { DomainError } from '../errors.ts';
import { reverseGameMmr } from '../mmr/service.ts';
import { invalidateAuctionActions } from './auction-actions.ts';
import type { ScrimRow } from './operation.ts';

function conflict(message: string): never {
    throw new DomainError('CONFLICT', message);
}

export async function activeScrimCancellation(db: Database | Transaction, scrimId: string) {
    const [batch] = await db
        .select()
        .from(scrimCancellations)
        .where(and(eq(scrimCancellations.scrimId, scrimId), isNull(scrimCancellations.restoredAt)))
        .limit(1);
    return batch ?? null;
}

export async function fullCancellationRestoreBlock(
    db: Database | Transaction,
    row: ScrimRow,
    batch: typeof scrimCancellations.$inferSelect
): Promise<string | null> {
    if (row.status !== 'cancelled' || batch.scrimId !== row.id || batch.restoredAt)
        return '현재 내전의 전체 취소 근거를 확인해야 해요';
    if (batch.context.version !== 1 || batch.context.scrim.formationMethod !== row.formationMethod)
        return '취소 전 편성 방식의 근거를 확인해야 해요';
    if (row.formationMethod === 'auction') {
        const [auction] = await db.select().from(auctions).where(eq(auctions.scrimId, row.id));
        if (!auction || auction.id !== batch.context.auction?.row.id || auction.status !== 'cancelled')
            return '전체 취소 뒤 경매 상태가 달라져 편성 준비로 돌아갈 수 없어요';
    }
    const current = await db
        .select({ id: matches.id })
        .from(matches)
        .where(and(eq(matches.scrimId, row.id), isNull(matches.cancellationBatchId)))
        .limit(1);
    if (current.length) return '전체 취소 뒤 경기 상태가 달라져 편성 준비로 돌아갈 수 없어요';
    const [remaining] = await db
        .select({ id: games.id })
        .from(games)
        .innerJoin(matches, eq(matches.id, games.matchId))
        .leftJoin(
            gameMmrApplications,
            and(eq(gameMmrApplications.gameId, games.id), isNull(gameMmrApplications.reversedAt))
        )
        .where(
            and(
                eq(matches.cancellationBatchId, batch.id),
                sql`(${games.status} <> 'cancelled' or ${gameMmrApplications.id} is not null)`
            )
        )
        .limit(1);
    return remaining ? '취소한 경기의 결과·MMR 상태를 확인해야 해요' : null;
}

type ReversibleGame = {
    game: typeof games.$inferSelect;
    application: typeof gameMmrApplications.$inferSelect;
};

/** 진출 계보·같은 경기의 세트·같은 점수 원장의 의존 관계를 모두 역순으로 정렬한다. */
function reverseOrder(
    records: ReversibleGame[],
    entries: (typeof mmrLedgerEntries.$inferSelect)[],
    nodes: (typeof scrimBracketNodes.$inferSelect)[],
    slots: (typeof scrimBracketSlots.$inferSelect)[]
): ReversibleGame[] {
    const byGame = new Map(records.map((record) => [record.game.id, record]));
    const edges = new Map(records.map((record) => [record.game.id, new Set<string>()]));
    const incoming = new Map(records.map((record) => [record.game.id, 0]));
    const before = (later: string, earlier: string) => {
        if (later === earlier || edges.get(later)!.has(earlier)) return;
        edges.get(later)!.add(earlier);
        incoming.set(earlier, incoming.get(earlier)! + 1);
    };
    for (const slot of slots) {
        const source = nodes.find((node) => node.id === slot.sourceNodeId)?.matchId;
        const destination = nodes.find((node) => node.id === slot.nodeId)?.matchId;
        if (!source || !destination) continue;
        for (const child of records.filter((record) => record.game.matchId === destination))
            for (const parent of records.filter((record) => record.game.matchId === source))
                before(child.game.id, parent.game.id);
    }
    for (const matchId of new Set(records.map((record) => record.game.matchId))) {
        const ordered = records
            .filter((record) => record.game.matchId === matchId)
            .sort((left, right) => right.game.gameNumber - left.game.gameNumber);
        for (let index = 1; index < ordered.length; index++)
            before(ordered[index - 1]!.game.id, ordered[index]!.game.id);
    }
    const applicationGames = new Map(records.map((record) => [record.application.id, record.game.id]));
    for (const ratingId of new Set(entries.map((entry) => entry.ratingId))) {
        const ordered = entries
            .filter((entry) => entry.ratingId === ratingId)
            .sort((left, right) => right.revision - left.revision);
        for (let index = 1; index < ordered.length; index++)
            before(
                applicationGames.get(ordered[index - 1]!.applicationId!)!,
                applicationGames.get(ordered[index]!.applicationId!)!
            );
    }
    const result: ReversibleGame[] = [];
    while (result.length < records.length) {
        const next = [...incoming]
            .filter(([, count]) => count === 0)
            .map(([id]) => byGame.get(id)!)
            .sort(
                (left, right) =>
                    right.application.appliedAt.getTime() - left.application.appliedAt.getTime() ||
                    right.game.id.localeCompare(left.game.id)
            )[0];
        if (!next) conflict('경기·MMR 반영 순서가 맞지 않아 전체 내전을 취소할 수 없어요');
        result.push(next);
        incoming.delete(next.game.id);
        for (const earlier of edges.get(next.game.id)!) incoming.set(earlier, incoming.get(earlier)! - 1);
    }
    return result;
}

/** 호출자는 고정 시즌을 먼저 잠근 뒤 내전 revision·권한을 확인한다. 이 함수는 독립 커밋하지 않는다. */
export async function cancelRunningScrimInTransaction(tx: Transaction, row: ScrimRow, actor: Actor) {
    if (row.status !== 'in_progress') conflict('진행 중인 내전만 결과까지 전체 취소할 수 있어요');
    if (await activeScrimCancellation(tx, row.id)) conflict('이미 처리한 내전 취소 결과를 확인해 주세요');
    const rounds = await tx.select().from(scrimRounds).where(eq(scrimRounds.scrimId, row.id));
    const nodes = await tx.select().from(scrimBracketNodes).where(eq(scrimBracketNodes.scrimId, row.id));
    const slots = await tx.select().from(scrimBracketSlots).where(eq(scrimBracketSlots.scrimId, row.id));
    const candidates = await tx
        .select()
        .from(matches)
        .where(and(eq(matches.scrimId, row.id), isNull(matches.cancellationBatchId)))
        .orderBy(desc(matches.createdAt), asc(matches.id));
    const roundNumber = (matchId: string) => {
        const node = nodes.find((item) => item.matchId === matchId);
        return rounds.find((round) => round.id === node?.roundId)?.roundNumber ?? 0;
    };
    candidates.sort((left, right) => roundNumber(right.id) - roundNumber(left.id));
    const currentMatches: typeof candidates = [];
    // 내전 잠금 아래에서 후속 대진부터 Match를 잠그고, 모든 Game 잠금을 마친 뒤 점수 원장을 되돌린다.
    for (const candidate of candidates) {
        const [locked] = await tx.select().from(matches).where(eq(matches.id, candidate.id)).for('update');
        if (!locked) conflict('취소할 경기 상태가 달라졌어요');
        currentMatches.push(locked);
    }
    const ids = currentMatches.map((match) => match.id);
    const allGames = ids.length
        ? await tx
              .select()
              .from(games)
              .where(inArray(games.matchId, ids))
              .orderBy(desc(games.gameNumber), asc(games.id))
              .for('update')
        : [];
    const completed = allGames.filter((game) => game.status === 'completed');
    if (completed.length && !row.mmrSeasonId) conflict('내전에 고정된 MMR 시즌을 확인해야 해요');
    if (currentMatches.some((match) => match.status === 'cancelled'))
        conflict('이전 취소 경기의 근거를 확인한 뒤 전체 내전을 취소해 주세요');
    const applications = allGames.length
        ? await tx
              .select()
              .from(gameMmrApplications)
              .where(
                  and(
                      inArray(
                          gameMmrApplications.gameId,
                          allGames.map((game) => game.id)
                      ),
                      isNull(gameMmrApplications.reversedAt)
                  )
              )
              .for('update')
        : [];
    if (applications.some((application) => !completed.some((game) => game.id === application.gameId)))
        conflict('미완료·이전 취소 결과의 MMR 근거를 확인해야 해요');
    const records = completed.map((game) => {
        const application = applications.find((candidate) => candidate.gameId === game.id);
        if (
            !application ||
            application.roflMetadataId !== game.roflMetadataId ||
            application.seasonId !== row.mmrSeasonId
        )
            conflict('현재 채택 결과의 MMR 반영을 확인해야 해요');
        return { game, application };
    });
    const entries = applications.length
        ? await tx
              .select()
              .from(mmrLedgerEntries)
              .where(
                  and(
                      inArray(
                          mmrLedgerEntries.applicationId,
                          applications.map((application) => application.id)
                      ),
                      eq(mmrLedgerEntries.kind, 'game_result')
                  )
              )
        : [];
    for (const record of records) {
        const ledger = entries.filter((entry) => entry.applicationId === record.application.id);
        if (ledger.length !== 10 || new Set(ledger.map((entry) => entry.ratingId)).size !== 10)
            conflict('결과별 MMR 원장을 확인해야 해요');
    }
    const receipts = completed.length
        ? await tx
              .select()
              .from(matchRoflImports)
              .where(
                  inArray(
                      matchRoflImports.gameId,
                      completed.map((game) => game.id)
                  )
              )
        : [];
    for (const game of completed)
        if (
            !receipts.some(
                (receipt) =>
                    receipt.gameId === game.id &&
                    receipt.matchId === game.matchId &&
                    receipt.roflMetadataId === game.roflMetadataId &&
                    receipt.cancelledAt === null
            )
        )
            conflict('채택 결과의 출전·등록 근거를 확인해야 해요');
    const lineups = ids.length
        ? await tx.select().from(matchLineups).where(inArray(matchLineups.matchId, ids))
        : [];
    const lineupPlayers = lineups.length
        ? await tx
              .select()
              .from(matchLineupPlayers)
              .where(
                  inArray(
                      matchLineupPlayers.lineupId,
                      lineups.map((lineup) => lineup.id)
                  )
              )
        : [];
    const [auction] = await tx.select().from(auctions).where(eq(auctions.scrimId, row.id)).for('update');
    if (row.formationMethod === 'auction' && !auction)
        conflict('취소할 경매의 팀장·포인트 근거를 확인해야 해요');
    const auctionTeamRows = auction
        ? await tx.select().from(auctionTeams).where(eq(auctionTeams.auctionId, auction.id))
        : [];
    const ordered = reverseOrder(records, entries, nodes, slots);
    const now = new Date();
    const reason = '내전 전체 취소';
    const [batch] = await tx
        .insert(scrimCancellations)
        .values({
            scrimId: row.id,
            actorUserId: actor.userId,
            reason,
            reversedGameCount: records.length,
            cancelledAt: now,
            context: {
                version: 1,
                scrim: row,
                matches: currentMatches,
                lineups,
                lineupPlayers,
                bracket: { rounds, nodes, slots },
                auction: auction ? { row: auction, teams: auctionTeamRows } : null
            }
        })
        .returning();
    for (const { game, application } of ordered) {
        await reverseGameMmr(tx, row.guildId, game.id, {
            applicationId: application.id,
            actorUserId: actor.userId,
            reason
        });
        await tx.update(games).set({ status: 'cancelled', winnerSide: null }).where(eq(games.id, game.id));
        await tx
            .update(matchRoflImports)
            .set({ cancelledAt: now })
            .where(eq(matchRoflImports.gameId, game.id));
    }
    // 미완료 운영 슬롯도 이 경기와 함께 닫되 원본 ROFL·출전·라인업 행은 삭제하지 않는다.
    if (ids.length) {
        await tx
            .update(games)
            .set({ status: 'cancelled', winnerSide: null })
            .where(and(inArray(games.matchId, ids), ne(games.status, 'cancelled')));
        await tx
            .update(matchLineups)
            .set({ confirmedAt: null, confirmedByUserId: null })
            .where(inArray(matchLineups.matchId, ids));
        await tx
            .update(matches)
            .set({
                status: 'cancelled',
                winnerTeamId: null,
                endedAt: now,
                endReason: reason,
                statusBeforeScrimEnd: null,
                endedAtBeforeScrimEnd: null,
                endReasonBeforeScrimEnd: null,
                cancellationBatchId: batch!.id,
                revision: sql`${matches.revision} + 1`
            })
            .where(inArray(matches.id, ids));
    }
    if (row.formationMethod === 'auction' && auction) {
        const voided = { voidedAt: now, voidedByUserId: actor.userId, voidReason: reason };
        await invalidateAuctionActions(tx, auction.id);
        await tx
            .update(auctionAcquisitions)
            .set(voided)
            .where(and(eq(auctionAcquisitions.auctionId, auction.id), isNull(auctionAcquisitions.voidedAt)));
        await tx
            .update(auctionLots)
            .set({ status: 'cancelled', closedAt: now })
            .where(and(eq(auctionLots.auctionId, auction.id), eq(auctionLots.status, 'open')));
        await tx
            .update(auctionLots)
            .set(voided)
            .where(and(eq(auctionLots.auctionId, auction.id), isNull(auctionLots.voidedAt)));
        await tx.delete(auctionQueueEntries).where(eq(auctionQueueEntries.auctionId, auction.id));
        await tx
            .update(scrimParticipants)
            .set({ teamId: null, position: null })
            .where(eq(scrimParticipants.scrimId, row.id));
        await tx.update(auctions).set({ status: 'cancelled' }).where(eq(auctions.id, auction.id));
    }
    // 이전 계획 구조는 배치에 보존하고, 다음 편성이 과거 Match를 다시 활성화하지 않도록 분리한다.
    await tx.update(scrimBracketNodes).set({ matchId: null }).where(eq(scrimBracketNodes.scrimId, row.id));
    await tx.delete(scrimBracketSlots).where(eq(scrimBracketSlots.scrimId, row.id));
    await tx.delete(scrimBracketNodes).where(eq(scrimBracketNodes.scrimId, row.id));
    await tx.delete(scrimRounds).where(eq(scrimRounds.scrimId, row.id));
    await tx
        .update(scrims)
        .set({
            status: 'cancelled',
            cancelledFromStatus: null,
            cancelledAuctionStatus: null,
            endedEarlyFromStatus: null,
            bracketConfirmedAt: null,
            bracketConfirmedByUserId: null,
            revision: row.revision + 1
        })
        .where(eq(scrims.id, row.id));
    await enqueueScrimPublications(tx, row.id);
}

export async function restoreFullCancellationInTransaction(
    tx: Transaction,
    row: ScrimRow,
    batch: typeof scrimCancellations.$inferSelect
) {
    const blocked = await fullCancellationRestoreBlock(tx, row, batch);
    if (blocked) conflict(blocked);
    if (row.formationMethod === 'auction')
        await tx
            .update(auctions)
            .set({ status: 'setup', startedAt: null, endedAt: null })
            .where(eq(auctions.scrimId, row.id));
    await tx
        .update(scrimCancellations)
        .set({ restoredAt: new Date() })
        .where(eq(scrimCancellations.id, batch.id));
    await tx
        .update(scrims)
        .set({
            status: 'preparing',
            cancelledFromStatus: null,
            cancelledAuctionStatus: null,
            revision: row.revision + 1
        })
        .where(eq(scrims.id, row.id));
    await enqueueScrimPublications(tx, row.id);
}
