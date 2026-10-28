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
	platform?: PlatformRouting
): Promise<LeagueEntryDto[]> {
	const entries = arrayResponse(await requestRiot<unknown>(
		`/lol/league/v4/entries/by-puuid/${pathSegment(puuid, 'puuid')}`,
		{ platform }
	));
	for (const value of entries) {
		const entry = objectResponse(value);
		if (
			typeof entry.puuid !== 'string' || !entry.puuid ||
			(entry.leagueId !== undefined && typeof entry.leagueId !== 'string') ||
			typeof entry.queueType !== 'string' || typeof entry.tier !== 'string' ||
			typeof entry.rank !== 'string' ||
			!Number.isSafeInteger(entry.leaguePoints) ||
			!Number.isSafeInteger(entry.wins) || !Number.isSafeInteger(entry.losses)
		) invalidResponse();
	}
	return entries as LeagueEntryDto[];
}
