import { getAccountByPuuid } from '#lib/server/riot/account.ts';
import { parseAccountRouting } from '#lib/server/riot/client.ts';
import { riotResponse } from '#lib/server/riot/http.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, url }) => riotResponse(() => {
	const region = url.searchParams.get('region');
	return getAccountByPuuid(params.puuid, region === null ? undefined : parseAccountRouting(region));
});
