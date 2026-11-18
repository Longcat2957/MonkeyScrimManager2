import { and, avg, count, eq, gt, inArray, isNull, ne } from 'drizzle-orm';
import { auctionAcquisitions, auctions, scrimParticipants, scrims, scrimTeams } from '../db/schema.ts';
import type { Transaction } from '../db/types.ts';

export async function readAuctionPriceHistory(
    tx: Transaction,
    guildId: string,
    userIds: string[],
    excludeScrimId?: string
) {
    if (!userIds.length) return [];
    const sale = auctionAcquisitions;
    return tx
        .select({
            userId: scrimParticipants.userId,
            auctionAveragePrice: avg(sale.price).mapWith(Number),
            auctionPurchaseCount: count()
        })
        .from(sale)
        .innerJoin(scrimParticipants, eq(scrimParticipants.id, sale.scrimParticipantId))
        .innerJoin(auctions, eq(auctions.id, sale.auctionId))
        .innerJoin(scrims, eq(scrims.id, sale.scrimId))
        .innerJoin(scrimTeams, eq(scrimTeams.id, sale.teamId))
        .where(
            and(
                inArray(scrimParticipants.userId, userIds),
                eq(scrims.guildId, guildId),
                excludeScrimId ? ne(scrims.id, excludeScrimId) : undefined,
                ne(scrims.status, 'cancelled'),
                eq(auctions.status, 'completed'),
                eq(scrimTeams.isActive, true),
                isNull(sale.voidedAt),
                eq(sale.method, 'auction'),
                gt(sale.price, 0)
            )
        )
        .groupBy(scrimParticipants.userId);
}
