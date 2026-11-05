import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { DomainError } from '../errors.ts';

export const OAUTH_LIFETIME_SECONDS = 10 * 60;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export type OAuthConfig = { clientId: string; clientSecret: string; redirectUri: string };
export type DiscordProfile = {
    id: string;
    username: string;
    globalName: string | null;
    avatarHash: string | null;
};
type OAuthTransaction = { state: string; verifier: string; returnTo: string; expiresAt: number };

export function readOAuthConfig(
    values: Record<string, string | undefined>,
    development = false
): OAuthConfig {
    const clientId = values.DISCORD_CLIENT_ID?.trim() ?? '';
    const clientSecret = values.DISCORD_CLIENT_SECRET?.trim() ?? '';
    const redirectUri = values.DISCORD_REDIRECT_URI?.trim() ?? '';
    let callback: URL;
    try {
        callback = new URL(redirectUri);
    } catch {
        throw unavailableConfiguration();
    }
    const localHttp =
        development &&
        callback.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(callback.hostname);
    if (
        !/^\d{17,20}$/.test(clientId) ||
        !clientSecret ||
        (callback.protocol !== 'https:' && !localHttp) ||
        callback.username ||
        callback.password ||
        callback.pathname !== '/auth/discord/callback' ||
        callback.search ||
        callback.hash
    ) {
        throw unavailableConfiguration();
    }
    return { clientId, clientSecret, redirectUri: callback.href };
}

function unavailableConfiguration() {
    return new DomainError('SERVICE_UNAVAILABLE', 'Discord 로그인 설정이 준비되지 않았어요');
}

export function safeReturnTo(value: string | null | undefined): string {
    if (
        !value ||
        value.length > 1024 ||
        !value.startsWith('/') ||
        value.startsWith('//') ||
        /[\\\u0000-\u001f\u007f]/.test(value) ||
        /%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(value)
    )
        return '/';
    try {
        const target = new URL(value, 'https://return.invalid');
        if (
            target.origin !== 'https://return.invalid' ||
            target.pathname === '/auth' ||
            target.pathname.startsWith('/auth/')
        )
            return '/';
        return target.pathname + target.search + target.hash;
    } catch {
        return '/';
    }
}

function signTransaction(encoded: string, secret: string) {
    return createHmac('sha256', secret).update(encoded).digest('base64url');
}

function equalToken(left: string, right: string) {
    return (
        tokenPattern.test(left) &&
        tokenPattern.test(right) &&
        timingSafeEqual(Buffer.from(left), Buffer.from(right))
    );
}

export function beginDiscordLogin(config: OAuthConfig, returnTo?: string | null, now = Date.now()) {
    const transaction: OAuthTransaction = {
        state: randomBytes(32).toString('base64url'),
        verifier: randomBytes(32).toString('base64url'),
        returnTo: safeReturnTo(returnTo),
        expiresAt: now + OAUTH_LIFETIME_SECONDS * 1000
    };
    const encoded = Buffer.from(JSON.stringify(transaction)).toString('base64url');
    const authorization = new URL('https://discord.com/oauth2/authorize');
    authorization.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        // 길드 권한 조회를 연결할 때 해당 기능이 필요한 scope를 추가한다.
        scope: 'identify',
        state: transaction.state,
        code_challenge: createHash('sha256').update(transaction.verifier).digest('base64url'),
        code_challenge_method: 'S256'
    }).toString();
    return {
        authorizationUrl: authorization.href,
        cookie: `${encoded}.${signTransaction(encoded, config.clientSecret)}`
    };
}

/** 서명·만료·state를 확인한다. 호출자는 성공 여부와 관계없이 이 쿠키를 즉시 지운다. */
export function readOAuthTransaction(
    cookie: string | undefined,
    state: string | null,
    secret: string,
    now = Date.now()
): OAuthTransaction {
    const invalid = () =>
        new DomainError('INVALID_INPUT', '로그인 요청이 만료되었거나 올바르지 않아요. 다시 로그인해 주세요');
    if (!cookie || cookie.length > 4096 || !state) throw invalid();
    const [encoded, signature, extra] = cookie.split('.');
    if (
        !encoded ||
        !signature ||
        extra !== undefined ||
        !equalToken(signature, signTransaction(encoded, secret))
    )
        throw invalid();
    let transaction: OAuthTransaction;
    try {
        transaction = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    } catch {
        throw invalid();
    }
    if (
        !transaction ||
        typeof transaction.state !== 'string' ||
        typeof transaction.verifier !== 'string' ||
        typeof transaction.returnTo !== 'string' ||
        !Number.isSafeInteger(transaction.expiresAt) ||
        transaction.expiresAt <= now ||
        transaction.expiresAt > now + OAUTH_LIFETIME_SECONDS * 1000 ||
        !equalToken(transaction.state, state) ||
        !tokenPattern.test(transaction.verifier)
    )
        throw invalid();
    return { ...transaction, returnTo: safeReturnTo(transaction.returnTo) };
}

export function validateOAuthCallback(url: URL, config: OAuthConfig) {
    const callback = new URL(config.redirectUri);
    if (
        url.origin !== callback.origin ||
        url.pathname !== callback.pathname ||
        (url.searchParams.has('iss') && url.searchParams.get('iss') !== 'https://discord.com')
    ) {
        throw new DomainError('INVALID_INPUT', '올바르지 않은 로그인 응답이에요');
    }
    if (url.searchParams.has('error'))
        throw new DomainError('INVALID_INPUT', 'Discord 로그인이 취소되었어요');
    const code = url.searchParams.get('code');
    if (
        !code ||
        code.length > 2048 ||
        url.searchParams.getAll('code').length !== 1 ||
        url.searchParams.getAll('state').length !== 1
    ) {
        throw new DomainError('INVALID_INPUT', '로그인 응답을 확인할 수 없어요');
    }
    return code;
}

function unavailableDiscord() {
    return new DomainError(
        'SERVICE_UNAVAILABLE',
        'Discord 로그인에 연결할 수 없어요. 잠시 후 다시 시도해 주세요'
    );
}

async function discordJson(
    url: string,
    init: RequestInit,
    request: typeof fetch
): Promise<Record<string, unknown>> {
    try {
        const response = await request(url, {
            ...init,
            redirect: 'error',
            cache: 'no-store',
            signal: AbortSignal.timeout(10_000)
        });
        if (!response.ok) throw unavailableDiscord();
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw unavailableDiscord();
        return data as Record<string, unknown>;
    } catch {
        // 외부 오류 본문이나 요청에 담긴 인증 정보를 오류·로그로 전달하지 않는다.
        throw unavailableDiscord();
    }
}

/** OAuth 토큰은 이 호출 안에서만 사용하고 사용자 프로필만 반환한다. */
export async function fetchDiscordProfile(
    config: OAuthConfig,
    code: string,
    verifier: string,
    request: typeof fetch = fetch
): Promise<DiscordProfile> {
    const token = await discordJson(
        'https://discord.com/api/oauth2/token',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: config.clientId,
                client_secret: config.clientSecret,
                grant_type: 'authorization_code',
                code,
                redirect_uri: config.redirectUri,
                code_verifier: verifier
            })
        },
        request
    );
    if (
        typeof token.access_token !== 'string' ||
        !token.access_token ||
        token.access_token.length > 4096 ||
        typeof token.token_type !== 'string' ||
        token.token_type.toLowerCase() !== 'bearer' ||
        typeof token.scope !== 'string' ||
        !token.scope.split(' ').includes('identify')
    )
        throw unavailableDiscord();
    const user = await discordJson(
        'https://discord.com/api/v10/users/@me',
        {
            headers: { Authorization: `Bearer ${token.access_token}` }
        },
        request
    );
    if (
        typeof user.id !== 'string' ||
        !/^\d{17,20}$/.test(user.id) ||
        typeof user.username !== 'string' ||
        !user.username.trim() ||
        user.username.length > 32 ||
        (user.global_name !== null &&
            user.global_name !== undefined &&
            (typeof user.global_name !== 'string' || user.global_name.length > 128)) ||
        (user.avatar !== null &&
            user.avatar !== undefined &&
            (typeof user.avatar !== 'string' || !/^(?:a_)?[a-f0-9]{32}$/.test(user.avatar)))
    )
        throw unavailableDiscord();
    return {
        id: user.id,
        username: user.username,
        globalName: (user.global_name as string | null | undefined) ?? null,
        avatarHash: (user.avatar as string | null | undefined) ?? null
    };
}
