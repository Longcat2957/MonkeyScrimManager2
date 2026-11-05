import assert from 'node:assert/strict';
import test from 'node:test';
import { createHttpFixture } from '../../support/http.ts';

test('HTTP: Riot 계정·지역·LoL 프로필·빈 랭크를 실제 endpoint의 JSON 계약으로 반환한다', async (t) => {
    const f = await createHttpFixture(t);
    const cases = [
        [
            '/api/riot/account/v1/accounts/by-riot-id/HttpPlayer/KR1',
            { puuid: 'fixture-HttpPlayer', gameName: 'HttpPlayer', tagLine: 'KR1' }
        ],
        [
            '/api/riot/account/v1/accounts/by-puuid/fixture-HttpPlayer',
            { puuid: 'fixture-HttpPlayer', gameName: 'HttpPlayer', tagLine: 'KR1' }
        ],
        [
            '/api/riot/account/v1/region/by-game/lol/by-puuid/fixture-HttpPlayer',
            { puuid: 'fixture-HttpPlayer', game: 'lol', region: 'kr' }
        ],
        [
            '/api/lol/summoner/v4/summoners/by-puuid/fixture-HttpPlayer?platform=kr',
            { puuid: 'fixture-HttpPlayer', profileIconId: 1, revisionDate: 1, summonerLevel: 30 }
        ],
        ['/api/lol/league/v4/entries/by-puuid/fixture-HttpPlayer?platform=kr', []]
    ] as const;
    for (const [path, expected] of cases)
        await t.test(path, async () => {
            const response = await f.request(path);
            assert.equal(response.status, 200);
            assert.equal(response.headers.get('cache-control'), 'no-store');
            assert.deepEqual(await response.json(), expected);
        });
    const before = f.upstreamCalls.length;
    const invalid = await f.request('/api/lol/league/v4/entries/by-puuid/fixture-HttpPlayer?platform=asia');
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, 'INVALID_ARGUMENT');
    assert.equal(f.upstreamCalls.length, before);
});

test('HTTP: Riot 429는 재시도 헤더를 보존하고 원본 비밀 응답을 숨긴다', async (t) => {
    const f = await createHttpFixture(t, [
        {
            method: 'GET',
            url: 'https://kr.api.riotgames.com/lol/league/v4/entries/by-puuid/fixture-HttpPlayer',
            status: 429,
            raw: 'upstream-private-detail',
            headers: { 'retry-after': '7' }
        }
    ]);
    const response = await f.request('/api/lol/league/v4/entries/by-puuid/fixture-HttpPlayer');
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '7');
    const body = await response.text();
    assert.match(body, /RATE_LIMITED/);
    assert.doesNotMatch(body, /upstream-private-detail|fixture-riot-key/);
});

test('HTTP: 잘못된 LoL 응답은 502로 바꾸고 Data Dragon만 공개 캐시를 허용한다', async (t) => {
    const f = await createHttpFixture(t, [
        {
            method: 'GET',
            url: 'https://kr.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/fixture-HttpPlayer',
            body: { puuid: 'fixture-HttpPlayer' }
        }
    ]);
    const invalid = await f.request('/api/lol/summoner/v4/summoners/by-puuid/fixture-HttpPlayer');
    assert.equal(invalid.status, 502);
    assert.equal((await invalid.json()).error.code, 'INVALID_RESPONSE');
    const versions = await f.request('/api/ddragon/versions');
    assert.equal(versions.status, 200);
    assert.equal(versions.headers.get('cache-control'), 'public, max-age=300');
    assert.deepEqual(await versions.json(), ['26.21.1']);
    const catalog = await f.request('/api/ddragon/26.21.1/ko_KR/champions');
    assert.equal(catalog.status, 200);
    assert.equal(catalog.headers.get('cache-control'), 'public, max-age=86400');
    assert.deepEqual(await catalog.json(), { version: '26.21.1', data: {} });
});
