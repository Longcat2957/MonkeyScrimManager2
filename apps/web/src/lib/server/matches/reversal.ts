import { and, desc, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import type { Database, Transaction } from '../db/types.ts';
import {
    games,
    gameMmrApplications,
    matches,
    matchLineups,
    mmrLedgerEntries,
    scrimBracketNodes,
    scrimBracketSlots,
    scrims,
    userPositionMmr
} from '../db/schema.ts';

/** 완료 시 진출했던 다음 경기다. 아직 생성되지 않은 대진 자리는 변경하지 않는다. */
export async function downstreamMatches(db: Database | Transaction, matchId: string) {
    const [source] = await db
        .select()
        .from(scrimBracketNodes)
        .where(eq(scrimBracketNodes.matchId, matchId))
        .limit(1);
    if (!source) return [];
    return db
        .select({ node: scrimBracketNodes, match: matches })
        .from(scrimBracketSlots)
        .innerJoin(scrimBracketNodes, eq(scrimBracketNodes.id, scrimBracketSlots.nodeId))
        .innerJoin(matches, eq(matches.id, scrimBracketNodes.matchId))
        .where(eq(scrimBracketSlots.sourceNodeId, source.id));
}

/** 화면의 비활성 사유와 쓰기 직전 검증이 같은 후속 작업 기준을 사용한다. */
export async function resultReversalBlock(
    db: Database | Transaction,
    scrim: typeof scrims.$inferSelect,
    match: typeof matches.$inferSelect,
    game: typeof games.$inferSelect
): Promise<string | null> {
    if (
        !['in_progress', 'completed'].includes(scrim.status) ||
        !['in_progress', 'completed'].includes(match.status)
    )
        return '진행 중이거나 정상 종료된 경기의 마지막 결과만 취소할 수 있어요';
    const [latest] = await db
        .select()
        .from(games)
        .where(and(eq(games.matchId, match.id), eq(games.status, 'completed')))
        .orderBy(desc(games.gameNumber))
        .limit(1);
    if (latest?.id !== game.id) return '마지막 완료 게임부터 취소해 주세요';
    const downstream = await downstreamMatches(db, match.id);
    if (downstream.length) {
        const ids = downstream.map((row) => row.match.id);
        const [lineup] = await db
            .select({ id: matchLineups.id, confirmedAt: matchLineups.confirmedAt })
            .from(matchLineups)
            .where(inArray(matchLineups.matchId, ids))
            .limit(1);
        const [result] = await db
            .select({ id: games.id })
            .from(games)
            .where(inArray(games.matchId, ids))
            .limit(1);
        if (
            (lineup?.confirmedAt && scrim.formationMethod !== 'manual') ||
            result ||
            downstream.some(
                (row) => row.match.revision > 0 || !['pending', 'in_progress'].includes(row.match.status)
            )
        )
            return '진출한 다음 경기의 작업이 있어 결과를 취소할 수 없어요';
    }
    const [application] = await db
        .select()
        .from(gameMmrApplications)
        .where(and(eq(gameMmrApplications.gameId, game.id), isNull(gameMmrApplications.reversedAt)))
        .limit(1);
    if (!application) return '현재 결과의 MMR 반영을 확인해야 해요';
    const entries = await db
        .select({ entry: mmrLedgerEntries, rating: userPositionMmr })
        .from(mmrLedgerEntries)
        .innerJoin(userPositionMmr, eq(userPositionMmr.id, mmrLedgerEntries.ratingId))
        .where(
            and(eq(mmrLedgerEntries.applicationId, application.id), eq(mmrLedgerEntries.kind, 'game_result'))
        );
    if (entries.length !== 10) return '현재 결과의 MMR 반영을 확인해야 해요';
    for (const { entry, rating } of entries) {
        if (rating.mmr !== entry.afterMmr) return '후속 경기나 점수 변경이 있어 결과를 취소할 수 없어요';
        const [later] = await db
            .select({ id: mmrLedgerEntries.id })
            .from(mmrLedgerEntries)
            .leftJoin(gameMmrApplications, eq(gameMmrApplications.id, mmrLedgerEntries.applicationId))
            .where(
                and(
                    eq(mmrLedgerEntries.ratingId, rating.id),
                    gt(mmrLedgerEntries.revision, entry.revision),
                    or(
                        eq(mmrLedgerEntries.kind, 'adjustment'),
                        and(eq(mmrLedgerEntries.kind, 'game_result'), isNull(gameMmrApplications.reversedAt))
                    )
                )
            )
            .limit(1);
        if (later) return '후속 경기나 점수 변경이 있어 결과를 취소할 수 없어요';
    }
    return null;
}
