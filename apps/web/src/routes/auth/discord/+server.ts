import { error, redirect } from '@sveltejs/kit';
import { getOAuthConfig } from '#lib/server/auth/config.ts';
import { OAUTH_COOKIE, authCookieOptions } from '#lib/server/auth/cookies.ts';
import { beginDiscordLogin, OAUTH_LIFETIME_SECONDS } from '#lib/server/auth/oauth.ts';
import { DomainError } from '#lib/server/errors.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url, cookies, setHeaders }) => {
    setHeaders({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    let login;
    try {
        const config = getOAuthConfig();
        if (url.origin !== new URL(config.redirectUri).origin) {
            throw new DomainError('SERVICE_UNAVAILABLE', '이 주소에서는 Discord 로그인을 시작할 수 없어요');
        }
        login = beginDiscordLogin(config, url.searchParams.get('returnTo'));
    } catch (cause) {
        if (cause instanceof DomainError) error(cause.status, cause.message);
        throw cause;
    }
    cookies.set(OAUTH_COOKIE, login.cookie, { ...authCookieOptions, maxAge: OAUTH_LIFETIME_SECONDS });
    redirect(303, login.authorizationUrl, { external: ['https://discord.com'] });
};
