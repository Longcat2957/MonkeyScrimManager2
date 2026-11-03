import { error, redirect } from '@sveltejs/kit';
import { getOAuthConfig } from '#lib/server/auth/config.ts';
import { OAUTH_COOKIE, SESSION_COOKIE, authCookieOptions } from '#lib/server/auth/cookies.ts';
import { fetchDiscordProfile, readOAuthTransaction, validateOAuthCallback } from '#lib/server/auth/oauth.ts';
import { createSession } from '#lib/server/auth/session.ts';
import { DomainError } from '#lib/server/errors.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies, locals, setHeaders }) => {
	setHeaders({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
	const transactionCookie = cookies.get(OAUTH_COOKIE);
	// 취소·검증 실패·외부 장애를 포함하여 콜백마다 로그인 시도 쿠키를 소비한다.
	cookies.delete(OAUTH_COOKIE, authCookieOptions);
	let returnTo;
	try {
		const config = getOAuthConfig();
		const transaction = readOAuthTransaction(transactionCookie, url.searchParams.get('state'), config.clientSecret);
		const code = validateOAuthCallback(url, config);
		const profile = await fetchDiscordProfile(config, code, transaction.verifier);
		const issued = await createSession(profile, cookies.get(SESSION_COOKIE));
		cookies.set(SESSION_COOKIE, issued.token, { ...authCookieOptions, expires: issued.session.expiresAt });
		locals.user = issued.user;
		locals.actor = { userId: issued.user.userId, isServiceAdmin: issued.user.isServiceAdmin };
		locals.session = issued.session;
		returnTo = transaction.returnTo;
	} catch (cause) {
		if (cause instanceof DomainError) error(cause.status, cause.message);
		throw cause;
	}
	redirect(303, returnTo);
};
