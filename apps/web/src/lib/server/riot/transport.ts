import { RiotError } from './errors.ts';

export const ACCOUNT_ROUTINGS = ['asia', 'americas', 'europe'] as const;
export type AccountRouting = (typeof ACCOUNT_ROUTINGS)[number];
export const PLATFORM_ROUTINGS = [
	'br1', 'eun1', 'euw1', 'jp1', 'kr', 'la1', 'la2', 'me1', 'na1', 'oc1',
	'ru', 'sg2', 'tr1', 'tw2', 'vn2'
] as const;
export type PlatformRouting = (typeof PLATFORM_ROUTINGS)[number];

export function parsePlatformRouting(value: string): PlatformRouting {
	if (!PLATFORM_ROUTINGS.includes(value as PlatformRouting)) {
		throw new RiotError('INVALID_ARGUMENT', 'Unsupported LoL platform.');
	}
	return value as PlatformRouting;
}

export function parseAccountRouting(value: string): AccountRouting {
	if (!ACCOUNT_ROUTINGS.includes(value as AccountRouting)) {
		throw new RiotError('INVALID_ARGUMENT', 'region must be asia, americas, or europe.');
	}
	return value as AccountRouting;
}

interface RiotConfig {
	apiKey?: string;
	accountRegion?: string;
	platform?: string;
	timeoutMs?: string;
}

export interface RiotRequestOptions {
	region?: AccountRouting;
	platform?: PlatformRouting;
}

const families = [
	['/riot/account/v1/', 'account'],
	['/lol/summoner/v4/', 'platform'],
	['/lol/league/v4/', 'platform']
] as const;

/** One instance per server process, shared by all authenticated Riot API callers. */
export function createRiotRequest(
	getConfig: () => RiotConfig,
	fetcher: typeof fetch = globalThis.fetch,
	now: () => number = Date.now
) {
	const blockedUntil = new Map<string, number>();
	let inFlight = 0;

	return async function requestRiot<T>(
		path: string,
		options: RiotRequestOptions = {}
	): Promise<T> {
		const config = getConfig();
		const family = families.find(([prefix]) => path.startsWith(prefix));
		if (!family) throw new RiotError('INVALID_ARGUMENT', 'Unsupported Riot API path.');
		const [prefix, kind] = family;
		if ((kind === 'account' && options.platform !== undefined) || (kind === 'platform' && options.region !== undefined)) {
			throw new RiotError('INVALID_ARGUMENT', 'Routing does not match this Riot API.');
		}
		let region: string;
		if (kind === 'account') {
			const defaultRegion = config.accountRegion?.trim() || 'asia';
			if (!ACCOUNT_ROUTINGS.includes(defaultRegion as AccountRouting)) {
				throw new RiotError('INVALID_CONFIGURATION', 'RIOT_ACCOUNT_REGION is invalid.');
			}
			region = parseAccountRouting(options.region ?? defaultRegion);
		} else {
			const defaultPlatform = config.platform?.trim() || 'kr';
			if (!PLATFORM_ROUTINGS.includes(defaultPlatform as PlatformRouting)) {
				throw new RiotError('INVALID_CONFIGURATION', 'RIOT_PLATFORM is invalid.');
			}
			region = parsePlatformRouting(options.platform ?? defaultPlatform);
		}
		const timeoutMs = Number(config.timeoutMs?.trim() || '10000');
		if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) {
			throw new RiotError('INVALID_CONFIGURATION', 'RIOT_API_TIMEOUT_MS must be 1–60000.');
		}
		const apiKey = config.apiKey?.trim();
		if (!apiKey) {
			throw new RiotError('NOT_CONFIGURED', 'Riot API key is not configured.');
		}
		if (!/^[\x21-\x7e]+$/.test(apiKey)) {
			throw new RiotError('INVALID_CONFIGURATION', 'Riot API key format is invalid.');
		}

		const origin = `https://${region}.api.riotgames.com`;
		let url: URL;
		try { url = new URL(path, origin); }
		catch { throw new RiotError('INVALID_ARGUMENT', 'Invalid Riot API path.'); }
		if (
			!url.pathname.startsWith(prefix) ||
			url.origin !== origin || url.hash || url.search
		) {
			throw new RiotError('INVALID_ARGUMENT', 'Invalid Riot API path.');
		}
		const remaining = (blockedUntil.get(region) ?? 0) - now();
		if (remaining > 0) {
			throw new RiotError('RATE_LIMITED', 'Riot API requests are temporarily paused.', {
				retryAfterSeconds: Math.ceil(remaining / 1000)
			});
		}
		if (inFlight >= 8) {
			throw new RiotError('BUSY', 'Too many Riot API requests are in progress.', {
				retryAfterSeconds: 1
			});
		}

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		inFlight += 1;
		try {
			const response = await fetcher(url, {
				method: 'GET',
				headers: { 'X-Riot-Token': apiKey, Accept: 'application/json' },
				redirect: 'error',
				signal: controller.signal
			});
			if (response.status !== 200) {
				await response.body?.cancel().catch(() => {});
				const details = { upstreamStatus: response.status };
				if (response.status === 429) {
					const header = response.headers.get('retry-after');
					const seconds = header?.trim() ? Number(header) : NaN;
					const retryAfterSeconds = Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : 60;
					// Conservatively pause the whole host, including method/service limits.
					blockedUntil.set(region, Math.max(blockedUntil.get(region) ?? 0, now() + retryAfterSeconds * 1000));
					throw new RiotError('RATE_LIMITED', 'Riot API rate limit exceeded.', {
						...details, retryAfterSeconds
					});
				}
				if (response.status === 404) {
					throw new RiotError('NOT_FOUND', 'Requested Riot data was not found.', details);
				}
				if (response.status === 401 || response.status === 403) {
					throw new RiotError('UPSTREAM_AUTH_ERROR', 'Riot API authentication failed.', details);
				}
				if (response.status === 400) {
					throw new RiotError('INVALID_ARGUMENT', 'Riot rejected the request parameters.', details);
				}
				throw new RiotError('UPSTREAM_ERROR', 'Riot API request failed.', details);
			}

			try {
				return await response.json() as T;
			} catch {
				if (controller.signal.aborted) throw new RiotError('TIMEOUT', 'Riot API request timed out.');
				throw new RiotError('INVALID_RESPONSE', 'Riot returned an invalid JSON response.');
			}
		} catch (error) {
			if (error instanceof RiotError) throw error;
			if (controller.signal.aborted) throw new RiotError('TIMEOUT', 'Riot API request timed out.');
			throw new RiotError('NETWORK_ERROR', 'Could not reach Riot API.');
		} finally {
			clearTimeout(timer);
			inFlight -= 1;
		}
	};
}
