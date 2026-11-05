import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
    DATABASE_URL: { schema: (value) => value ?? '' },
    DISCORD_CLIENT_ID: { schema: (value) => value ?? '' },
    DISCORD_CLIENT_SECRET: { schema: (value) => value ?? '' },
    DISCORD_REDIRECT_URI: { schema: (value) => value ?? '' },
    DISCORD_BOT_TOKEN: { schema: (value) => value ?? '' },
    RIOT_API_KEY: { schema: (value) => value ?? '' },
    RIOT_ACCOUNT_REGION: { schema: (value) => value ?? 'asia' },
    RIOT_PLATFORM: { schema: (value) => value ?? 'kr' },
    RIOT_API_TIMEOUT_MS: { schema: (value) => value ?? '10000' },
    // 봇의 상태 확인 주소. 예: http://127.0.0.1:3101/status
    BOT_STATUS_URL: { schema: (value) => value ?? '' }
});
