import { and, asc, desc, eq, exists, isNull, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { LedgerAuction, LedgerPerson, LedgerTeam } from '../../features/stats/auction-ledger.ts';
import { publicDisplayName, readPublicIdentities } from '../accounts/public-identity.ts';
import {
    auctionAcquisitions,
    auctionActions,
    auctions,
    auctionTeams,
    scrimParticipants,
    scrims,
    scrimTeams
} from '../db/schema.ts';
import type { Transaction } from '../db/types.ts';

export async function getAuctionLedger(
    tx: Transaction,
    guildId: string,
    seasonId: string | null,
    userId?: string
): Promise<LedgerAuction[]> {
    if (!seasonId) return [];
    const captain = alias(scrimParticipants, 'ledger_captain');
    const buyer = alias(scrimParticipants, 'ledger_buyer');
    const sale = auctionAcquisitions;
    const activeTeam = and(eq(scrimTeams.id, auctionTeams.teamId), eq(scrimTeams.isActive, true));
    const validSigning = and(
        eq(sale.auctionId, auctionTeams.auctionId),
        eq(sale.teamId, auctionTeams.teamId),
        isNull(sale.voidedAt)
    );
    // 역할 필터는 경매 전체에 적용한다. 본인이 아닌 다른 팀의 영입도 복기에 남긴다.
    const personalAuction =
        userId === undefined
            ? undefined
            : exists(
                  tx
                      .select({ id: auctionTeams.teamId })
                      .from(auctionTeams)
                      .innerJoin(scrimTeams, activeTeam)
                      .leftJoin(sale, validSigning)
                      .innerJoin(
                          scrimParticipants,
                          or(
                              eq(scrimParticipants.id, auctionTeams.captainParticipantId),
                              eq(scrimParticipants.id, sale.scrimParticipantId),
                              eq(scrimParticipants.id, sale.buyerParticipantId)
                          )
                      )
                      .where(
                          and(eq(auctionTeams.auctionId, auctions.id), eq(scrimParticipants.userId, userId))
                      )
              );
    // 동시각 영입은 처리 행위의 순번을 따른다. 행위 원장 도입 전 기록은 UUID로 안정 정렬한다.
    const order =
        sql<number>`row_number() over (partition by ${auctions.id} order by ${sale.acquiredAt}, ${auctionActions.sequenceNumber}, ${sale.id})`
            .mapWith(Number)
            .as('signing_order');
    const rows = await tx
        .select({
            id: scrims.id,
            title: scrims.title,
            teamId: scrimTeams.id,
            teamName: scrimTeams.name,
            budget: auctionTeams.initialPoints,
            captainId: captain.id,
            captainUserId: captain.userId,
            signingId: sale.id,
            acquiredAt: sale.acquiredAt,
            price: sale.price,
            playerUserId: scrimParticipants.userId,
            buyerId: buyer.id,
            buyerUserId: buyer.userId,
            order
        })
        .from(scrims)
        .innerJoin(auctions, eq(auctions.scrimId, scrims.id))
        .innerJoin(auctionTeams, eq(auctionTeams.auctionId, auctions.id))
        .innerJoin(scrimTeams, activeTeam)
        .leftJoin(captain, eq(captain.id, auctionTeams.captainParticipantId))
        .leftJoin(sale, validSigning)
        .leftJoin(scrimParticipants, eq(scrimParticipants.id, sale.scrimParticipantId))
        .leftJoin(buyer, eq(buyer.id, sale.buyerParticipantId))
        .leftJoin(auctionActions, eq(auctionActions.acquisitionId, sale.id))
        .where(
            and(
                eq(scrims.guildId, guildId),
                eq(scrims.mmrSeasonId, seasonId),
                ne(scrims.status, 'cancelled'),
                eq(auctions.status, 'completed'),
                personalAuction
            )
        )
        .orderBy(
            desc(sql`coalesce(${auctions.endedAt}, ${auctions.startedAt}, ${auctions.createdAt})`),
            asc(scrims.id),
            asc(scrimTeams.ordinal),
            order
        );
    const identities = await readPublicIdentities(
        tx,
        rows.flatMap((row) => [row.captainUserId, row.playerUserId, row.buyerUserId]),
        guildId
    );
    function person(id: string | null): LedgerPerson {
        const identity = id ? identities.get(id) : undefined;
        return {
            id: identity?.userId ?? null,
            name: publicDisplayName(identity),
            avatarUrl: identity?.avatarUrl ?? null
        };
    }
    const ledger: LedgerAuction[] = [];
    let auction: LedgerAuction | undefined;
    let team: LedgerTeam | undefined;
    for (const row of rows) {
        if (auction?.id !== row.id) {
            auction = { id: row.id, title: row.title, teams: [] };
            ledger.push(auction);
        }
        if (team?.id !== row.teamId) {
            team = {
                id: row.teamId,
                name: row.teamName,
                captain: row.captainId ? person(row.captainUserId) : null,
                budget: row.budget,
                signings: []
            };
            auction.teams.push(team);
        }
        if (row.signingId)
            team.signings.push({
                id: row.signingId,
                player: person(row.playerUserId),
                buyer: row.buyerId ? person(row.buyerUserId) : null,
                price: row.price,
                acquiredAt: row.acquiredAt!.toISOString(),
                order: row.order
            });
    }
    return ledger;
}
