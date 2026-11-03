import assert from 'node:assert/strict';
import test from 'node:test';
import { error as httpError, isHttpError, redirect } from '@sveltejs/kit';
import { actionFailure } from '../../../src/lib/server/actions.ts';
import { requireServiceAdmin, requireUser } from '../../../src/lib/server/auth/guards.ts';
import { DiscordError } from '../../../src/lib/server/discord/client.ts';
import { DomainError } from '../../../src/lib/server/errors.ts';
import { routeError } from '../../../src/lib/server/http.ts';
import { domainError } from '../support/error-assertions.ts';

const actor = { userId: '710000000000000001', isServiceAdmin: false };

for (const [name, guard] of [['사용자', requireUser], ['서비스 운영자', requireServiceAdmin]] as const) {
	test(`${name} guard: 인증 없으면 401`, () => assert.throws(() => guard(null), domainError('UNAUTHENTICATED', 401)));
}

test('사용자와 서비스 운영자 권한을 구분하고 실행자 객체를 보존한다', () => {
	assert.equal(requireUser(actor), actor);
	assert.throws(() => requireServiceAdmin(actor), domainError('FORBIDDEN', 403));
	const admin = { ...actor, isServiceAdmin: true };
	assert.equal(requireServiceAdmin(admin), admin);
});

for (const [code, status] of [
	['INVALID_INPUT', 400], ['UNAUTHENTICATED', 401], ['FORBIDDEN', 403],
	['NOT_FOUND', 404], ['CONFLICT', 409], ['SERVICE_UNAVAILABLE', 503]
] as const) {
	test(`${code}: form action과 HTTP 오류에 상태·공개 메시지를 보존한다`, () => {
		const cause = new DomainError(code, '공개 메시지');
		const failure = actionFailure(cause);
		assert.equal(failure.status, status);
		assert.deepEqual(failure.data, { code, message: '공개 메시지' });
		assert.throws(() => routeError(cause), (error: unknown) => {
			assert.ok(isHttpError(error, status));
			assert.deepEqual(error.body, { status, message: '공개 메시지' });
			return true;
		});
	});
}

test('입력 필드 오류와 호출 제한의 Retry-After를 응답에 유지한다', () => {
	assert.deepEqual(actionFailure(new DomainError('INVALID_INPUT', '입력 확인', { title: '필수' })).data,
		{ code: 'INVALID_INPUT', message: '입력 확인', errors: { title: '필수' } });
	let headers: Record<string, string> | undefined;
	const failure = actionFailure(new DiscordError(429, '대기', 12), (value) => { headers = value; });
	assert.equal(failure.status, 429);
	assert.deepEqual(failure.data, { message: '대기' });
	assert.deepEqual(headers, { 'Retry-After': '12' });
	assert.throws(() => routeError(new DiscordError(503, '연동 실패')), (error: unknown) => isHttpError(error, 503));
});

for (const [label, create] of [
	['일반 오류', () => new Error('private database detail')],
	['위조 객체', () => ({ code: 'FORBIDDEN', status: 403, message: '위조' })],
	['SvelteKit HTTP 오류', () => { try { httpError(404, '없음'); } catch (error) { return error; } }],
	['SvelteKit redirect', () => { try { redirect(303, '/me'); } catch (error) { return error; } }]
] as const) {
	test(`${label}: 알려진 업무 오류로 숨기지 않고 원래 객체를 전파한다`, () => {
		const cause = create();
		assert.throws(() => actionFailure(cause), (error: unknown) => error === cause);
		assert.throws(() => routeError(cause), (error: unknown) => error === cause);
	});
}
