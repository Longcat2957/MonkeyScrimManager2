import { riotResponse } from '../riot/http.ts';

export async function dataDragonResponse(run: () => Promise<unknown>, maxAgeSeconds: number): Promise<Response> {
	const response = await riotResponse(run);
	if (response.ok) response.headers.set('Cache-Control', `public, max-age=${maxAgeSeconds}`);
	return response;
}
