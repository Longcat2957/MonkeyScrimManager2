import assert from 'node:assert/strict';
import test from 'node:test';
import { createRiotRequest, type AccountRouting } from '../src/lib/server/riot/transport.ts';
import { RiotError, type RiotErrorCode } from '../src/lib/server/riot/errors.ts';
import { riotResponse } from '../src/lib/server/riot/http.ts';

const accountPath = '/riot/account/v1/accounts/by-puuid/example-puuid';
const regionPath = '/riot/account/v1/region/by-game/lol/by-puuid/example-puuid';

function riotError(code: RiotErrorCode, status?: number) {
	return (error: unknown) => {
		assert.ok(error instanceof RiotError);
		assert.equal(error.code, code);
		if (status !== undefined) assert.equal(error.status, status);
		return true;
	};
}

test('requests use the selected Riot host and a header-only key, without following redirects', async () => {
	let calls = 0;
	const fetcher: typeof fetch = async (input, init) => {
		calls += 1;
		const url = new URL(String(input));
		assert.equal(url.origin, 'https://europe.api.riotgames.com');
		assert.equal(url.pathname, accountPath);
		assert.equal(url.search, '');
		assert.equal(init?.method, 'GET');
		assert.equal(init?.redirect, 'error');
		const headers = new Headers(init?.headers);
		assert.equal(headers.get('X-Riot-Token'), 'test-key');
		assert.equal(headers.get('Accept'), 'application/json');
		assert.ok(init?.signal instanceof AbortSignal);
		return Response.json({ puuid: 'example-puuid' });
	};
	const request = createRiotRequest(() => ({ apiKey: ' test-key ' }), fetcher);
	assert.deepEqual(await request(accountPath, { region: 'europe' }), { puuid: 'example-puuid' });
	assert.equal(calls, 1);
});

test('missing keys and invalid configuration are rejected before making a network request', async () => {
	let calls = 0;
	const fetcher: typeof fetch = async () => {
		calls += 1;
		return Response.json({});
	};
	await assert.rejects(createRiotRequest(() => ({}), fetcher)(accountPath), riotError('NOT_CONFIGURED', 503));
	for (const config of [
		{ apiKey: 'test-key', accountRegion: 'sea' },
		{ apiKey: 'test-key', timeoutMs: '0' },
		{ apiKey: 'test-key', timeoutMs: '60001' },
		{ apiKey: 'test-key', timeoutMs: 'not-a-number' },
		{ apiKey: 'test\nkey' }
	]) {
		await assert.rejects(createRiotRequest(() => config, fetcher)(accountPath), riotError('INVALID_CONFIGURATION', 503));
	}
	assert.equal(calls, 0);
});

test('untrusted hosts, normalized paths outside Account API, and invalid caller regions are rejected', async () => {
	let calls = 0;
	const fetcher: typeof fetch = async () => {
		calls += 1;
		return Response.json({});
	};
	const request = createRiotRequest(() => ({ apiKey: 'test-key' }), fetcher);
	for (const path of [
		'https://example.com/riot/account/v1/accounts/me',
		'//example.com/riot/account/v1/accounts/me',
		'/riot/account/v1/../../outside',
		'/riot/account/v1/%2e%2e/%2e%2e/outside',
		`${accountPath}?api_key=secret`,
		`${accountPath}#fragment`
	]) {
		await assert.rejects(request(path), riotError('INVALID_ARGUMENT', 400));
	}
	await assert.rejects(request(accountPath, { region: 'sea' as AccountRouting }), riotError('INVALID_ARGUMENT', 400));
	assert.equal(calls, 0);
});

test('non-JSON upstream errors retain their meaning without exposing upstream response bodies', async () => {
	for (const [upstreamStatus, code, status] of [
		[404, 'NOT_FOUND', 404],
		[403, 'UPSTREAM_AUTH_ERROR', 503],
		[401, 'UPSTREAM_AUTH_ERROR', 503],
		[500, 'UPSTREAM_ERROR', 502]
	] as const) {
		const fetcher: typeof fetch = async () => new Response('<html>private-upstream-detail</html>', { status: upstreamStatus });
		const request = createRiotRequest(() => ({ apiKey: 'test-key' }), fetcher);
		await assert.rejects(request(accountPath), (error: unknown) => {
			riotError(code, status)(error);
			assert.ok(error instanceof RiotError);
			assert.equal(error.upstreamStatus, upstreamStatus);
			assert.doesNotMatch(error.message, /private-upstream-detail|test-key/);
			return true;
		});
	}
});

test('invalid JSON success and fetch failures produce distinct safe errors', async () => {
	const invalidJson: typeof fetch = async () => new Response('<html>not JSON</html>');
	const networkFailure: typeof fetch = async () => { throw new Error('connection failed with test-key'); };
	await assert.rejects(createRiotRequest(() => ({ apiKey: 'test-key' }), invalidJson)(accountPath), riotError('INVALID_RESPONSE', 502));
	await assert.rejects(createRiotRequest(() => ({ apiKey: 'test-key' }), networkFailure)(accountPath), (error: unknown) => {
		riotError('NETWORK_ERROR', 502)(error);
		assert.ok(error instanceof RiotError);
		assert.doesNotMatch(error.message, /test-key/);
		return true;
	});
});

test('429 pauses other Account endpoints on the same host, while allowing other regions and later recovery', async () => {
	let clock = 1000;
	let calls = 0;
	const fetcher: typeof fetch = async () => {
		calls += 1;
		return calls === 1
			? new Response(null, { status: 429, headers: { 'Retry-After': '3' } })
			: Response.json({ ok: true });
	};
	const request = createRiotRequest(() => ({ apiKey: 'test-key' }), fetcher, () => clock);
	await assert.rejects(request(accountPath), (error: unknown) => {
		riotError('RATE_LIMITED', 429)(error);
		assert.ok(error instanceof RiotError);
		assert.equal(error.retryAfterSeconds, 3);
		return true;
	});
	clock += 1500;
	await assert.rejects(request(regionPath), (error: unknown) => {
		riotError('RATE_LIMITED')(error);
		assert.ok(error instanceof RiotError);
		assert.equal(error.retryAfterSeconds, 2);
		return true;
	});
	assert.equal(calls, 1);
	assert.deepEqual(await request(accountPath, { region: 'europe' }), { ok: true });
	clock += 1500;
	assert.deepEqual(await request(regionPath), { ok: true });
	assert.equal(calls, 3);
});

test('429 without a usable Retry-After applies a conservative 60 second pause', async () => {
	let calls = 0;
	const fetcher: typeof fetch = async () => {
		calls += 1;
		return new Response(null, { status: 429 });
	};
	const request = createRiotRequest(() => ({ apiKey: 'test-key' }), fetcher, () => 1000);
	for (const path of [accountPath, regionPath]) {
		await assert.rejects(request(path), (error: unknown) => {
			riotError('RATE_LIMITED')(error);
			assert.ok(error instanceof RiotError);
			assert.equal(error.retryAfterSeconds, 60);
			return true;
		});
	}
	assert.equal(calls, 1);
});

test('timeouts abort fetch and release all occupied request slots', async () => {
	let hanging = true;
	let aborts = 0;
	const fetcher: typeof fetch = async (_input, init) => {
		if (!hanging) return Response.json({ recovered: true });
		return new Promise<Response>((_resolve, reject) => {
			init?.signal?.addEventListener('abort', () => {
				aborts += 1;
				reject(new DOMException('aborted', 'AbortError'));
			}, { once: true });
		});
	};
	const request = createRiotRequest(() => ({ apiKey: 'test-key', timeoutMs: '10' }), fetcher);
	await Promise.all(Array.from({ length: 8 }, () => assert.rejects(request(accountPath), riotError('TIMEOUT', 504))));
	assert.equal(aborts, 8);
	hanging = false;
	assert.deepEqual(await request(accountPath), { recovered: true });
});

test('only eight upstream requests can run at once and completed requests free their slots', async () => {
	const releases: Array<() => void> = [];
	const fetcher: typeof fetch = async () => new Promise<Response>((resolve) => {
		releases.push(() => resolve(Response.json({ ok: true })));
	});
	const request = createRiotRequest(() => ({ apiKey: 'test-key' }), fetcher);
	const pending = Array.from({ length: 8 }, () => request(accountPath));
	await assert.rejects(request(regionPath), riotError('BUSY', 503));
	assert.equal(releases.length, 8);
	for (const release of releases) release();
	await Promise.all(pending);
	const next = request(regionPath);
	assert.equal(releases.length, 9);
	releases[8]();
	assert.deepEqual(await next, { ok: true });
});

test('HTTP responses disable caching, expose retry timing, and avoid treating Riot credentials as user login errors', async () => {
	const success = await riotResponse(async () => ({ puuid: 'example-puuid' }));
	assert.equal(success.status, 200);
	assert.equal(success.headers.get('Cache-Control'), 'no-store');
	assert.deepEqual(await success.json(), { puuid: 'example-puuid' });
	const limited = await riotResponse(async () => {
		throw new RiotError('RATE_LIMITED', 'Try later.', { upstreamStatus: 429, retryAfterSeconds: 9 });
	});
	assert.equal(limited.status, 429);
	assert.equal(limited.headers.get('Cache-Control'), 'no-store');
	assert.equal(limited.headers.get('Retry-After'), '9');
	assert.deepEqual(await limited.json(), { error: { code: 'RATE_LIMITED', message: 'Try later.' } });
	const badKey = await riotResponse(async () => {
		throw new RiotError('UPSTREAM_AUTH_ERROR', 'Riot API authentication failed.', { upstreamStatus: 403 });
	});
	assert.equal(badKey.status, 503);
	const unexpected = new Error('Unexpected application bug');
	await assert.rejects(riotResponse(async () => { throw unexpected; }), (error) => error === unexpected);
});
