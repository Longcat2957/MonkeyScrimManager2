import { listMockAuctionScrims } from './scrims.ts';
import { mockLedgerAuction } from './teams.ts';

export function getMockAuctionLedger(guildId: string, userId?: string) {
    return listMockAuctionScrims(guildId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .flatMap((scrim) => {
            const auction = mockLedgerAuction(scrim);
            if (!auction) return [];
            if (
                userId &&
                !auction.teams.some(
                    (team) =>
                        team.captain?.id === userId ||
                        team.signings.some(
                            (signing) => signing.player.id === userId || signing.buyer?.id === userId
                        )
                )
            )
                return [];
            return [auction];
        });
}
