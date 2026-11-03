import assert from 'node:assert/strict';
import test from 'node:test';
import { error as httpError, redirect } from '@sveltejs/kit';
import { actionFailure } from '../src/lib/server/actions.ts';
import { requireServiceAdmin, requireUser } from '../src/lib/server/auth/guards.ts';
import { DomainError } from '../src/lib/server/errors.ts';
import { DiscordError } from '../src/lib/server/discord/client.ts';

test('미인증과 서비스 운영 권한 부족을 구분하고 인증된 실행자를 유지한다', () => {
	for (const guard of [requireUser, requireServiceAdmin]) {
		assert.throws(() => guard(null), (error: unknown) => {
			assert.ok(error instanceof DomainError);
			assert.equal(error.status, 401);
			return true;
		});
	}
	const member = { userId: '123456789012345678', isServiceAdmin: false };
	assert.equal(requireUser(member), member);
	assert.throws(() => requireServiceAdmin(member), (error: unknown) => {
		assert.ok(error instanceof DomainError);
		assert.equal(error.status, 403);
		return true;
	});
	const admin = { ...member, isServiceAdmin: true };
	assert.equal(requireServiceAdmin(admin), admin);
});

test('업무 오류를 기존 폼의 메시지·필드 오류 계약으로 변환한다', () => {
	const failure = actionFailure(new DomainError('INVALID_INPUT', '입력을 확인해 주세요', { title: '제목이 필요해요' }));
	assert.equal(failure.status, 400);
	assert.deepEqual(failure.data, {
		code: 'INVALID_INPUT',
		message: '입력을 확인해 주세요',
		errors: { title: '제목이 필요해요' }
	});
});

test('예상하지 못한 오류와 업무 오류처럼 생긴 객체는 폼 오류로 숨기지 않는다', () => {
	for (const unexpected of [new Error('database failure'), { code: 'FORBIDDEN', status: 403, message: 'untrusted' }]) {
		assert.throws(() => actionFailure(unexpected), (error: unknown) => error === unexpected);
	}
});

test('SvelteKit 이동과 HTTP 오류를 원래 객체 그대로 전달한다', () => {
	for (const run of [() => redirect(303, '/me'), () => httpError(404, '대상을 찾을 수 없습니다.')]) {
		let caught = false;
		try {
			run();
		} catch (original) {
			caught = true;
			assert.throws(() => actionFailure(original), (error: unknown) => error === original);
		}
		assert.ok(caught);
	}
});


test('Discord 제한 응답의 상태와 재시도 시간을 폼 응답에 보존한다', () => {
	let headers: Record<string, string> | undefined;
	const failure = actionFailure(new DiscordError(429, '잠시 후 다시 시도해 주세요', 12), (value) => { headers = value; });
	assert.equal(failure.status, 429);
	assert.deepEqual(headers, { 'Retry-After': '12' });
	assert.deepEqual(failure.data, { message: '잠시 후 다시 시도해 주세요' });
	assert.equal(actionFailure(new DiscordError(503, 'Discord 연동을 사용할 수 없어요')).status, 503);
});
