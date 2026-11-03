import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
	beginDiscordLogin, fetchDiscordProfile, OAUTH_LIFETIME_SECONDS,
	readOAuthConfig, readOAuthTransaction, safeReturnTo, validateOAuthCallback
} from '../src/lib/server/auth/oauth.ts';
import { hashSessionToken, newSession, sessionExpired, sessionUser, SESSION_LIFETIME_SECONDS } from '../src/lib/server/auth/session-core.ts';
import { DomainError } from '../src/lib/server/errors.ts';

const config = {
	clientId: '123456789012345678',
	clientSecret: 'test-only-client-secret',
	redirectUri: 'https://example.com/auth/discord/callback'
};
const now = Date.parse('2026-11-03T00:00:00Z');

function hasStatus(status: number) {
	return (error: unknown) => error instanceof DomainError && error.status === status;
}

test('OAuth 설정은 고정 HTTPS 콜백을 요구하고 개발에서만 로컬 HTTP를 허용한다', () => {
	const values = { DISCORD_CLIENT_ID: config.clientId, DISCORD_CLIENT_SECRET: config.clientSecret, DISCORD_REDIRECT_URI: config.redirectUri };
	assert.deepEqual(readOAuthConfig(values), config);
	for (const invalid of [undefined, '', 'https://example.com/callback', 'https://example.com/auth/discord/callback?next=x', 'https://user:secret@example.com/auth/discord/callback', 'http://example.com/auth/discord/callback']) {
		assert.throws(() => readOAuthConfig({ ...values, DISCORD_REDIRECT_URI: invalid }), hasStatus(503));
	}
	assert.throws(() => readOAuthConfig({ ...values, DISCORD_CLIENT_SECRET: '' }), hasStatus(503));
	const local = { ...values, DISCORD_REDIRECT_URI: 'http://localhost:5173/auth/discord/callback' };
	assert.throws(() => readOAuthConfig(local), hasStatus(503));
	assert.equal(readOAuthConfig(local, true).redirectUri, local.DISCORD_REDIRECT_URI);
});

test('로그인 복귀 주소는 내부 경로만 허용하고 인증 반복 경로를 제외한다', () => {
	assert.equal(safeReturnTo('/g/123/scrims?page=2#recruit'), '/g/123/scrims?page=2#recruit');
	for (const unsafe of [null, undefined, '', 'https://evil.example', '//evil.example', '/\\evil.example', '/%2fevil.example', '/%5cevil.example', '/\r\nevil', '/%0aevil', '/auth/discord', '/a/../auth/discord', '/auth/logout', '/' + 'a'.repeat(1024)]) {
		assert.equal(safeReturnTo(unsafe), '/', String(unsafe));
	}
});

test('로그인 요청마다 state와 PKCE를 발급하고 서명 쿠키와 challenge를 연결한다', () => {
	const first = beginDiscordLogin(config, '/me', now);
	const second = beginDiscordLogin(config, '/me', now);
	const target = new URL(first.authorizationUrl);
	const transaction = readOAuthTransaction(first.cookie, target.searchParams.get('state'), config.clientSecret, now);
	assert.equal(target.origin, 'https://discord.com');
	assert.equal(target.searchParams.get('client_id'), config.clientId);
	assert.equal(target.searchParams.get('redirect_uri'), config.redirectUri);
	assert.equal(target.searchParams.get('response_type'), 'code');
	assert.equal(target.searchParams.get('scope'), 'identify');
	assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
	assert.equal(target.searchParams.get('code_challenge'), createHash('sha256').update(transaction.verifier).digest('base64url'));
	assert.equal(transaction.returnTo, '/me');
	assert.notEqual(first.cookie, second.cookie);
	assert.ok(!first.authorizationUrl.includes(config.clientSecret));
	assert.ok(!first.authorizationUrl.includes(transaction.verifier));
});

test('state 불일치·쿠키 변조·만료·누락은 토큰 교환 전에 거절한다', () => {
	const login = beginDiscordLogin(config, '/me', now);
	const state = new URL(login.authorizationUrl).searchParams.get('state');
	for (const cookie of [undefined, '', login.cookie + '.extra', `x${login.cookie.slice(1)}`]) {
		assert.throws(() => readOAuthTransaction(cookie, state, config.clientSecret, now), hasStatus(400));
	}
	assert.throws(() => readOAuthTransaction(login.cookie, 'wrong-state', config.clientSecret, now), hasStatus(400));
	assert.throws(() => readOAuthTransaction(login.cookie, state, 'wrong-secret', now), hasStatus(400));
	assert.throws(() => readOAuthTransaction(login.cookie, state, config.clientSecret, now + OAUTH_LIFETIME_SECONDS * 1000), hasStatus(400));
	assert.throws(() => readOAuthTransaction(login.cookie, state, config.clientSecret, now - 1), hasStatus(400));
});

test('콜백은 고정 출처·경로와 Discord 발급자를 확인하고 취소·중복 code를 거절한다', () => {
	const valid = new URL(`${config.redirectUri}?code=example-code&state=state&iss=https%3A%2F%2Fdiscord.com`);
	assert.equal(validateOAuthCallback(valid, config), 'example-code');
	for (const invalid of [
		new URL('https://evil.example/auth/discord/callback?code=code&state=state'),
		new URL('https://example.com/other?code=code&state=state'),
		new URL(`${config.redirectUri}?code=code&state=state&iss=https://evil.example`),
		new URL(`${config.redirectUri}?error=access_denied&state=state`),
		new URL(`${config.redirectUri}?state=state`),
		new URL(`${config.redirectUri}?code=one&code=two&state=state`)
	]) assert.throws(() => validateOAuthCallback(invalid, config), hasStatus(400));
});

test('토큰 교환은 verifier와 고정 콜백을 전송하고 토큰을 제외한 사용자 정보만 반환한다', async () => {
	const calls: { url: string; init?: RequestInit }[] = [];
	const request: typeof fetch = async (input, init) => {
		calls.push({ url: String(input), init });
		if (calls.length === 1) return Response.json({ access_token: 'private-access-token', refresh_token: 'private-refresh-token', token_type: 'Bearer', scope: 'identify' });
		return Response.json({ id: config.clientId, username: 'tester', global_name: '테스터', avatar: null });
	};
	const profile = await fetchDiscordProfile(config, 'code-value', 'verifier-value', request);
	assert.deepEqual(profile, { id: config.clientId, username: 'tester', globalName: '테스터', avatarHash: null });
	assert.equal(calls[0].url, 'https://discord.com/api/oauth2/token');
	const body = calls[0].init?.body as URLSearchParams;
	assert.equal(body.get('redirect_uri'), config.redirectUri);
	assert.equal(body.get('code_verifier'), 'verifier-value');
	assert.equal(body.get('code'), 'code-value');
	assert.equal(calls[1].url, 'https://discord.com/api/v10/users/@me');
	assert.equal(new Headers(calls[1].init?.headers).get('Authorization'), 'Bearer private-access-token');
	assert.ok(calls.every((call) => call.init?.redirect === 'error' && call.init?.signal instanceof AbortSignal));
	assert.ok(!JSON.stringify(profile).includes('token'));
});

test('Discord 장애와 잘못된 응답은 비밀 정보를 포함하지 않은 503 오류로 처리한다', async () => {
	for (const response of [new Response('private-error-content', { status: 429 }), Response.json({ access_token: 'private-token' }), new Response('not json')]) {
		await assert.rejects(fetchDiscordProfile(config, 'private-code', 'private-verifier', async () => response), (error: unknown) => {
			assert.ok(error instanceof DomainError);
			assert.equal(error.status, 503);
			assert.ok(!error.message.includes('private'));
			return true;
		});
	}
	await assert.rejects(fetchDiscordProfile(config, 'code', 'verifier', async () => { throw new Error('private-network-details'); }), hasStatus(503));
	let call = 0;
	await assert.rejects(fetchDiscordProfile(config, 'code', 'verifier', async () => {
		return ++call === 1
			? Response.json({ access_token: 'token', token_type: 'Bearer', scope: 'identify' })
			: Response.json({ id: config.clientId, username: 'tester', avatar: '../unsafe' });
	}), hasStatus(503));
});

test('세션 원본은 매번 새 난수이며 DB에는 해시와 고정 만료 시각을 저장한다', () => {
	const issued = newSession(config.clientId, new Date(now));
	const another = newSession(config.clientId, new Date(now));
	assert.match(issued.token, /^[A-Za-z0-9_-]{43}$/);
	assert.match(issued.record.tokenHash, /^[a-f0-9]{64}$/);
	assert.equal(hashSessionToken(issued.token), issued.record.tokenHash);
	assert.notEqual(issued.token, another.token);
	assert.notEqual(issued.record.tokenHash, issued.token);
	assert.equal(issued.record.expiresAt.getTime(), now + SESSION_LIFETIME_SECONDS * 1000);
	assert.equal(sessionExpired(issued.record.expiresAt, new Date(now)), false);
	assert.equal(sessionExpired(issued.record.expiresAt, issued.record.expiresAt), true);
	assert.equal(sessionExpired(new Date('invalid'), new Date(now)), true);
	for (const invalid of ['', 'short', 'a'.repeat(44), '\\'.repeat(43)]) assert.equal(hashSessionToken(invalid), null);
});

test('표시 사용자 DTO는 저장된 프로필과 서비스 권한만 사용하고 세션 정보를 제외한다', () => {
	const user = { id: config.clientId, username: 'tester', globalName: null, avatarHash: null, isServiceAdmin: false };
	assert.deepEqual(sessionUser(user), { userId: config.clientId, displayName: 'tester', avatarUrl: null, isServiceAdmin: false });
	const admin = sessionUser({ ...user, globalName: '테스터', avatarHash: 'a'.repeat(32), isServiceAdmin: true });
	assert.equal(admin.displayName, '테스터');
	assert.equal(admin.isServiceAdmin, true);
	assert.equal(admin.avatarUrl, `https://cdn.discordapp.com/avatars/${config.clientId}/${'a'.repeat(32)}.webp?size=128`);
	assert.equal('tokenHash' in admin, false);
});
