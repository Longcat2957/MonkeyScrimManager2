import { randomUUID } from 'node:crypto';
import { error } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { SESSION_COOKIE, authCookieOptions } from '#lib/server/auth/cookies.ts';
import { validateSession } from '#lib/server/auth/session.ts';
import { DomainError } from '#lib/server/errors.ts';

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
	return resolve(event);
};
