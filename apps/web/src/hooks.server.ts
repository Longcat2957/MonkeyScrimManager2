import { randomUUID } from 'node:crypto';
import { error } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { SESSION_COOKIE, authCookieOptions } from '#lib/server/auth/cookies.ts';
import { validateSession } from '#lib/server/auth/session.ts';
import { DomainError } from '#lib/server/errors.ts';
import { refreshGuildViewAccess } from '#lib/server/guild/access.ts';

export const handle: Handle = async ({ event, resolve }) => {
    event.locals.requestId = randomUUID();
    event.locals.actor = null;
    event.locals.user = null;
    event.locals.session = null;
    const token = event.cookies.get(SESSION_COOKIE);
    if (token) {
        let result;
        try {
            result = await validateSession(token);
        } catch (cause) {
            if (cause instanceof DomainError) error(cause.status, cause.message);
            throw cause;
        }
        if (result) {
            event.locals.actor = result.actor;
            event.locals.user = result.user;
            event.locals.session = result.session;
        } else {
            event.cookies.delete(SESSION_COOKIE, authCookieOptions);
        }
    }
    if (event.request.method === 'GET' && event.route.id?.startsWith('/g/') && event.params.guildId) {
        // 내부 이동은 상위 layout을 재사용할 수 있으므로 모든 병렬 load보다 먼저 갱신한다.
        await refreshGuildViewAccess(event.locals.actor, event.params.guildId);
    }
    return resolve(event);
};
