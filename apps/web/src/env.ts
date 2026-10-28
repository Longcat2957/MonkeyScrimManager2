import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	RIOT_API_KEY: { schema: (value) => value ?? '' },
	RIOT_ACCOUNT_REGION: { schema: (value) => value ?? 'asia' },
	RIOT_PLATFORM: { schema: (value) => value ?? 'kr' },
	RIOT_API_TIMEOUT_MS: { schema: (value) => value ?? '10000' }
});
