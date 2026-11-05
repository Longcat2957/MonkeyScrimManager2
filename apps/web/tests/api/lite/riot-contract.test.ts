import assert from 'node:assert/strict';
import test from 'node:test';
import { createRiotRequest, type RiotRequestOptions } from '../../../src/lib/server/riot/transport.ts';
import { pathSegment } from '../../../src/lib/server/riot/validation.ts';
import { RiotError } from '../../../src/lib/server/riot/errors.ts';
import { riotResponse } from '../../../src/lib/server/riot/http.ts';
import { riotError } from '../support/error-assertions.ts';

const account = '/riot/account/v1/accounts/by-puuid/example-puuid';
const region = '/riot/account/v1/region/by-game/lol/by-puuid/example-puuid';
const profile = '/lol/summoner/v4/summoners/by-puuid/example-puuid';
const rank = '/lol/league/v4/entries/by-puuid/example-puuid';

test('호스트 선택과 자격 증명 전달은 요청 계열별 계약을 따른다', async () => {
    const urls: URL[] = [];
    const request = createRiotRequest(
        () => ({ apiKey: ' test-key ', platform: 'na1' }),
        async (input, init) => {
            urls.push(new URL(String(input)));
            assert.equal(init?.method, 'GET');
            assert.equal(init?.redirect, 'error');
            assert.deepEqual(
                [...new Headers(init?.headers)],
                [
                    ['accept', 'application/json'],
                    ['x-riot-token', 'test-key']
                ]
            );
            assert.ok(init?.signal instanceof AbortSignal);
            return Response.json({ ok: true });
        }
    );
    assert.deepEqual(await request(account), { ok: true });
    await request(account, { region: 'europe' });
    await request(profile);
    await request(rank, { platform: 'kr' });
    assert.deepEqual(
        urls.map((url) => url.host),
        [
            'asia.api.riotgames.com',
            'europe.api.riotgames.com',
            'na1.api.riotgames.com',
            'kr.api.riotgames.com'
        ]
    );
    assert.ok(urls.every((url) => !url.search && !url.hash && !url.href.includes('test-key')));
});

for (const [name, config, code] of [
    ['키 누락', {}, 'NOT_CONFIGURED'],
    ['잘못된 ACCOUNT 지역', { apiKey: 'test-key', accountRegion: 'sea' }, 'INVALID_CONFIGURATION'],
    ['0ms 제한', { apiKey: 'test-key', timeoutMs: '0' }, 'INVALID_CONFIGURATION'],
    ['제한 초과', { apiKey: 'test-key', timeoutMs: '60001' }, 'INVALID_CONFIGURATION'],
    ['숫자가 아닌 제한', { apiKey: 'test-key', timeoutMs: 'oops' }, 'INVALID_CONFIGURATION'],
    ['개행 키', { apiKey: 'test\nkey' }, 'INVALID_CONFIGURATION']
] as const) {
    test(`Riot 설정은 호출 전에 거절한다: ${name}`, async () => {
        const request = createRiotRequest(
            () => config,
            async () => {
                assert.fail('외부 호출에 도달하면 안 된다');
            }
        );
        await assert.rejects(request(account), riotError(code, 503));
    });
}

const paths: [string, string, RiotRequestOptions][] = [
    ['외부 URL', 'https://evil.test/riot/account/v1/accounts/me', {}],
    ['외부 상대 URL', '//evil.test/riot/account/v1/accounts/me', {}],
    ['상위 경로', '/riot/account/v1/../../outside', {}],
    ['인코딩 상위 경로', '/riot/account/v1/%2e%2e/%2e%2e/outside', {}],
    ['쿼리', `${account}?api_key=secret`, {}],
    ['fragment', `${account}#fragment`, {}],
    ['ACCOUNT의 platform', account, { platform: 'kr' }],
    ['LoL의 region', profile, { region: 'asia' }],
    ['미지원 플랫폼', profile, { platform: 'pbe1' as 'kr' }],
    ['미지원 지역', account, { region: 'sea' as 'asia' }],
    ['Match API', '/lol/match/v5/matches/KR_1', {}],
    ['Clash API', '/lol/clash/v1/tournaments', {}],
    ['Challenges API', '/lol/challenges/v1/challenges/config', {}],
    ['League-exp API', '/lol/league-exp/v4/entries/RANKED_SOLO_5x5/GOLD/I', {}]
];
for (const [name, path, options] of paths) {
    test(`Riot 요청 경계: ${name}`, async () => {
        const request = createRiotRequest(
            () => ({ apiKey: 'test-key' }),
            async () => {
                assert.fail('거절한 요청은 전송하면 안 된다');
            }
        );
        await assert.rejects(request(path, options), riotError('INVALID_ARGUMENT', 400));
    });
}

for (const value of ['', ' ', '..', '.', 'a\u0000b', '\ud800']) {
    test(`경로 인자 검증: ${JSON.stringify(value)}`, () =>
        assert.throws(() => pathSegment(value, 'name'), riotError('INVALID_ARGUMENT')));
}
test('이름의 예약 문자는 경로 한 조각으로 인코딩한다', () =>
    assert.equal(pathSegment('한글 /?#', 'name'), encodeURIComponent('한글 /?#')));

for (const [upstream, code, status] of [
    [400, 'INVALID_ARGUMENT', 400],
    [404, 'NOT_FOUND', 404],
    [401, 'UPSTREAM_AUTH_ERROR', 503],
    [403, 'UPSTREAM_AUTH_ERROR', 503],
    [500, 'UPSTREAM_ERROR', 502]
] as const) {
    test(`Riot ${upstream} 응답은 공개 오류로 변환한다`, async () => {
        const request = createRiotRequest(
            () => ({ apiKey: 'test-key' }),
            async () => new Response('private-upstream-body', { status: upstream })
        );
        await assert.rejects(request(account), (error: unknown) => {
            riotError(code, status)(error);
            assert.ok(error instanceof RiotError);
            assert.equal(error.upstreamStatus, upstream);
            assert.doesNotMatch(error.message, /private-upstream-body|test-key/);
            return true;
        });
    });
}

test('JSON 해석 실패와 통신 실패를 구분하고 원본 오류는 노출하지 않는다', async () => {
    await assert.rejects(
        createRiotRequest(
            () => ({ apiKey: 'test-key' }),
            async () => new Response('not json')
        )(account),
        riotError('INVALID_RESPONSE', 502)
    );
    await assert.rejects(
        createRiotRequest(
            () => ({ apiKey: 'test-key' }),
            async () => {
                throw new Error('private-network-key');
            }
        )(account),
        (error: unknown) => {
            riotError('NETWORK_ERROR', 502)(error);
            assert.ok(error instanceof Error);
            assert.doesNotMatch(error.message, /private-network-key/);
            return true;
        }
    );
});

test('429 제한은 같은 호스트 전체에 적용하고 다른 호스트와 만료 후 요청은 허용한다', async () => {
    let now = 1000;
    let calls = 0;
    const request = createRiotRequest(
        () => ({ apiKey: 'test-key' }),
        async () =>
            ++calls === 1
                ? new Response(null, { status: 429, headers: { 'Retry-After': '3' } })
                : Response.json({ ok: true }),
        () => now
    );
    await assert.rejects(request(rank), riotError('RATE_LIMITED', 429));
    now += 1500;
    await assert.rejects(request(profile), (error: unknown) => {
        assert.ok(error instanceof RiotError);
        assert.equal(error.retryAfterSeconds, 2);
        return error.code === 'RATE_LIMITED';
    });
    assert.equal(calls, 1);
    await request(account);
    await request(account, { region: 'europe' });
    now += 1500;
    await request(profile);
    assert.equal(calls, 4);
});

for (const [name, header, seconds] of [
    ['없음', undefined, 60],
    ['잘못된 값', 'later', 60],
    ['음수', '-1', 60],
    ['소수', '1.5', 2],
    ['0', '0', 0]
] as const) {
    test(`Retry-After 정규화: ${name}`, async () => {
        const request = createRiotRequest(
            () => ({ apiKey: 'test-key' }),
            async () =>
                new Response(null, {
                    status: 429,
                    headers: header === undefined ? {} : { 'Retry-After': header }
                }),
            () => 1000
        );
        await assert.rejects(request(account), (error: unknown) => {
            assert.ok(error instanceof RiotError);
            assert.equal(error.code, 'RATE_LIMITED');
            assert.equal(error.retryAfterSeconds, seconds);
            return true;
        });
    });
}

test('8개 동시 요청 제한은 완료 뒤 슬롯을 반환한다', async () => {
    const releases: (() => void)[] = [];
    const request = createRiotRequest(
        () => ({ apiKey: 'test-key' }),
        async () =>
            new Promise<Response>((resolve) => releases.push(() => resolve(Response.json({ ok: true }))))
    );
    const pending = Array.from({ length: 8 }, () => request(account));
    try {
        await assert.rejects(request(region), riotError('BUSY', 503));
        assert.equal(releases.length, 8);
    } finally {
        for (const release of releases) release();
    }
    await Promise.all(pending);
    const next = request(region);
    assert.equal(releases.length, 9);
    releases[8]!();
    assert.deepEqual(await next, { ok: true });
});

test('제어된 타이머로 timeout을 발생시키고 점유 슬롯이 복구됨을 확인한다', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let hanging = true;
    let aborts = 0;
    const request = createRiotRequest(
        () => ({ apiKey: 'test-key', timeoutMs: '1000' }),
        async (_input, init) => {
            if (!hanging) return Response.json({ recovered: true });
            return new Promise<Response>((_resolve, reject) =>
                init!.signal!.addEventListener(
                    'abort',
                    () => {
                        aborts++;
                        reject(new Error('private-abort'));
                    },
                    { once: true }
                )
            );
        }
    );
    const outcomes = Array.from({ length: 8 }, () =>
        assert.rejects(request(account), riotError('TIMEOUT', 504))
    );
    t.mock.timers.tick(1000);
    await Promise.all(outcomes);
    assert.equal(aborts, 8);
    hanging = false;
    assert.deepEqual(await request(account), { recovered: true });
});

test('Riot 응답 어댑터는 no-store와 오류 상태·재시도 시간을 보존한다', async () => {
    const success = await riotResponse(async () => ({ puuid: 'example-puuid' }));
    assert.equal(success.status, 200);
    assert.equal(success.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await success.json(), { puuid: 'example-puuid' });
    const limited = await riotResponse(async () => {
        throw new RiotError('RATE_LIMITED', '대기', { upstreamStatus: 429, retryAfterSeconds: 9 });
    });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('Retry-After'), '9');
    assert.equal(limited.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await limited.json(), { error: { code: 'RATE_LIMITED', message: '대기' } });
    assert.equal(
        (
            await riotResponse(async () => {
                throw new RiotError('UPSTREAM_AUTH_ERROR', '설정 오류');
            })
        ).status,
        503
    );
    const cause = new Error('unexpected');
    await assert.rejects(
        riotResponse(async () => {
            throw cause;
        }),
        (error: unknown) => error === cause
    );
});
