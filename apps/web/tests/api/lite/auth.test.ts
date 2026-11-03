import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { beginDiscordLogin, fetchDiscordProfile, OAUTH_LIFETIME_SECONDS, readOAuthConfig, readOAuthTransaction, safeReturnTo, validateOAuthCallback } from '../../../src/lib/server/auth/oauth.ts';
import { hashSessionToken, newSession, sessionExpired, sessionUser, SESSION_LIFETIME_SECONDS } from '../../../src/lib/server/auth/session-core.ts';
import { DomainError } from '../../../src/lib/server/errors.ts';
import { domainError } from '../support/error-assertions.ts';

const now = Date.parse('2026-11-03T00:00:00Z');
const config = { clientId: '710000000000000001', clientSecret: 'test-only-secret', redirectUri: 'https://monkeybot.test/auth/discord/callback' };
const values = { DISCORD_CLIENT_ID: config.clientId, DISCORD_CLIENT_SECRET: config.clientSecret, DISCORD_REDIRECT_URI: config.redirectUri };

test('OAuth 설정은 고정 HTTPS 콜백이며 로컬 HTTP는 개발에서만 허용한다', () => {
	assert.deepEqual(readOAuthConfig(values), config);
	const local = { ...values, DISCORD_REDIRECT_URI: 'http://127.0.0.1:5173/auth/discord/callback' };
	assert.throws(() => readOAuthConfig(local), domainError('SERVICE_UNAVAILABLE'));
	assert.equal(readOAuthConfig(local, true).redirectUri, local.DISCORD_REDIRECT_URI);
});

for (const [name, override] of [
	['누락 콜백', { DISCORD_REDIRECT_URI: undefined }],
	['다른 경로', { DISCORD_REDIRECT_URI: 'https://monkeybot.test/callback' }],
	['쿼리', { DISCORD_REDIRECT_URI: `${config.redirectUri}?next=x` }],
	['fragment', { DISCORD_REDIRECT_URI: `${config.redirectUri}#next` }],
	['자격 증명 URL', { DISCORD_REDIRECT_URI: 'https://user:password@monkeybot.test/auth/discord/callback' }],
	['원격 HTTP', { DISCORD_REDIRECT_URI: 'http://monkeybot.test/auth/discord/callback' }],
	['누락 비밀 키', { DISCORD_CLIENT_SECRET: '' }],
	['잘못된 클라이언트 ID', { DISCORD_CLIENT_ID: 'not-an-id' }]
] as const) {
	test(`OAuth 설정 거절: ${name}`, () => assert.throws(() => readOAuthConfig({ ...values, ...override }), domainError('SERVICE_UNAVAILABLE', 503)));
}

for (const [name, value] of [
	['누락', undefined], ['빈 문자열', ''], ['외부 URL', 'https://evil.test'], ['프로토콜 상대 URL', '//evil.test'],
	['역슬래시', '/\\evil.test'], ['인코딩 슬래시', '/%2fevil.test'], ['인코딩 역슬래시', '/%5cevil.test'],
	['개행', '/\r\nevil'], ['인코딩 제어 문자', '/%0aevil'], ['로그인 루프', '/auth/discord'],
	['정규화 로그인 루프', '/a/../auth/discord'], ['로그아웃 루프', '/auth/logout'], ['길이 초과', '/' + 'a'.repeat(1024)]
] as const) {
	test(`안전하지 않은 복귀 주소는 홈으로: ${name}`, () => assert.equal(safeReturnTo(value), '/'));
}

test('안전한 복귀 주소는 쿼리와 fragment를 유지한다', () => {
	assert.equal(safeReturnTo('/g/123/scrims?page=2#recruit'), '/g/123/scrims?page=2#recruit');
});

test('OAuth 요청별 state·PKCE는 독립적이고 URL에 비밀 값이 없다', () => {
	const login = beginDiscordLogin(config, '/me', now);
	const second = beginDiscordLogin(config, '/me', now);
	const url = new URL(login.authorizationUrl);
	const transaction = readOAuthTransaction(login.cookie, url.searchParams.get('state'), config.clientSecret, now);
	assert.equal(url.origin, 'https://discord.com');
	assert.equal(url.searchParams.get('client_id'), config.clientId);
	assert.equal(url.searchParams.get('redirect_uri'), config.redirectUri);
	assert.equal(url.searchParams.get('scope'), 'identify');
	assert.equal(url.searchParams.get('response_type'), 'code');
	assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
	assert.equal(url.searchParams.get('code_challenge'), createHash('sha256').update(transaction.verifier).digest('base64url'));
	assert.equal(transaction.returnTo, '/me');
	assert.equal(transaction.expiresAt, now + OAUTH_LIFETIME_SECONDS * 1000);
	assert.notEqual(login.cookie, second.cookie);
	assert.ok(!login.authorizationUrl.includes(config.clientSecret));
	assert.ok(!login.authorizationUrl.includes(transaction.verifier));
});

for (const variant of ['missing', 'extra', 'tampered', 'state', 'secret', 'expired', 'future'] as const) {
	test(`OAuth 트랜잭션 거절: ${variant}`, () => {
		const login = beginDiscordLogin(config, '/me', now);
		const state = new URL(login.authorizationUrl).searchParams.get('state');
		const cookie = variant === 'missing' ? undefined : variant === 'extra' ? login.cookie + '.extra' : variant === 'tampered' ? `x${login.cookie.slice(1)}` : login.cookie;
		const time = variant === 'expired' ? now + OAUTH_LIFETIME_SECONDS * 1000 : variant === 'future' ? now - 1 : now;
		assert.throws(() => readOAuthTransaction(cookie, variant === 'state' ? 'wrong-state' : state,
			variant === 'secret' ? 'wrong-secret' : config.clientSecret, time), domainError('INVALID_INPUT', 400));
	});
}

test('OAuth 만료 직전에는 아직 유효하다', () => {
	const login = beginDiscordLogin(config, '/me', now);
	assert.equal(readOAuthTransaction(login.cookie, new URL(login.authorizationUrl).searchParams.get('state'), config.clientSecret,
		now + OAUTH_LIFETIME_SECONDS * 1000 - 1).returnTo, '/me');
});

for (const [name, url] of [
	['다른 출처', 'https://evil.test/auth/discord/callback?code=x&state=s'],
	['다른 경로', 'https://monkeybot.test/other?code=x&state=s'],
	['다른 발급자', `${config.redirectUri}?code=x&state=s&iss=https://evil.test`],
	['사용자 취소', `${config.redirectUri}?error=access_denied&state=s`],
	['code 없음', `${config.redirectUri}?state=s`],
	['code 중복', `${config.redirectUri}?code=a&code=b&state=s`],
	['state 중복', `${config.redirectUri}?code=a&state=s&state=t`]
] as const) {
	test(`OAuth 콜백 거절: ${name}`, () => assert.throws(() => validateOAuthCallback(new URL(url), config), domainError('INVALID_INPUT')));
}

test('정상 콜백과 메모리 토큰 교환은 프로필만 반환한다', async () => {
	assert.equal(validateOAuthCallback(new URL(`${config.redirectUri}?code=code-value&state=s&iss=https%3A%2F%2Fdiscord.com`), config), 'code-value');
	const calls: { url: string; init?: RequestInit }[] = [];
	const profile = await fetchDiscordProfile(config, 'code-value', 'verifier-value', async (input, init) => {
		calls.push({ url: String(input), init });
		return calls.length === 1 ? Response.json({ access_token: 'private-token', refresh_token: 'private-refresh', token_type: 'Bearer', scope: 'identify' })
			: Response.json({ id: config.clientId, username: 'tester', global_name: '테스터', avatar: null });
	});
	assert.deepEqual(profile, { id: config.clientId, username: 'tester', globalName: '테스터', avatarHash: null });
	assert.equal(calls[0]!.url, 'https://discord.com/api/oauth2/token');
	const body = calls[0]!.init!.body as URLSearchParams;
	assert.equal(body.get('code'), 'code-value');
	assert.equal(body.get('code_verifier'), 'verifier-value');
	assert.equal(body.get('redirect_uri'), config.redirectUri);
	assert.equal(calls[1]!.url, 'https://discord.com/api/v10/users/@me');
	assert.equal(new Headers(calls[1]!.init!.headers).get('Authorization'), 'Bearer private-token');
	assert.ok(calls.every((call) => call.init?.redirect === 'error' && call.init.signal instanceof AbortSignal));
	assert.doesNotMatch(JSON.stringify(profile), /private-|token/i);
});

for (const [name, response] of [
	['호출 제한', () => new Response('private-body', { status: 429 })],
	['불완전 토큰', () => Response.json({ access_token: 'private-token' })],
	['JSON 아님', () => new Response('private-body')],
	['통신 오류', () => { throw new Error('private-network'); }]
] as const) {
	test(`OAuth 외부 실패는 비밀 값을 숨긴다: ${name}`, async () => {
		await assert.rejects(fetchDiscordProfile(config, 'private-code', 'private-verifier', async () => response()), (error: unknown) => {
			assert.ok(error instanceof DomainError);
			assert.equal(error.status, 503);
			assert.doesNotMatch(error.message, /private/);
			return true;
		});
	});
}

test('잘못된 프로필 avatar를 토큰 교환 성공으로 숨기지 않는다', async () => {
	let calls = 0;
	await assert.rejects(fetchDiscordProfile(config, 'code', 'verifier', async () => ++calls === 1
		? Response.json({ access_token: 'token', token_type: 'Bearer', scope: 'identify' })
		: Response.json({ id: config.clientId, username: 'tester', avatar: '../unsafe' })), domainError('SERVICE_UNAVAILABLE'));
});

test('세션 토큰은 독립 난수이고 저장 자료는 해시·고정 만료 시각이다', () => {
	const first = newSession(config.clientId, new Date(now));
	const second = newSession(config.clientId, new Date(now));
	assert.match(first.token, /^[A-Za-z0-9_-]{43}$/);
	assert.match(first.record.tokenHash, /^[a-f0-9]{64}$/);
	assert.equal(hashSessionToken(first.token), first.record.tokenHash);
	assert.notEqual(first.token, second.token);
	assert.notEqual(first.record.tokenHash, first.token);
	assert.equal(first.record.expiresAt.getTime(), now + SESSION_LIFETIME_SECONDS * 1000);
	assert.equal(sessionExpired(first.record.expiresAt, new Date(first.record.expiresAt.getTime() - 1)), false);
	assert.equal(sessionExpired(first.record.expiresAt, first.record.expiresAt), true);
	assert.equal(sessionExpired(new Date('invalid'), new Date(now)), true);
});

for (const token of ['', 'short', 'a'.repeat(44), '\\'.repeat(43)]) {
	test(`잘못된 세션 토큰 길이 ${token.length}: 해시하지 않는다`, () => assert.equal(hashSessionToken(token), null));
}

test('표시 DTO는 사용자 프로필·현재 서비스 권한만 반환한다', () => {
	const user = { id: config.clientId, username: 'tester', globalName: null, avatarHash: null, isServiceAdmin: false };
	assert.deepEqual(sessionUser(user), { userId: user.id, displayName: 'tester', avatarUrl: null, isServiceAdmin: false });
	assert.deepEqual(sessionUser({ ...user, globalName: '테스터', avatarHash: 'a'.repeat(32), isServiceAdmin: true }), {
		userId: user.id, displayName: '테스터', avatarUrl: `https://cdn.discordapp.com/avatars/${user.id}/${'a'.repeat(32)}.webp?size=128`, isServiceAdmin: true
	});
});
