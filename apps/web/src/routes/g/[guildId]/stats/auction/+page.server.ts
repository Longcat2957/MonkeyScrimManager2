import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import { priceSummary, type LedgerAuction, type LedgerPerson } from '#lib/features/stats/auction-ledger.ts';
import { getMockAuctionLedger } from '#lib/mocks/auction-ledger.ts';
import { findMockGuild } from '#lib/mocks/session.ts';
import { getDb } from '#lib/server/db/index.ts';
import { routeError } from '#lib/server/http.ts';
import { mockRecordSeasons, selectRecordSeason } from '#lib/server/records/seasons.ts';
import { readGuild } from '#lib/server/scrims/queries.ts';
import { getAuctionLedger } from '#lib/server/stats/auction-ledger.ts';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 10;

type SaleOrder = { acquiredAt: string | null; auctionIndex: number; order: number };

function newest(a: SaleOrder, b: SaleOrder) {
    return (
        (b.acquiredAt ?? '').localeCompare(a.acquiredAt ?? '') ||
        a.auctionIndex - b.auctionIndex ||
        b.order - a.order
    );
}

function pageOf<T>(rows: T[], requested: string | null, selectedIndex = -1) {
    const page =
        selectedIndex >= 0
            ? Math.floor(selectedIndex / PAGE_SIZE) + 1
            : Math.min(
                  Math.max(1, Math.ceil(rows.length / PAGE_SIZE)),
                  Math.max(1, Math.floor(Number(requested)) || 1)
              );
    return { page, total: rows.length, rows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) };
}

function ledgerPage(auctions: LedgerAuction[], params: URLSearchParams) {
    const q = params.get('q')?.trim() ?? '';
    const needle = q.toLocaleLowerCase('ko');
    const playerId = params.get('player');
    const auctionId = params.get('auction');
    const selectedAuction = auctions.find((auction) => auction.id === auctionId) ?? null;
    const players = new Map<
        string,
        { person: LedgerPerson; prices: number[]; latest: SaleOrder & { price: number } }
    >();
    const history: (SaleOrder & {
        id: string;
        auctionId: string;
        title: string;
        teamCount: number;
        team: string;
        buyer: string | null;
        price: number | null;
        budget: number;
    })[] = [];

    const archive = auctions.map((auction, auctionIndex) => {
        let paid = 0;
        for (const team of auction.teams) {
            for (const signing of team.signings) {
                const { player, price, order, acquiredAt } = signing;
                if (player.id !== null && player.id === playerId) {
                    history.push({
                        id: signing.id,
                        auctionId: auction.id,
                        title: auction.title,
                        teamCount: auction.teams.length,
                        team: team.name,
                        buyer: signing.buyer?.name ?? null,
                        price,
                        budget: team.budget,
                        acquiredAt,
                        order,
                        auctionIndex
                    });
                }
                if (price === null || price <= 0) continue;
                paid++;
                // 삭제된 참가자는 거래별로만 표시하고 이름만으로 거래 이력을 합치지 않는다.
                if (!player.id) continue;
                const latest = { price, acquiredAt, order, auctionIndex };
                const group = players.get(player.id);
                if (!group) players.set(player.id, { person: player, prices: [price], latest });
                else {
                    group.prices.push(price);
                    if (newest(latest, group.latest) < 0) {
                        group.latest = latest;
                        group.person = player;
                    }
                }
            }
        }
        return { id: auction.id, title: auction.title, teams: auction.teams.length, paid };
    });
    const matches = [...players.entries()]
        .filter(([, { person }]) => person.name.toLocaleLowerCase('ko').includes(needle))
        .sort(
            ([idA, a], [idB, b]) => a.person.name.localeCompare(b.person.name, 'ko') || idA.localeCompare(idB)
        );
    const selectedIndex = matches.findIndex(([id]) => id === playerId);
    const playerPage = pageOf(matches, params.get('page'), selectedIndex);
    const archivePage = pageOf(
        archive,
        params.get('archive'),
        archive.findIndex((a) => a.id === auctionId)
    );
    return {
        q,
        pageSize: PAGE_SIZE,
        playerPage: playerPage.page,
        playerCount: playerPage.total,
        players: playerPage.rows.map(([id, player]) => {
            const { count, median, min, max } = priceSummary(player.prices)!;
            return { ...player.person, id, latest: player.latest.price, count, median, min, max };
        }),
        selectedPlayerId: selectedIndex >= 0 ? playerId : null,
        history: selectedIndex >= 0 ? history.sort(newest) : [],
        archive: archivePage,
        selectedAuction,
        missingPlayer: Boolean(playerId && selectedIndex < 0),
        missingAuction: Boolean(auctionId && !selectedAuction)
    };
}

export const load: PageServerLoad = async ({
    parent,
    params: { guildId },
    url,
    locals,
    request,
    setHeaders
}) => {
    const { guild } = await parent();
    if (!guild) error(404, '서버를 찾을 수 없습니다.');
    if (request.method === 'GET') setHeaders({ 'Cache-Control': 'private, no-store' });
    const season = url.searchParams.get('season');
    try {
        if (dev && findMockGuild(guildId)) {
            return {
                ...mockRecordSeasons(season),
                ...ledgerPage(getMockAuctionLedger(guildId), url.searchParams)
            };
        }
        const { seasons, auctions } = await readGuild(getDb(), locals.actor, guildId, async (tx) => {
            const seasons = await selectRecordSeason(tx, guildId, season);
            return { seasons, auctions: await getAuctionLedger(tx, guildId, seasons.selectedSeasonId) };
        });
        return { ...seasons, ...ledgerPage(auctions, url.searchParams) };
    } catch (cause) {
        routeError(cause);
    }
};
