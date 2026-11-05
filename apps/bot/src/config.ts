export interface BotConfig {
    token: string;
    apiUrl: URL;
    internalToken: string;
    webOrigin: URL;
    applicationId: string | null;
    testGuildId: string | null;
    statusPort: number;
}

function secret(environment: NodeJS.ProcessEnv, key: string): string {
    const value = environment[key]?.trim();
    if (!value || /\s/.test(value)) throw new Error(`${key} 환경 변수를 설정해 주세요.`);
    return value;
}

function url(value: string, key: string): URL {
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error(`${key} 주소를 확인해 주세요.`);
    }
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
    if (
        (!local && parsed.protocol !== 'https:') ||
        !['http:', 'https:'].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash ||
        parsed.pathname !== '/'
    ) {
        throw new Error(`${key}에는 인증 정보·경로 없는 HTTPS origin 또는 로컬 HTTP 주소가 필요합니다.`);
    }
    return parsed;
}

function snowflake(value: string | undefined, key: string): string | null {
    const cleaned = value?.trim();
    if (!cleaned) return null;
    if (!/^\d{17,20}$/.test(cleaned)) throw new Error(`${key} 식별자를 확인해 주세요.`);
    return cleaned;
}

export function readConfig(environment: NodeJS.ProcessEnv = process.env): BotConfig {
    const internalToken = secret(environment, 'BOT_INTERNAL_TOKEN');
    if (internalToken.length < 32) throw new Error('BOT_INTERNAL_TOKEN은 32자 이상으로 설정해 주세요.');
    const statusPort = Number(environment.BOT_STATUS_PORT?.trim() || 0);
    if (!Number.isInteger(statusPort) || statusPort < 0 || statusPort > 65535) {
        throw new Error('BOT_STATUS_PORT는 1~65535 또는 빈 값이어야 합니다.');
    }
    return {
        token: secret(environment, 'DISCORD_TOKEN'),
        apiUrl: url(environment.BOT_API_URL?.trim() || 'http://127.0.0.1:3000', 'BOT_API_URL'),
        internalToken,
        webOrigin: url(environment.WEB_ORIGIN?.trim() || '', 'WEB_ORIGIN'),
        applicationId: snowflake(environment.DISCORD_APPLICATION_ID, 'DISCORD_APPLICATION_ID'),
        testGuildId: snowflake(environment.DISCORD_TEST_GUILD_ID, 'DISCORD_TEST_GUILD_ID'),
        statusPort
    };
}
