import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test, { after, beforeEach } from 'node:test';

// Resolve only SvelteKit's private environment module, without opening a real .env file.
const envModule = 'data:text/javascript,' + encodeURIComponent(`
	export const RIOT_API_KEY = 'test-key';
	export const RIOT_ACCOUNT_REGION = 'asia';
	export const RIOT_PLATFORM = 'kr';
	export const RIOT_API_TIMEOUT_MS = '10000';
`);
const hooks = registerHooks({
	resolve(specifier, context, nextResolve) {
		return specifier === '$app/env/private'
			? { url: envModule, shortCircuit: true }
			: nextResolve(specifier, context);
	}
});

const originalFetch = globalThis.fetch;
let reply: () => Response = () => { throw new Error('Unexpected upstream request'); };
const requests: Array<{ url: URL; init?: RequestInit }> = [];
globalThis.fetch = async (input, init) => {
	requests.push({ url: new URL(String(input)), init });
	return reply();
};

const summoner = await import('../src/lib/server/riot/lol/summoner.ts');
const league = await import('../src/lib/server/riot/lol/league.ts');
const summonerRoute = await import('../src/routes/api/lol/summoner/v4/summoners/by-puuid/[puuid]/+server.ts');
const leagueRoute = await import('../src/routes/api/lol/league/v4/entries/by-puuid/[puuid]/+server.ts');

beforeEach(() => {
	requests.length = 0;
	reply = () => { throw new Error('Unexpected upstream request'); };
});
after(() => {
	globalThis.fetch = originalFetch;
	hooks.deregister();
});

const summonerProfile = { puuid: 'player-puuid', profileIconId: 1, revisionDate: 1700000000000, summonerLevel: 100 };
const leagueEntry = { puuid: 'player-puuid', queueType: 'RANKED_SOLO_5x5', tier: 'DIAMOND', rank: 'I', leaguePoints: 250, wins: 15, losses: 4 };

test('summoner uses a platform host, PUUID and a header-only key while retaining new fields', async () => {
	const data = { ...summonerProfile, futureField: true };
	reply = () => Response.json(data);
	assert.deepEqual(await summoner.getSummonerByPuuid('player-puuid', 'jp1'), data);
	assert.equal(requests[0].url.href, 'https://jp1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/player-puuid');
	assert.equal(new Headers(requests[0].init?.headers).get('X-Riot-Token'), 'test-key');
	assert.equal(requests[0].init?.redirect, 'error');
});

test('personal ranks allow an omitted legacy leagueId, preserve extra fields and return empty unranked results', async () => {
	const entry = { ...leagueEntry, hotStreak: false };
	for (const data of [[entry], [{ ...entry, leagueId: 'legacy-id' }], []]) {
		reply = () => Response.json(data);
		assert.deepEqual(await league.getLeagueEntriesByPuuid('player-puuid'), data);
	}
	assert.equal(requests[0].url.pathname, '/lol/league/v4/entries/by-puuid/player-puuid');
	assert.equal(requests[0].url.host, 'kr.api.riotgames.com');
});

test('invalid PUUID path values are rejected before upstream calls', async () => {
	for (const puuid of ['  ', '..', '.', 'a\u0000b', '\ud800']) {
		await assert.rejects(summoner.getSummonerByPuuid(puuid), { code: 'INVALID_ARGUMENT' });
		await assert.rejects(league.getLeagueEntriesByPuuid(puuid), { code: 'INVALID_ARGUMENT' });
	}
	assert.equal(requests.length, 0);
});

test('malformed profiles and rank fields fail as invalid upstream data', async () => {
	for (const data of [null, { ...summonerProfile, profileIconId: '1' }, { ...summonerProfile, puuid: '' }]) {
		reply = () => Response.json(data);
		await assert.rejects(summoner.getSummonerByPuuid('player-puuid'), { code: 'INVALID_RESPONSE', status: 502 });
	}
	for (const data of [
		{},
		[{ ...leagueEntry, wins: '15' }],
		[{ ...leagueEntry, tier: null }],
		...[null, 123, {}].map((leagueId) => [{ ...leagueEntry, leagueId }])
	]) {
		reply = () => Response.json(data);
		await assert.rejects(league.getLeagueEntriesByPuuid('player-puuid'), { code: 'INVALID_RESPONSE', status: 502 });
	}
});

test('summoner HTTP route validates platform and returns uncached profile JSON', async () => {
	const event = (platform: string) => ({
		params: { puuid: 'player-puuid' },
		url: new URL(`https://monkeybot.test/api/lol/summoner/v4/summoners/by-puuid/player-puuid?platform=${platform}`)
	}) as Parameters<typeof summonerRoute.GET>[0];
	for (const platform of ['', 'asia', 'example.com']) {
		const response = await summonerRoute.GET(event(platform));
		assert.equal(response.status, 400);
		assert.equal((await response.json()).error.code, 'INVALID_ARGUMENT');
	}
	assert.equal(requests.length, 0);
	reply = () => Response.json(summonerProfile);
	const response = await summonerRoute.GET(event('na1'));
	assert.equal(response.status, 200);
	assert.equal(response.headers.get('Cache-Control'), 'no-store');
	assert.deepEqual(await response.json(), summonerProfile);
	assert.equal(requests[0].url.host, 'na1.api.riotgames.com');
});

test('personal rank HTTP route preserves unranked results and handles upstream errors safely', async () => {
	const event = {
		params: { puuid: 'player-puuid' },
		url: new URL('https://monkeybot.test/api/lol/league/v4/entries/by-puuid/player-puuid')
	} as Parameters<typeof leagueRoute.GET>[0];
	reply = () => Response.json([]);
	const unranked = await leagueRoute.GET(event);
	assert.equal(unranked.status, 200);
	assert.deepEqual(await unranked.json(), []);
	reply = () => new Response('private upstream detail', { status: 404 });
	const missing = await leagueRoute.GET(event);
	assert.equal(missing.status, 404);
	assert.equal(missing.headers.get('Cache-Control'), 'no-store');
	const body = await missing.json();
	assert.equal(body.error.code, 'NOT_FOUND');
	assert.doesNotMatch(body.error.message, /private upstream detail|test-key/);
});
