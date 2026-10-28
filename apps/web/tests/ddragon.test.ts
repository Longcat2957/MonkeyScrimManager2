import assert from 'node:assert/strict';
import test from 'node:test';
import { createDataDragonClient, CATALOG_TTL_SECONDS, METADATA_TTL_SECONDS } from '../src/lib/server/ddragon/client.ts';
import { dataDragonImageUrl, dataDragonRuneIconUrl } from '../src/lib/server/ddragon/assets.ts';
import { dataDragonResponse } from '../src/lib/server/ddragon/http.ts';
import { RiotError, type RiotErrorCode } from '../src/lib/server/riot/errors.ts';

const catalog = { type: 'champion', version: '16.21.1', data: { Aatrox: { id: 'Aatrox', key: '266', name: '아트록스' } } };
const runes = [{ id: 8000, key: 'Precision', name: '정밀', icon: 'perk-images/Styles/7201_Precision.png', slots: [{ runes: [
	{ id: 8005, key: 'PressTheAttack', name: '집중 공격', icon: 'perk-images/Styles/Precision/PressTheAttack/PressTheAttack.png' }
] }] }];

function errorCode(code: RiotErrorCode) {
	return (error: unknown) => error instanceof RiotError && error.code === code;
}

test('Data Dragon uses fixed public CDN paths without credentials, keys or redirects', async () => {
	const paths: string[] = [];
	const fetcher: typeof fetch = async (input, init) => {
		const url = new URL(String(input));
		paths.push(url.pathname);
		assert.equal(url.origin, 'https://ddragon.leagueoflegends.com');
		assert.equal(url.search, '');
		assert.equal(init?.method, 'GET');
		assert.equal(init?.redirect, 'error');
		assert.equal(init?.credentials, 'omit');
		assert.deepEqual([...new Headers(init?.headers)], [['accept', 'application/json']]);
		if (url.pathname.endsWith('versions.json')) return Response.json(['16.21.1']);
		if (url.pathname.endsWith('runesReforged.json')) return Response.json(runes);
		return Response.json(catalog);
	};
	const client = createDataDragonClient(fetcher);
	await client.getVersions();
	for (const resource of ['champions', 'items', 'runes', 'summoner-spells', 'profile-icons']) {
		await client.getCatalog('16.21.1', 'ko_KR', resource);
	}
	assert.deepEqual(paths, [
		'/api/versions.json',
		'/cdn/16.21.1/data/ko_KR/champion.json', '/cdn/16.21.1/data/ko_KR/item.json',
		'/cdn/16.21.1/data/ko_KR/runesReforged.json', '/cdn/16.21.1/data/ko_KR/summoner.json',
		'/cdn/16.21.1/data/ko_KR/profileicon.json'
	]);
});

test('untrusted versions, locales and resources fail before any request', () => {
	let calls = 0;
	const client = createDataDragonClient(async () => { calls += 1; return Response.json(catalog); });
	for (const version of ['../..', 'https://example.com', '16.21.1?key=x', '16.21.1/../../', '%2e%2e']) {
		assert.throws(() => client.getCatalog(version, 'ko_KR', 'champions'), errorCode('INVALID_ARGUMENT'));
	}
	for (const locale of ['../../api', 'ko_KR?x=1', 'en-us']) {
		assert.throws(() => client.getCatalog('16.21.1', locale, 'champions'), errorCode('INVALID_ARGUMENT'));
	}
	for (const resource of ['constructor', '__proto__', 'champion.json', '../../versions']) {
		assert.throws(() => client.getCatalog('16.21.1', 'ko_KR', resource), errorCode('INVALID_ARGUMENT'));
	}
	assert.equal(calls, 0);
});

test('cache keys include version and locale; metadata expires sooner and returned objects cannot poison cache', async () => {
	let now = 0;
	let calls = 0;
	const client = createDataDragonClient(async (input) => {
		calls += 1;
		return Response.json(String(input).endsWith('versions.json') ? ['16.21.1'] : catalog);
	}, () => now);
	const versions = await client.getVersions();
	versions.push('invalid');
	assert.deepEqual(await client.getVersions(), ['16.21.1']);
	await client.getCatalog('16.21.1', 'ko_KR', 'champions');
	await client.getCatalog('16.21.1', 'en_US', 'champions');
	await client.getCatalog('16.20.1', 'ko_KR', 'champions');
	assert.equal(calls, 4);
	now = METADATA_TTL_SECONDS * 1000;
	await client.getVersions();
	await client.getCatalog('16.21.1', 'ko_KR', 'champions');
	assert.equal(calls, 5);
	now = CATALOG_TTL_SECONDS * 1000;
	await client.getCatalog('16.21.1', 'ko_KR', 'champions');
	assert.equal(calls, 6);
});

test('cache evicts old entries rather than growing with arbitrary versions', async () => {
	let calls = 0;
	const client = createDataDragonClient(async () => { calls += 1; return Response.json(catalog); });
	for (let patch = 0; patch < 65; patch += 1) await client.getCatalog(`16.${patch}.1`, 'ko_KR', 'champions');
	await client.getCatalog('16.64.1', 'ko_KR', 'champions');
	assert.equal(calls, 65);
	await client.getCatalog('16.0.1', 'ko_KR', 'champions');
	assert.equal(calls, 66);
});

test('parallel identical requests share a download while distinct requests are bounded', async () => {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => { release = resolve; });
	let calls = 0;
	const client = createDataDragonClient(async () => { calls += 1; await gate; return Response.json(catalog); });
	const first = client.getCatalog('16.21.1', 'ko_KR', 'champions');
	const shared = client.getCatalog('16.21.1', 'ko_KR', 'champions');
	const others = Array.from({ length: 7 }, (_, index) => client.getCatalog(`16.${index}.1`, 'ko_KR', 'champions'));
	await assert.rejects(client.getCatalog('16.21.1', 'ko_KR', 'items'), errorCode('BUSY'));
	assert.equal(calls, 8);
	release();
	await Promise.all([first, shared, ...others]);
	await client.getCatalog('16.21.1', 'ko_KR', 'items');
	assert.equal(calls, 9);
});

test('upstream errors and invalid responses are safe and are not cached', async () => {
	for (const [makeResponse, code] of [
		[() => new Response('upstream detail', { status: 404 }), 'NOT_FOUND'],
		[() => new Response('upstream detail', { status: 403 }), 'NOT_FOUND'],
		[() => new Response('upstream detail', { status: 500 }), 'UPSTREAM_ERROR'],
		[() => new Response('upstream detail'), 'INVALID_RESPONSE'],
		[() => Response.json({ unexpected: true }), 'INVALID_RESPONSE']
	] as const) {
		let calls = 0;
		const client = createDataDragonClient(async () => { calls += 1; return calls === 1 ? makeResponse() : Response.json(catalog); });
		await assert.rejects(client.getCatalog('16.21.1', 'ko_KR', 'champions'), (error: unknown) => {
			assert.ok(error instanceof RiotError);
			assert.equal(error.code, code);
			assert.doesNotMatch(error.message, /upstream detail/);
			return true;
		});
		assert.deepEqual(await client.getCatalog('16.21.1', 'ko_KR', 'champions'), catalog);
		assert.equal(calls, 2);
	}
});

test('synchronous network failures release pending entries and do not leak their messages', async () => {
	let calls = 0;
	const fetcher = (() => { calls += 1; throw new Error('internal-network-info'); }) as typeof fetch;
	const client = createDataDragonClient(fetcher);
	for (let attempt = 0; attempt < 2; attempt += 1) {
		await assert.rejects(client.getVersions(), (error: unknown) => {
			assert.ok(error instanceof RiotError);
			assert.equal(error.code, 'NETWORK_ERROR');
			assert.doesNotMatch(error.message, /internal-network-info/);
			return true;
		});
	}
	assert.equal(calls, 2);
});

test('timeout covers a stalled response body and releases the request slot', async () => {
	let calls = 0;
	const client = createDataDragonClient(async (_input, init) => {
		calls += 1;
		if (calls > 1) return Response.json(['16.21.1']);
		return new Response(new ReadableStream({ start(controller) {
			init?.signal?.addEventListener('abort', () => controller.error(new Error('aborted')), { once: true });
		} }));
	}, Date.now, 10);
	await assert.rejects(client.getVersions(), errorCode('TIMEOUT'));
	assert.deepEqual(await client.getVersions(), ['16.21.1']);
});

test('HTTP caches successes only, leaving errors no-store with retry metadata', async () => {
	const success = await dataDragonResponse(async () => catalog, CATALOG_TTL_SECONDS);
	assert.equal(success.headers.get('Cache-Control'), 'public, max-age=86400');
	assert.deepEqual(await success.json(), catalog);
	const failure = await dataDragonResponse(async () => { throw new RiotError('BUSY', '잠시 후 다시 시도해 주세요.', { retryAfterSeconds: 1 }); }, CATALOG_TTL_SECONDS);
	assert.equal(failure.status, 503);
	assert.equal(failure.headers.get('Cache-Control'), 'no-store');
	assert.equal(failure.headers.get('Retry-After'), '1');
});

test('asset helpers use catalog filenames and reject path and origin injection', () => {
	assert.equal(dataDragonImageUrl('16.21.1', 'profile-icon', '685.png'), 'https://ddragon.leagueoflegends.com/cdn/16.21.1/img/profileicon/685.png');
	assert.equal(dataDragonImageUrl('16.21.1', 'champion', 'Aatrox.png'), 'https://ddragon.leagueoflegends.com/cdn/16.21.1/img/champion/Aatrox.png');
	assert.equal(dataDragonRuneIconUrl(runes[0].icon), 'https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/7201_Precision.png');
	for (const filename of ['../Aatrox.png', 'https://example.com/a.png', '%2e%2e.png', 'Aatrox.png?key=1']) {
		assert.throws(() => dataDragonImageUrl('16.21.1', 'champion', filename), errorCode('INVALID_ARGUMENT'));
	}
	assert.throws(() => dataDragonRuneIconUrl('perk-images/../../secret.png'), errorCode('INVALID_ARGUMENT'));
});
