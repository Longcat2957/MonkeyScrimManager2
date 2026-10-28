import { dataDragon, METADATA_TTL_SECONDS } from '#lib/server/ddragon/client.ts';
import { dataDragonResponse } from '#lib/server/ddragon/http.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => dataDragonResponse(() => dataDragon.getVersions(), METADATA_TTL_SECONDS);
