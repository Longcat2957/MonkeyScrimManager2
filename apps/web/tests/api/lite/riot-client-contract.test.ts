import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test, { after, beforeEach } from 'node:test';
import { riotError } from '../support/error-assertions.ts';

// 이 파일의 자식 테스트 프로세스 안에서만 환경 모듈과 메모리 응답을 제공한다.
const envModule =
    'data:text/javascript,' +
    encodeURIComponent(`
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
let reply: () => Response = () => {
    throw new Error('지정하지 않은 외부 응답');
};
const requests: { url: URL; init?: RequestInit }[] = [];
globalThis.fetch = async (input, init) => {
    requests.push({ url: new URL(String(input)), init });
    return reply();
};
// 환경 모듈 훅과 fetch 대역을 설치한 뒤 클라이언트의 단일 인스턴스를 로드한다.
const summoner = await import('../../../src/lib/server/riot/lol/summoner.ts');
const league = await import('../../../src/lib/server/riot/lol/league.ts');
const account = await import('../../../src/lib/server/riot/account.ts');
const match = await import('../../../src/lib/server/riot/lol/match.ts');
beforeEach(() => {
    requests.length = 0;
    reply = () => {
        throw new Error('지정하지 않은 외부 응답');
    };
});
after(() => {
    globalThis.fetch = originalFetch;
    hooks.deregister();
});

const profile = { puuid: 'player-puuid', profileIconId: 1, revisionDate: 1700000000000, summonerLevel: 100 };
const entry = {
    puuid: 'player-puuid',
    queueType: 'RANKED_SOLO_5x5',
    tier: 'DIAMOND',
    rank: 'I',
    leaguePoints: 250,
    wins: 15,
    losses: 4
};

test('LoL 프로필은 플랫폼 경로·PUUID를 사용하고 추가 필드를 보존한다', async () => {
    reply = () => Response.json({ ...profile, futureField: true });
    assert.deepEqual(await summoner.getSummonerByPuuid('player-puuid', 'jp1'), {
        ...profile,
        futureField: true
    });
    assert.equal(
        requests[0]!.url.href,
        'https://jp1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/player-puuid'
    );
    assert.equal(new Headers(requests[0]!.init?.headers).get('X-Riot-Token'), 'test-key');
});

for (const [name, data] of [
    ['기본', [entry]],
    ['음수 LP', [{ ...entry, leaguePoints: -5 }]],
    ['추가 필드', [{ ...entry, hotStreak: false }]],
    ['기존 leagueId', [{ ...entry, leagueId: 'legacy' }]],
    ['언랭크', []]
] as const) {
    test(`개인 랭크 응답: ${name}`, async () => {
        reply = () => Response.json(data);
        assert.deepEqual(await league.getLeagueEntriesByPuuid('player-puuid'), data);
        assert.equal(requests[0]!.url.host, 'kr.api.riotgames.com');
        assert.equal(requests[0]!.url.pathname, '/lol/league/v4/entries/by-puuid/player-puuid');
    });
}

test('랭크 응답에 생략된 LP와 승패만 0으로 복원한다', async () => {
    const { puuid, queueType, tier, rank } = entry;
    reply = () => Response.json([{ puuid, queueType, tier, rank }]);
    assert.deepEqual(await league.getLeagueEntriesByPuuid(puuid), [
        { puuid, queueType, tier, rank, leaguePoints: 0, wins: 0, losses: 0 }
    ]);
});

for (const puuid of ['  ', '..', '.', 'a\u0000b', '\ud800']) {
    test(`PUUID 경로 거절: ${JSON.stringify(puuid)}`, async () => {
        await assert.rejects(summoner.getSummonerByPuuid(puuid), riotError('INVALID_ARGUMENT'));
        await assert.rejects(league.getLeagueEntriesByPuuid(puuid), riotError('INVALID_ARGUMENT'));
        assert.equal(requests.length, 0);
    });
}

for (const [name, data] of [
    ['null', null],
    ['숫자 문자열', { ...profile, profileIconId: '1' }],
    ['빈 식별자', { ...profile, puuid: '' }]
] as const) {
    test(`프로필 응답 거절: ${name}`, async () => {
        reply = () => Response.json(data);
        await assert.rejects(summoner.getSummonerByPuuid('player-puuid'), riotError('INVALID_RESPONSE', 502));
    });
}

for (const [name, data] of [
    ['배열 아님', {}],
    ['다른 PUUID', [{ ...entry, puuid: 'other' }]],
    ['승리 문자열', [{ ...entry, wins: '15' }]],
    ['음수 패배', [{ ...entry, losses: -1 }]],
    ['패배 null', [{ ...entry, losses: null }]],
    ['티어 null', [{ ...entry, tier: null }]],
    ['leagueId null', [{ ...entry, leagueId: null }]],
    ['leagueId 숫자', [{ ...entry, leagueId: 123 }]],
    ['leagueId 객체', [{ ...entry, leagueId: {} }]]
] as const) {
    test(`랭크 응답 거절: ${name}`, async () => {
        reply = () => Response.json(data);
        await assert.rejects(
            league.getLeagueEntriesByPuuid('player-puuid'),
            riotError('INVALID_RESPONSE', 502)
        );
    });
}

test('ACCOUNT 계열은 Riot ID를 인코딩하고 계정 지역과 LoL 플랫폼을 구분한다', async () => {
    const identity = { puuid: 'player-puuid', gameName: '한글 이름', tagLine: 'KR1' };
    reply = () => Response.json(identity);
    assert.deepEqual(
        await account.getAccountByRiotId({ gameName: '한글 이름', tagLine: 'KR1', region: 'europe' }),
        identity
    );
    assert.equal(
        requests[0]!.url.href,
        `https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent('한글 이름')}/KR1`
    );
    await account.getAccountByPuuid('player-puuid');
    assert.equal(requests[1]!.url.pathname, '/riot/account/v1/accounts/by-puuid/player-puuid');
    reply = () => Response.json({ puuid: 'player-puuid', game: 'lol', region: 'kr' });
    assert.equal((await account.getActiveRegion('player-puuid')).region, 'kr');
    assert.equal(requests[2]!.url.host, 'asia.api.riotgames.com');
});

for (const [name, data] of [
    ['null', null],
    ['빈 PUUID', { puuid: '' }],
    ['이름 숫자', { puuid: 'player-puuid', gameName: 123 }]
] as const) {
    test(`ACCOUNT 응답 거절: ${name}`, async () => {
        reply = () => Response.json(data);
        await assert.rejects(account.getAccountByPuuid('player-puuid'), riotError('INVALID_RESPONSE'));
    });
}

test('다른 게임·빈 지역 응답은 활성 LoL 지역으로 사용하지 않는다', async () => {
    for (const data of [
        { puuid: 'other', game: 'lol', region: 'kr' },
        { puuid: 'player-puuid', game: 'val', region: 'kr' },
        { puuid: 'player-puuid', game: 'lol', region: '' }
    ]) {
        reply = () => Response.json(data);
        await assert.rejects(account.getActiveRegion('player-puuid'), riotError('INVALID_RESPONSE'));
    }
});

test('솔로랭크 목록은 플랫폼의 지역 호스트에서 최신 20건만 읽는다', async () => {
    const ids = ['KR_222', 'KR_111'];
    reply = () => Response.json(ids);
    for (const [platform, region] of [
        ['kr', 'asia'],
        ['na1', 'americas'],
        ['me1', 'europe'],
        ['oc1', 'sea']
    ] as const) {
        assert.deepEqual(await match.getSoloMatchIds('one/two', platform), ids);
        assert.equal(
            requests.at(-1)!.url.href,
            `https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/one%2Ftwo/ids?queue=420&count=20`
        );
    }
    reply = () => Response.json([]);
    assert.deepEqual(await match.getSoloMatchIds('player-puuid', 'kr'), []);
});

test('중복·과다·잘못된 경기 ID 목록은 전체를 거절한다', async () => {
    for (const data of [
        {},
        ['KR_1', 'KR_1'],
        ['../outside'],
        Array.from({ length: 21 }, (_, i) => `KR_${i}`)
    ]) {
        reply = () => Response.json(data);
        await assert.rejects(match.getSoloMatchIds('player-puuid', 'kr'), riotError('INVALID_RESPONSE'));
    }
});

const metadata = { matchId: 'KR_222', participants: ['other', 'player-puuid'] };
const participants = [
    { puuid: 'player-puuid', championId: 103 },
    { puuid: 'other', championId: 1 }
];
const info = { queueId: 420, participants };
test('경기 명단과 대상 일치를 확인하고 PUUID별 챔피언만 반환한다', async () => {
    reply = () =>
        Response.json({
            metadata,
            info: { ...info, participants: participants.map((row) => ({ ...row, name: 'private-name' })) }
        });
    assert.deepEqual(await match.getSoloMatchParticipants('KR_222', 'player-puuid', 'kr'), participants);
    assert.equal(requests[0]!.url.href, 'https://asia.api.riotgames.com/lol/match/v5/matches/KR_222');
});

test('경기 ID·큐·대상·챔피언이 불일치하거나 중복되면 집계하지 않는다', async () => {
    for (const data of [
        { metadata: { ...metadata, matchId: 'KR_111' }, info },
        { metadata, info: { ...info, queueId: 440 } },
        {
            metadata: { ...metadata, participants: ['other'] },
            info: { ...info, participants: [participants[1]] }
        },
        { metadata, info: { ...info, participants: [participants[1], participants[1]] } },
        {
            metadata,
            info: { ...info, participants: [{ ...participants[0], championId: 0 }, participants[1]] }
        },
        {
            metadata,
            info: { ...info, participants: [{ ...participants[0], championId: '1' }, participants[1]] }
        }
    ]) {
        reply = () => Response.json(data);
        await assert.rejects(
            match.getSoloMatchParticipants('KR_222', 'player-puuid', 'kr'),
            riotError('INVALID_RESPONSE')
        );
    }
});
