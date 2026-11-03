import assert from 'node:assert/strict';
import test from 'node:test';
import { createDataDragonClient, CATALOG_TTL_SECONDS, METADATA_TTL_SECONDS } from '../../../src/lib/server/ddragon/client.ts';
import { dataDragonImageUrl, dataDragonRuneIconUrl } from '../../../src/lib/server/ddragon/assets.ts';
import { dataDragonResponse } from '../../../src/lib/server/ddragon/http.ts';
import { RiotError } from '../../../src/lib/server/riot/errors.ts';
import { riotError } from '../support/error-assertions.ts';

const catalog = { type: 'champion', version: '16.21.1', data: { Aatrox: { id: 'Aatrox', key: '266', name: '아트록스' } } };
const runes = [{ id: 8000, key: 'Precision', name: '정밀', icon: 'perk-images/Styles/7201_Precision.png', slots: [{ runes: [
	{ id: 8005, key: 'PressTheAttack', name: '집중 공격', icon: 'perk-images/Styles/Precision/PressTheAttack/PressTheAttack.png' }
] }] }];

test('카탈로그는 고정 CDN 경로와 공개 요청 헤더만 사용한다', async () => {
	const paths: string[] = [];
	const client = createDataDragonClient(async (input, init) => {
		const url = new URL(String(input));
		paths.push(url.pathname);
		assert.equal(url.origin, 'https://ddragon.leagueoflegends.com');
		assert.equal(url.search, '');
		assert.equal(init?.method, 'GET');
		assert.equal(init?.redirect, 'error');
		assert.equal(init?.credentials, 'omit');
		assert.deepEqual([...new Headers(init?.headers)], [['accept', 'application/json']]);
		return Response.json(url.pathname.endsWith('versions.json') ? ['16.21.1'] : url.pathname.endsWith('runesReforged.json') ? runes : catalog);
	});
	await client.getVersions();
	for (const resource of ['champions', 'items', 'runes', 'summoner-spells', 'profile-icons']) await client.getCatalog('16.21.1', 'ko_KR', resource);
	assert.deepEqual(paths, ['/api/versions.json', '/cdn/16.21.1/data/ko_KR/champion.json', '/cdn/16.21.1/data/ko_KR/item.json',
		'/cdn/16.21.1/data/ko_KR/runesReforged.json', '/cdn/16.21.1/data/ko_KR/summoner.json', '/cdn/16.21.1/data/ko_KR/profileicon.json']);
});

const invalid: [string, string, string, string][] = [
	...['../..', 'https://evil.test', '16.21.1?key=x', '16.21.1/../../', '%2e%2e'].map((version): [string, string, string, string] => [`버전 ${version}`, version, 'ko_KR', 'champions']),
	...['../../api', 'ko_KR?x=1', 'en-us'].map((locale): [string, string, string, string] => [`언어 ${locale}`, '16.21.1', locale, 'champions']),
	...['constructor', '__proto__', 'champion.json', '../../versions'].map((resource): [string, string, string, string] => [`자원 ${resource}`, '16.21.1', 'ko_KR', resource])
];
for (const [name, version, locale, resource] of invalid) {
	test(`Data Dragon 입력 거절: ${name}`, () => {
		const client = createDataDragonClient(async () => { assert.fail('잘못된 입력은 요청하면 안 된다'); });
		assert.throws(() => client.getCatalog(version, locale, resource), riotError('INVALID_ARGUMENT'));
	});
}

test('캐시는 버전·언어를 분리하고 반환 객체의 변경은 캐시에 영향을 주지 않는다', async () => {
	let calls = 0;
	const client = createDataDragonClient(async (input) => { calls++; return Response.json(String(input).endsWith('versions.json') ? ['16.21.1'] : catalog); }, () => 1000);
	const versions = await client.getVersions();
	versions.push('poison');
	assert.deepEqual(await client.getVersions(), ['16.21.1']);
	const first = await client.getCatalog('16.21.1', 'ko_KR', 'champions');
	assert.ok(!Array.isArray(first));
	first.data.Aatrox!.name = 'poison';
	assert.deepEqual(await client.getCatalog('16.21.1', 'ko_KR', 'champions'), catalog);
	await client.getCatalog('16.21.1', 'en_US', 'champions');
	await client.getCatalog('16.20.1', 'ko_KR', 'champions');
	assert.equal(calls, 4);
});

for (const [name, ttl, metadata] of [['버전 목록', METADATA_TTL_SECONDS, true], ['카탈로그', CATALOG_TTL_SECONDS, false]] as const) {
	test(`${name} 캐시는 TTL 직전 유지·경계 만료한다`, async () => {
		let now = 0;
		let calls = 0;
		const client = createDataDragonClient(async () => { calls++; return Response.json(metadata ? ['16.21.1'] : catalog); }, () => now);
		const read = () => metadata ? client.getVersions() : client.getCatalog('16.21.1', 'ko_KR', 'champions');
		await read();
		now = ttl * 1000 - 1;
		await read();
		assert.equal(calls, 1);
		now++;
		await read();
		assert.equal(calls, 2);
	});
}

test('64개 캐시 한도를 넘으면 오래된 키를 제거한다', async () => {
	let calls = 0;
	const client = createDataDragonClient(async () => { calls++; return Response.json(catalog); });
	for (let patch = 0; patch < 65; patch++) await client.getCatalog(`16.${patch}.1`, 'ko_KR', 'champions');
	await client.getCatalog('16.64.1', 'ko_KR', 'champions');
	assert.equal(calls, 65);
	await client.getCatalog('16.0.1', 'ko_KR', 'champions');
	assert.equal(calls, 66);
});

test('동일 요청은 합치고 서로 다른 8개 요청의 슬롯은 완료 후 반환한다', async () => {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => { release = resolve; });
	let calls = 0;
	const client = createDataDragonClient(async () => { calls++; await gate; return Response.json(catalog); });
	const first = client.getCatalog('16.21.1', 'ko_KR', 'champions');
	const shared = client.getCatalog('16.21.1', 'ko_KR', 'champions');
	const others = Array.from({ length: 7 }, (_, index) => client.getCatalog(`16.${index}.1`, 'ko_KR', 'champions'));
	try {
		await assert.rejects(client.getCatalog('16.21.1', 'ko_KR', 'items'), riotError('BUSY'));
		assert.equal(calls, 8);
	} finally { release(); }
	const results = await Promise.all([first, shared, ...others]);
	assert.deepEqual(results[0], results[1]);
	assert.notEqual(results[0], results[1]);
	await client.getCatalog('16.21.1', 'ko_KR', 'items');
	assert.equal(calls, 9);
});

for (const [name, response, code] of [
	['404', () => new Response('private-body', { status: 404 }), 'NOT_FOUND'],
	['403', () => new Response('private-body', { status: 403 }), 'NOT_FOUND'],
	['500', () => new Response('private-body', { status: 500 }), 'UPSTREAM_ERROR'],
	['JSON 아님', () => new Response('private-body'), 'INVALID_RESPONSE'],
	['카탈로그 없음', () => Response.json({ unexpected: true }), 'INVALID_RESPONSE'],
	['동기 통신 실패', () => { throw new Error('private-network'); }, 'NETWORK_ERROR']
] as const) {
	test(`실패 응답은 캐시하지 않고 안전한 오류를 반환한다: ${name}`, async () => {
		let calls = 0;
		const client = createDataDragonClient(async () => ++calls === 1 ? response() : Response.json(catalog));
		await assert.rejects(client.getCatalog('16.21.1', 'ko_KR', 'champions'), (error: unknown) => {
			riotError(code)(error);
			assert.ok(error instanceof Error);
			assert.doesNotMatch(error.message, /private-/);
			return true;
		});
		assert.deepEqual(await client.getCatalog('16.21.1', 'ko_KR', 'champions'), catalog);
		assert.equal(calls, 2);
	});
}

test('본문이 멈춰도 제어된 timeout으로 중단하고 슬롯을 복구한다', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	let bodyStarted!: () => void;
	const started = new Promise<void>((resolve) => { bodyStarted = resolve; });
	let calls = 0;
	const client = createDataDragonClient(async (_input, init) => {
		if (++calls > 1) return Response.json(['16.21.1']);
		return new Response(new ReadableStream({ start(controller) {
			init!.signal!.addEventListener('abort', () => controller.error(new Error('aborted')), { once: true });
			bodyStarted();
		} }));
	}, () => 0, 1000);
	const outcome = assert.rejects(client.getVersions(), riotError('TIMEOUT'));
	await started;
	t.mock.timers.tick(1000);
	await outcome;
	assert.deepEqual(await client.getVersions(), ['16.21.1']);
});

test('fetch의 동기 예외도 pending 항목을 정리하여 다음 요청을 허용한다', async () => {
	let calls = 0;
	const fetcher: typeof fetch = () => { calls++; throw new Error('private-synchronous-failure'); };
	const client = createDataDragonClient(fetcher);
	await assert.rejects(client.getVersions(), riotError('NETWORK_ERROR'));
	await assert.rejects(client.getVersions(), riotError('NETWORK_ERROR'));
	assert.equal(calls, 2);
});

test('Data Dragon 응답 어댑터는 성공만 캐시하고 실패는 no-store이다', async () => {
	const success = await dataDragonResponse(async () => catalog, CATALOG_TTL_SECONDS);
	assert.equal(success.status, 200);
	assert.equal(success.headers.get('Cache-Control'), 'public, max-age=86400');
	assert.deepEqual(await success.json(), catalog);
	const failure = await dataDragonResponse(async () => { throw new RiotError('BUSY', '대기', { retryAfterSeconds: 1 }); }, CATALOG_TTL_SECONDS);
	assert.equal(failure.status, 503);
	assert.equal(failure.headers.get('Cache-Control'), 'no-store');
	assert.equal(failure.headers.get('Retry-After'), '1');
	const unexpected = new Error('unexpected');
	await assert.rejects(dataDragonResponse(async () => { throw unexpected; }, CATALOG_TTL_SECONDS), (error: unknown) => error === unexpected);
});

test('이미지 URL은 검증된 카탈로그 파일명과 룬 상대 경로로 만든다', () => {
	assert.equal(dataDragonImageUrl('16.21.1', 'profile-icon', '685.png'), 'https://ddragon.leagueoflegends.com/cdn/16.21.1/img/profileicon/685.png');
	assert.equal(dataDragonImageUrl('16.21.1', 'champion', 'Aatrox.png'), 'https://ddragon.leagueoflegends.com/cdn/16.21.1/img/champion/Aatrox.png');
	assert.equal(dataDragonRuneIconUrl(runes[0]!.icon), 'https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/7201_Precision.png');
	assert.throws(() => dataDragonRuneIconUrl('perk-images/../../secret.png'), riotError('INVALID_ARGUMENT'));
});

for (const filename of ['../Aatrox.png', 'https://evil.test/a.png', '%2e%2e.png', 'Aatrox.png?key=1']) {
	test(`이미지 경로 주입 거절: ${filename}`, () => assert.throws(() => dataDragonImageUrl('16.21.1', 'champion', filename), riotError('INVALID_ARGUMENT')));
}
