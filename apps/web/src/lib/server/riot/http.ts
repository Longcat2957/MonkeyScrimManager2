import { RiotError } from './errors.ts';

export async function riotResponse(run: () => Promise<unknown>): Promise<Response> {
	const headers = new Headers({ 'Cache-Control': 'no-store' });
	try {
		return Response.json(await run(), { headers });
	} catch (error) {
		if (!(error instanceof RiotError)) throw error;
		if (error.retryAfterSeconds !== undefined) {
			headers.set('Retry-After', String(error.retryAfterSeconds));
		}
		return Response.json({ error: { code: error.code, message: error.message } }, {
			status: error.status, headers
		});
	}
}
