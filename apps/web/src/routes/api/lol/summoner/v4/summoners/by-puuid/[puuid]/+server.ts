import { parsePlatformRouting } from '#lib/server/riot/client.ts';
import { riotResponse } from '#lib/server/riot/http.ts';
import { getSummonerByPuuid } from '#lib/server/riot/lol/summoner.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, url }) =>
	riotResponse(() => {
		const value = url.searchParams.get('platform');
		const platform = value === null ? undefined : parsePlatformRouting(value);
		return getSummonerByPuuid(params.puuid, platform);
	});
