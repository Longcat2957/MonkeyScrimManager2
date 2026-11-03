import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRiotAccount, type AccountDependencies } from '../src/lib/server/accounts/queries.ts';
import { DomainError } from '../src/lib/server/errors.ts';
import { RiotError } from '../src/lib/server/riot/errors.ts';

const actor = { userId: '123456789012345678', isServiceAdmin: false };
function riot(overrides: Partial<NonNullable<AccountDependencies['riot']>> = {}): NonNullable<AccountDependencies['riot']> {
	return {
		getAccountByRiotId: async () => ({ puuid: 'validated-puuid', gameName: 'CanonicalName', tagLine: 'KR1' }),
		getActiveRegion: async () => ({ puuid: 'validated-puuid', game: 'lol', region: 'kr' }),
		...overrides
	};
}

test('실제 Riot 응답의 이름과 LoL 플랫폼을 사용하고 ACCOUNT 라우팅값을 저장하지 않는다', async () => {
	assert.deepEqual(await resolveRiotAccount(actor, 'EnteredName#KR1', { riot: riot() }), {
		puuid: 'validated-puuid', gameName: 'CanonicalName', tagLine: 'KR1', region: 'KR'
	});
});

test('잘못된 Riot ID는 API를 호출하지 않고 입력 오류로 반환한다', async () => {
	await assert.rejects(resolveRiotAccount(actor, '잘못된입력', { riot: riot({
		getAccountByRiotId: async () => { assert.fail('잘못된 입력을 조회하면 안 된다'); }
	}) }), (error: unknown) => error instanceof DomainError && error.status === 400);
});

test('PUUID가 다른 지역 응답과 ACCOUNT 지역명은 검증 실패로 처리한다', async () => {
	for (const value of [
		{ puuid: 'other-puuid', game: 'lol' as const, region: 'kr' },
		{ puuid: 'validated-puuid', game: 'lol' as const, region: 'asia' }
	]) {
		await assert.rejects(resolveRiotAccount(actor, 'EnteredName#KR1', { riot: riot({ getActiveRegion: async () => value }) }),
			(error: unknown) => error instanceof RiotError && error.status === 502);
	}
});

test('동일 실행자의 과도한 조회를 제한하고 Retry-After를 제공한다', async () => {
	const limitedActor = { ...actor, userId: '223456789012345678' };
	let calls = 0;
	const dependencies = { riot: riot({ getAccountByRiotId: async () => {
		calls += 1;
		return { puuid: 'validated-puuid', gameName: 'CanonicalName', tagLine: 'KR1' };
	} }) };
	for (let index = 0; index < 10; index += 1) await resolveRiotAccount(limitedActor, 'EnteredName#KR1', dependencies);
	await assert.rejects(resolveRiotAccount(limitedActor, 'EnteredName#KR1', dependencies), (error: unknown) => {
		assert.ok(error instanceof RiotError);
		assert.equal(error.status, 429);
		assert.ok(error.retryAfterSeconds! > 0);
		return true;
	});
	assert.equal(calls, 10);
});
