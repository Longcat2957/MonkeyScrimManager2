import { requestRiot, type PlatformRouting } from '../client.ts';
import { invalidResponse, objectResponse, pathSegment } from '../validation.ts';

export interface SummonerDto extends Record<string, unknown> {
	puuid: string;
	profileIconId: number;
	revisionDate: number;
	summonerLevel: number;
}

export async function getSummonerByPuuid(
	puuid: string,
	platform?: PlatformRouting
): Promise<SummonerDto> {
	const response = objectResponse(await requestRiot<unknown>(
		`/lol/summoner/v4/summoners/by-puuid/${pathSegment(puuid, 'puuid')}`,
		{ platform }
	));
	if (
		typeof response.puuid !== 'string' || !response.puuid ||
		!Number.isSafeInteger(response.profileIconId) ||
		!Number.isSafeInteger(response.revisionDate) ||
		!Number.isSafeInteger(response.summonerLevel)
	) invalidResponse();
	return response as SummonerDto;
}
