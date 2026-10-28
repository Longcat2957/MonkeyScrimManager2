import { RIOT_API_KEY, RIOT_ACCOUNT_REGION, RIOT_PLATFORM, RIOT_API_TIMEOUT_MS } from '$app/env/private';
import { createRiotRequest } from './transport.ts';

export {
	parseAccountRouting, parsePlatformRouting,
	type AccountRouting, type PlatformRouting
} from './transport.ts';

export const requestRiot = createRiotRequest(() => ({
	apiKey: RIOT_API_KEY,
	accountRegion: RIOT_ACCOUNT_REGION,
	platform: RIOT_PLATFORM,
	timeoutMs: RIOT_API_TIMEOUT_MS
}));
