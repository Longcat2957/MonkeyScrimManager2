import { noteUpstreamRequest } from '../operations/context.ts';
import { RiotError } from './errors.ts';
import { createRiotBudgets } from './rate-budget.ts';

export const ACCOUNT_ROUTINGS = ['asia', 'americas', 'europe'] as const;
export type AccountRouting = (typeof ACCOUNT_ROUTINGS)[number];
export const PLATFORM_ROUTINGS = [
    'br1',
    'eun1',
    'euw1',
    'jp1',
    'kr',
    'la1',
    'la2',
    'me1',
    'na1',
    'oc1',
    'ru',
    'sg2',
    'tr1',
    'tw2',
    'vn2'
] as const;
export type PlatformRouting = (typeof PLATFORM_ROUTINGS)[number];

const matchRegions = {
    br1: 'americas',
    eun1: 'europe',
    euw1: 'europe',
    jp1: 'asia',
    kr: 'asia',
    la1: 'americas',
    la2: 'americas',
    me1: 'europe',
    na1: 'americas',
    oc1: 'sea',
    ru: 'europe',
    sg2: 'sea',
    tr1: 'europe',
    tw2: 'sea',
    vn2: 'sea'
} satisfies Record<PlatformRouting, AccountRouting | 'sea'>;

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
    background?: boolean;
    query?: { queue: 420; count: 20 };
}

// 식별자가 아닌 실제 메서드 단위로 예산을 공유한다.
const methods = [
    ['account', 'account', /^\/riot\/account\/v1\/accounts\/by-riot-id\/[^/?#]+\/[^/?#]+$/],
    ['account', 'account', /^\/riot\/account\/v1\/accounts\/by-puuid\/[^/?#]+$/],
    ['account', 'account', /^\/riot\/account\/v1\/region\/by-game\/lol\/by-puuid\/[^/?#]+$/],
    ['platform', 'summoner', /^\/lol\/summoner\/v4\/summoners\/by-puuid\/[^/?#]+$/],
    ['platform', 'league', /^\/lol\/league\/v4\/entries\/by-puuid\/[^/?#]+$/],
    ['matchIds', 'match', /^\/lol\/match\/v5\/matches\/by-puuid\/[^/?#]+\/ids$/],
    ['matchDetail', 'match', /^\/lol\/match\/v5\/matches\/[A-Z0-9]{2,4}_\d{1,20}$/]
] as const;

/** 단일 웹 프로세스의 사용자 요청과 수집 작업이 같은 인스턴스를 사용한다. */
export function createRiotRequest(
    getConfig: () => RiotConfig,
    fetcher: typeof fetch = globalThis.fetch,
    now: () => number = Date.now
) {
    const budgets = createRiotBudgets(now);
    let inFlight = 0;

    return async function requestRiot<T>(path: string, options: RiotRequestOptions = {}): Promise<T> {
        const config = getConfig();
        const method = methods.findIndex(([, , pattern]) => pattern.test(path));
        if (method < 0) throw new RiotError('INVALID_ARGUMENT', 'Unsupported Riot API path.');
        const [kind, service] = methods[method]!;
        const match = service === 'match';
        if (
            (kind === 'account' && options.platform !== undefined) ||
            (kind !== 'account' && options.region !== undefined) ||
            (match && options.platform === undefined) ||
            (kind === 'matchIds'
                ? options.query?.queue !== 420 || options.query.count !== 20
                : options.query !== undefined)
        ) {
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
            const platform = parsePlatformRouting(options.platform ?? defaultPlatform);
            region = match ? matchRegions[platform] : platform;
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
        try {
            url = new URL(path, origin);
        } catch {
            throw new RiotError('INVALID_ARGUMENT', 'Invalid Riot API path.');
        }
        if (url.pathname !== path || url.origin !== origin || url.hash || url.search) {
            throw new RiotError('INVALID_ARGUMENT', 'Invalid Riot API path.');
        }
        if (options.query) {
            url.searchParams.set('queue', String(options.query.queue));
            url.searchParams.set('count', String(options.query.count));
        }
        if (inFlight >= 8) {
            throw new RiotError('BUSY', 'Too many Riot API requests are in progress.', {
                retryAfterSeconds: 1
            });
        }

        const reservation = budgets.reserve(region, service, method, options.background === true);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        inFlight += 1;
        const upstreamStarted = performance.now();
        let upstreamOk = false;
        try {
            const response = await fetcher(url, {
                method: 'GET',
                headers: { 'X-Riot-Token': apiKey, Accept: 'application/json' },
                redirect: 'error',
                signal: controller.signal
            });
            const retryAfterSeconds = reservation.observe(response);
            if (response.status !== 200) {
                await response.body?.cancel().catch(() => {});
                const details = { upstreamStatus: response.status };
                if (response.status === 429) {
                    throw new RiotError('RATE_LIMITED', 'Riot API rate limit exceeded.', {
                        ...details,
                        retryAfterSeconds
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
                const value = (await response.json()) as T;
                upstreamOk = true;
                return value;
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
            reservation.finish();
            inFlight -= 1;
            noteUpstreamRequest('riot', performance.now() - upstreamStarted, upstreamOk);
        }
    };
}
