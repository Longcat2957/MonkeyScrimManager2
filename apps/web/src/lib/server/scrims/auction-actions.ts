import { and, desc, eq, isNull } from 'drizzle-orm';
import { auctionActions, type auctions } from '../db/schema.ts';
import type { Transaction } from '../db/types.ts';

export type AuctionAction = typeof auctionActions.$inferSelect;
export type AuctionOperationKind = Exclude<AuctionAction['kind'], 'revert'>;

/** 부모 내전 잠금 안에서 최신 행위를 조회한다. 과거 lot만으로 행위를 추정하지 않는다. */
export async function latestAuctionAction(tx: Transaction, auctionId: string) {
    const [action] = await tx
        .select()
        .from(auctionActions)
        .where(eq(auctionActions.auctionId, auctionId))
        .orderBy(desc(auctionActions.sequenceNumber))
        .limit(1);
    return action ?? null;
}

export function canRevertAuctionAction(action: AuctionAction | null) {
    return Boolean(action && !action.invalidatedAt && action.kind !== 'revert');
}

export async function recordAuctionAction(
    tx: Transaction,
    auction: Pick<typeof auctions.$inferSelect, 'id' | 'scrimId'>,
    userId: string,
    input: {
        kind: AuctionAction['kind'];
        participantId: string;
        lotId: string;
        acquisitionId?: string;
        reversesId?: string;
    }
) {
    const previous = await latestAuctionAction(tx, auction.id);
    await tx.insert(auctionActions).values({
        scrimId: auction.scrimId,
        auctionId: auction.id,
        sequenceNumber: (previous?.sequenceNumber ?? 0) + 1,
        kind: input.kind,
        scrimParticipantId: input.participantId,
        lotId: input.lotId,
        acquisitionId: input.acquisitionId ?? null,
        reversesId: input.reversesId ?? null,
        recordedByUserId: userId
    });
}

/** 초기화·방식 변경·모집 복귀 이전의 행위는 보존하되 다시 적용하지 못하게 한다. */
export async function invalidateAuctionActions(tx: Transaction, auctionId: string) {
    await tx
        .update(auctionActions)
        .set({ invalidatedAt: new Date() })
        .where(and(eq(auctionActions.auctionId, auctionId), isNull(auctionActions.invalidatedAt)));
}
