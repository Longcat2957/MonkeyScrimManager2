import { dataDragon, CATALOG_TTL_SECONDS } from '#lib/server/ddragon/client.ts';
import { dataDragonResponse } from '#lib/server/ddragon/http.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => dataDragonResponse(
	() => dataDragon.getCatalog(params.version, params.locale, params.resource), CATALOG_TTL_SECONDS
);
