import { error, redirect } from '@sveltejs/kit';
import {
    LAST_GUILD_COOKIE,
    OAUTH_COOKIE,
    SESSION_COOKIE,
    authCookieOptions,
    lastGuildCookieOptions
} from '#lib/server/auth/cookies.ts';
import { deleteSession } from '#lib/server/auth/session.ts';
import { DomainError } from '#lib/server/errors.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, url, cookies, locals, setHeaders }) => {
    setHeaders({ 'Cache-Control': 'no-store' });
    // Content-Type에 관계없이 브라우저의 교차 출처 로그아웃을 거절한다.
    if (request.headers.get('origin') !== url.origin) error(403, '같은 사이트에서 로그아웃해 주세요');
    try {
        await deleteSession(cookies.get(SESSION_COOKIE));
    } catch (cause) {
        if (cause instanceof DomainError) error(cause.status, cause.message);
        throw cause;
    }
    cookies.delete(SESSION_COOKIE, authCookieOptions);
    cookies.delete(OAUTH_COOKIE, authCookieOptions);
    // 같은 브라우저의 다음 계정이 이전 사용자의 대표 서버로 들어가지 않게 한다.
    cookies.delete(LAST_GUILD_COOKIE, lastGuildCookieOptions);
    locals.actor = null;
    locals.user = null;
    locals.session = null;
    redirect(303, '/');
};
