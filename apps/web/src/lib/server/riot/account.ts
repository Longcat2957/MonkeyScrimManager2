import { requestRiot, type AccountRouting } from './client.ts';
import { RiotError } from './errors.ts';
import { pathSegment as encodeParameter } from './validation.ts';

export interface AccountDto {
	puuid: string;
	gameName?: string;
	tagLine?: string;
}

export interface AccountRegionDto {
	puuid: string;
	game: 'lol';
	region: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseAccount(value: unknown): AccountDto {
	if (
		!isRecord(value) ||
		typeof value.puuid !== 'string' ||
		!value.puuid ||
		(value.gameName !== undefined && typeof value.gameName !== 'string') ||
		(value.tagLine !== undefined && typeof value.tagLine !== 'string')
	) {
		throw new RiotError('INVALID_RESPONSE', 'Riot returned an invalid account response.');
	}

	return value as unknown as AccountDto;
}

/** ACCOUNT-V1: resolve Riot ID without also requesting LoL profile or match data. */
export async function getAccountByRiotId({
	gameName,
	tagLine,
	region
}: {
	gameName: string;
	tagLine: string;
	region?: AccountRouting;
}): Promise<AccountDto> {
	const name = encodeParameter(gameName, 'gameName');
	const tag = encodeParameter(tagLine, 'tagLine');
	const response = await requestRiot<unknown>(
		`/riot/account/v1/accounts/by-riot-id/${name}/${tag}`,
		{ region }
	);
	return parseAccount(response);
}

export async function getAccountByPuuid(
	puuid: string,
	region?: AccountRouting
): Promise<AccountDto> {
	const id = encodeParameter(puuid, 'puuid');
	const response = await requestRiot<unknown>(`/riot/account/v1/accounts/by-puuid/${id}`, {
		region
	});
	return parseAccount(response);
}

/** The returned active region is separate from the Account API routing cluster. */
export async function getActiveRegion(
	puuid: string,
	region?: AccountRouting
): Promise<AccountRegionDto> {
	const id = encodeParameter(puuid, 'puuid');
	const response = await requestRiot<unknown>(
		`/riot/account/v1/region/by-game/lol/by-puuid/${id}`,
		{ region }
	);

	if (
		!isRecord(response) ||
		typeof response.puuid !== 'string' ||
		!response.puuid ||
		response.game !== 'lol' ||
		typeof response.region !== 'string' ||
		!response.region
	) {
		throw new RiotError('INVALID_RESPONSE', 'Riot returned an invalid active region response.');
	}

	return response as unknown as AccountRegionDto;
}
