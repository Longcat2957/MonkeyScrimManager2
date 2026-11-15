import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
    DATABASE_URL: { schema: (value) => value ?? '' },
    DB_STATEMENT_TIMEOUT_MS: { schema: (value) => value ?? '15000' },
    DB_LOCK_TIMEOUT_MS: { schema: (value) => value ?? '5000' },
    DB_QUERY_TIMEOUT_MS: { schema: (value) => value ?? '30000' },
    ROFL_MAX_CONCURRENT: { schema: (value) => value ?? '2' },
    ROFL_USER_CONCURRENT: { schema: (value) => value ?? '' },
    ROFL_USER_REQUEST_LIMIT: { schema: (value) => value ?? '12' },
    ROFL_RATE_WINDOW_MS: { schema: (value) => value ?? '60000' },
    ROFL_BODY_TIMEOUT_MS: { schema: (value) => value ?? '30000' },
    ROFL_PARSE_TIMEOUT_MS: { schema: (value) => value ?? '5000' },
    DISCORD_CLIENT_ID: { schema: (value) => value ?? '' },
    DISCORD_CLIENT_SECRET: { schema: (value) => value ?? '' },
    DISCORD_REDIRECT_URI: { schema: (value) => value ?? '' },
    DISCORD_BOT_TOKEN: { schema: (value) => value ?? '' },
    BOT_INTERNAL_TOKEN: { schema: (value) => value ?? '' },
    RIOT_API_KEY: { schema: (value) => value ?? '' },
    RIOT_ACCOUNT_REGION: { schema: (value) => value ?? 'asia' },
    RIOT_PLATFORM: { schema: (value) => value ?? 'kr' },
    RIOT_API_TIMEOUT_MS: { schema: (value) => value ?? '10000' },
    // 봇의 상태 확인 주소. 예: http://127.0.0.1:3101/status
    BOT_STATUS_URL: { schema: (value) => value ?? '' }
});
