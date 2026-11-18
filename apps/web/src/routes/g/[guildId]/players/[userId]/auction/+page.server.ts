import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import { priceSummary, type LedgerAuction, type LedgerPerson } from '#lib/features/stats/auction-ledger.ts';
import { getMockAuctionLedger } from '#lib/mocks/auction-ledger.ts';
import { mockAvatarUrl } from '#lib/mocks/avatar.ts';
import { findMockPlayer } from '#lib/mocks/players.ts';
import { findMockGuild } from '#lib/mocks/session.ts';
import { publicDisplayName } from '#lib/server/accounts/public-identity.ts';
import { getDb } from '#lib/server/db/index.ts';
import { routeError } from '#lib/server/http.ts';
import { readRecordPlayer } from '#lib/server/records/queries.ts';
import { mockRecordSeasons, selectRecordSeason } from '#lib/server/records/seasons.ts';
import { getAuctionLedger } from '#lib/server/stats/auction-ledger.ts';
import type { PageServerLoad } from './$types';

type Receipt = {
    id: string;
    auctionId: string;
    title: string;
    teamName: string;
    buyer: string | null;
    price: number | null;
    budget: number;
    acquiredAt: string | null;
};

function playerLedger(auctions: LedgerAuction[], playerId: string) {
    const receipts: Receipt[] = [];
    const recruits = new Map<
        string,
        {
            player: LedgerPerson;
            receipts: { auctionId: string; title: string; id: string; price: number }[];
        }
    >();
    const teams = auctions.flatMap((auction) =>
        auction.teams.flatMap((team) => {
            for (const signing of team.signings) {
                if (signing.player.id === playerId) {
                    receipts.push({
                        id: signing.id,
                        auctionId: auction.id,
                        title: auction.title,
                        teamName: team.name,
                        buyer: signing.buyer?.name ?? null,
                        price: signing.price,
                        budget: team.budget,
                        acquiredAt: signing.acquiredAt
                    });
                }
            }
            if (
                team.captain?.id !== playerId &&
                !team.signings.some((s) => s.price !== null && s.buyer?.id === playerId)
            )
                return [];

            let spent = 0;
            let largest: { name: string; price: number } | null = null;
            for (const signing of team.signings) {
                if (signing.price !== null) {
                    spent += signing.price;
                    if (signing.price > (largest?.price ?? 0)) {
                        largest = { name: signing.player.name, price: signing.price };
                    }
                    if (signing.price > 0 && signing.player.id && signing.buyer?.id === playerId) {
                        let recruit = recruits.get(signing.player.id);
                        if (!recruit) {
                            recruit = { player: signing.player, receipts: [] };
                            recruits.set(signing.player.id, recruit);
                        }
                        if (recruit.receipts.at(-1)?.auctionId !== auction.id) {
                            recruit.receipts.push({
                                auctionId: auction.id,
                                title: auction.title,
                                id: signing.id,
                                price: signing.price
                            });
                        }
                    }
                }
            }
            return [
                {
                    id: team.id,
                    auctionId: auction.id,
                    title: auction.title,
                    teamName: team.name,
                    captain: team.captain,
                    budget: team.budget,
                    spent,
                    remaining: team.budget - spent,
                    largest,
                    roster: team.signings
                }
            ];
        })
    );
    receipts.sort((a, b) => (b.acquiredAt ?? '').localeCompare(a.acquiredAt ?? ''));
    return {
        receipts,
        prices: priceSummary(receipts.map(({ price }) => price)),
        teams,
        repeated: [...recruits.values()]
            .filter((r) => r.receipts.length > 1)
            .sort((a, b) => b.receipts.length - a.receipts.length)
    };
}

export const load: PageServerLoad = async ({ parent, params, url, locals }) => {
    const { guild } = await parent();
    if (!guild) error(404, '서버를 찾을 수 없습니다.');
    const { guildId, userId } = params;
    const season = url.searchParams.get('season');
    try {
        if (dev && findMockGuild(guildId)) {
            const selection = mockRecordSeasons(season);
            const mock = findMockPlayer(guildId, userId);
            if (!mock) error(404, '사용자를 찾을 수 없습니다.');
            return {
                ...selection,
                player: { name: mock.displayName, iconUrl: mockAvatarUrl(mock.userId) },
                ...playerLedger(getMockAuctionLedger(guildId, mock.userId), mock.userId)
            };
        }
        return await readRecordPlayer(
            getDb(),
            locals.actor,
            guildId,
            userId,
            async (tx, internalId, identity) => {
                const selection = await selectRecordSeason(tx, guildId, season);
                const auctions = await getAuctionLedger(tx, guildId, selection.selectedSeasonId, internalId);
                return {
                    ...selection,
                    player: { name: publicDisplayName(identity), iconUrl: identity.avatarUrl },
                    ...playerLedger(auctions, identity.userId)
                };
            }
        );
    } catch (cause) {
        routeError(cause);
    }
};
