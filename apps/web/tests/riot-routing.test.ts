import assert from 'node:assert/strict';
import test from 'node:test';
import { createRiotRequest, type PlatformRouting, type RiotRequestOptions } from '../src/lib/server/riot/transport.ts';
import { pathSegment } from '../src/lib/server/riot/validation.ts';

test('account and participant queries choose independent hosts without forwarding routing parameters', async () => {
	const observed: URL[] = [];
	const request = createRiotRequest(() => ({ apiKey: 'test-key', platform: 'na1' }), async (input) => {
		observed.push(new URL(String(input)));
		return Response.json({});
	});
	await request('/riot/account/v1/accounts/by-puuid/id');
	await request('/lol/summoner/v4/summoners/by-puuid/id');
	await request('/lol/league/v4/entries/by-puuid/id', { platform: 'kr' });
	assert.deepEqual(observed.map((url) => url.host), ['asia.api.riotgames.com', 'na1.api.riotgames.com', 'kr.api.riotgames.com']);
	assert.ok(observed.every((url) => url.search === ''));
});

test('unsupported APIs, mismatched routing and unsafe paths fail before contacting upstream', async () => {
	let calls = 0;
	const request = createRiotRequest(() => ({ apiKey: 'test-key' }), async () => {
		calls += 1;
		return Response.json({});
	});
	const cases: Array<[string, RiotRequestOptions]> = [
		['/riot/account/v1/accounts/by-puuid/id', { platform: 'kr' }],
		['/lol/summoner/v4/summoners/by-puuid/id', { region: 'asia' }],
		['/lol/summoner/v4/summoners/by-puuid/id', { platform: 'pbe1' as PlatformRouting }],
		['/lol/summoner/v4/../../league/v4/entries/by-puuid/id', {}],
		['/lol/league/v4/entries/by-puuid/id?api_key=secret', {}],
		['/lol/match/v5/matches/KR_1', {}],
		['/lol/clash/v1/tournaments', {}],
		['/lol/challenges/v1/challenges/config', {}],
		['/lol/league-exp/v4/entries/RANKED_SOLO_5x5/GOLD/I', {}]
	];
	for (const [path, options] of cases) {
		await assert.rejects(request(path, options), { code: 'INVALID_ARGUMENT' });
	}
	assert.equal(calls, 0);
});

test('a rate limit pauses profiles and ranks sharing a host while account lookup remains available', async () => {
	let calls = 0;
	const request = createRiotRequest(() => ({ apiKey: 'test-key' }), async () => {
		calls += 1;
		return calls === 1 ? new Response(null, { status: 429, headers: { 'Retry-After': '10' } }) : Response.json({});
	});
	await assert.rejects(request('/lol/league/v4/entries/by-puuid/id'), { code: 'RATE_LIMITED' });
	await assert.rejects(request('/lol/summoner/v4/summoners/by-puuid/id'), { code: 'RATE_LIMITED' });
	assert.equal(calls, 1);
	await request('/riot/account/v1/accounts/by-puuid/id');
	assert.equal(calls, 2);
});

test('path parameters encode names and reject empty values, traversal and control characters', () => {
	assert.equal(pathSegment('한글 /?#', 'name'), encodeURIComponent('한글 /?#'));
	for (const value of ['', ' ', '..', '.', 'a\u0000b', '\ud800']) {
		assert.throws(() => pathSegment(value, 'name'), { code: 'INVALID_ARGUMENT' });
	}
});
