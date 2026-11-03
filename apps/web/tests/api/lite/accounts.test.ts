import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRiotAccount, type AccountDependencies } from '../../../src/lib/server/accounts/queries.ts';
import { RiotError } from '../../../src/lib/server/riot/errors.ts';
import { domainError, riotError } from '../support/error-assertions.ts';

const actor = (index: number) => ({ userId: String(710000000000000100n + BigInt(index)), isServiceAdmin: false });
const riot = (overrides: Partial<NonNullable<AccountDependencies['riot']>> = {}): NonNullable<AccountDependencies['riot']> => ({
	getAccountByRiotId: async () => ({ puuid: 'validated-puuid', gameName: 'CanonicalName', tagLine: 'KR1' }),
	getActiveRegion: async () => ({ puuid: 'validated-puuid', game: 'lol', region: 'kr' }), ...overrides
});

test('Riot 정규 이름과 LoL 플랫폼을 반환하고 ACCOUNT 지역을 저장하지 않는다', async () => {
	assert.deepEqual(await resolveRiotAccount(actor(1), 'EnteredName#KR1', { riot: riot() }),
		{ puuid: 'validated-puuid', gameName: 'CanonicalName', tagLine: 'KR1', region: 'KR' });
});

test('이름이 없는 Riot 응답은 검증된 입력 이름을 보존한다', async () => {
	assert.deepEqual(await resolveRiotAccount(actor(2), 'EnteredName#KR1', { riot: riot({ getAccountByRiotId: async () => ({ puuid: 'validated-puuid' }) }) }),
		{ puuid: 'validated-puuid', gameName: 'EnteredName', tagLine: 'KR1', region: 'KR' });
});

test('잘못된 Riot ID는 조회·호출 제한 횟수를 소비하지 않는다', async (t) => {
	t.mock.method(Date, 'now', () => Date.parse('2026-11-03T00:00:00Z'));
	let calls = 0;
	const dependencies = { riot: riot({ getAccountByRiotId: async () => { calls++; return { puuid: 'validated-puuid' }; } }) };
	for (let index = 0; index < 11; index++) await assert.rejects(resolveRiotAccount(actor(3), '잘못된입력', dependencies), domainError('INVALID_INPUT', 400));
	assert.equal(calls, 0);
	await resolveRiotAccount(actor(3), 'EnteredName#KR1', dependencies);
	assert.equal(calls, 1);
});

for (const [index, name, active] of [
	[4, 'PUUID 불일치', { puuid: 'other-puuid', game: 'lol', region: 'kr' }],
	[5, 'ACCOUNT 지역', { puuid: 'validated-puuid', game: 'lol', region: 'asia' }],
	[6, '다른 게임', { puuid: 'validated-puuid', game: 'val', region: 'kr' }]
] as const) {
	test(`계정 지역 검증: ${name}`, async () => {
		await assert.rejects(resolveRiotAccount(actor(index), 'EnteredName#KR1', { riot: riot({ getActiveRegion: async () => active as Awaited<ReturnType<NonNullable<AccountDependencies['riot']>['getActiveRegion']>> }) }), riotError('INVALID_RESPONSE', 502));
	});
}

for (const [index, puuid] of [[7, '../unsafe'], [8, ''], [9, 'a'.repeat(129)]] as const) {
	test(`계정 PUUID 검증: 사례 ${index}`, async () => {
		await assert.rejects(resolveRiotAccount(actor(index), 'EnteredName#KR1', { riot: riot({ getAccountByRiotId: async () => ({ puuid }) }) }), riotError('INVALID_RESPONSE'));
	});
}

for (const [index, name, account] of [
	[12, '이름 길이 부족', { gameName: 'ab', tagLine: 'KR1' }],
	[13, '이름 길이 초과', { gameName: 'a'.repeat(17), tagLine: 'KR1' }],
	[14, '태그 길이 부족', { gameName: 'CanonicalName', tagLine: 'KR' }],
	[15, '태그 길이 초과', { gameName: 'CanonicalName', tagLine: 'KR1234' }],
	[16, '태그 특수 문자', { gameName: 'CanonicalName', tagLine: 'KR!' }]
] as const) {
	test(`Riot 정규 이름도 연결 가능한 Riot ID 형식인지 확인한다: ${name}`, async () => {
		await assert.rejects(resolveRiotAccount(actor(index), 'EnteredName#KR1', { riot: riot({
			getAccountByRiotId: async () => ({ puuid: 'validated-puuid', ...account })
		}) }), riotError('INVALID_RESPONSE', 502));
	});
}

test('조회 제한은 실행자별이며 60초 경계에서 초기화한다', async (t) => {
	let now = Date.parse('2026-11-03T00:01:00Z');
	t.mock.method(Date, 'now', () => now);
	let calls = 0;
	const dependencies = { riot: riot({ getAccountByRiotId: async () => { calls++; return { puuid: 'validated-puuid' }; } }) };
	for (let index = 0; index < 10; index++) await resolveRiotAccount(actor(10), 'EnteredName#KR1', dependencies);
	await assert.rejects(resolveRiotAccount(actor(10), 'EnteredName#KR1', dependencies), (error: unknown) => {
		assert.ok(error instanceof RiotError);
		assert.equal(error.code, 'RATE_LIMITED');
		assert.equal(error.retryAfterSeconds, 60);
		return true;
	});
	await resolveRiotAccount(actor(11), 'EnteredName#KR1', dependencies);
	now += 59_999;
	await assert.rejects(resolveRiotAccount(actor(10), 'EnteredName#KR1', dependencies), riotError('RATE_LIMITED'));
	assert.equal(calls, 11);
	now++;
	await resolveRiotAccount(actor(10), 'EnteredName#KR1', dependencies);
	assert.equal(calls, 12);
});
