import { requestRiot, type PlatformRouting } from '../client.ts';
import { arrayResponse, invalidResponse, objectResponse, pathSegment } from '../validation.ts';

export interface LeagueEntryDto extends Record<string, unknown> {
    puuid: string;
    leagueId?: string;
    queueType: string;
    tier: string;
    rank: string;
    leaguePoints: number;
    wins: number;
    losses: number;
}

export async function getLeagueEntriesByPuuid(
    puuid: string,
    platform?: PlatformRouting,
    background = false
): Promise<LeagueEntryDto[]> {
    const entries = arrayResponse(
        await requestRiot<unknown>(`/lol/league/v4/entries/by-puuid/${pathSegment(puuid, 'puuid')}`, {
            platform,
            background
        })
    );
    for (const value of entries) {
        const entry = objectResponse(value);
        if (
            entry.puuid !== puuid.trim() ||
            (entry.leagueId !== undefined && typeof entry.leagueId !== 'string') ||
            typeof entry.queueType !== 'string' ||
            typeof entry.tier !== 'string' ||
            typeof entry.rank !== 'string'
        )
            invalidResponse();
        for (const key of ['leaguePoints', 'wins', 'losses'] as const) {
            const number = entry[key];
            if (number === undefined) entry[key] = 0;
            else if (
                typeof number !== 'number' ||
                !Number.isSafeInteger(number) ||
                (key !== 'leaguePoints' && number < 0)
            )
                invalidResponse();
        }
    }
    return entries as LeagueEntryDto[];
}
