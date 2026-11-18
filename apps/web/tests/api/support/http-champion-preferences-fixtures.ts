import type { TestContext } from 'node:test';
import { createHttpMatchResultFixture } from './http-match-fixtures.ts';
import type { UpstreamRule } from './http.ts';

export const CHAMPION_PREFERENCES_CATALOG_URL =
    'https://ddragon.leagueoflegends.com/cdn/26.21.1/data/ko_KR/champion.json';

// 실제 Data Dragon의 문자열 id·숫자 key·한국어 이름만 조회 fixture로 사용한다.
export const championPreferenceCatalog = [
    { id: 'Ahri', championId: 103, name: '아리' },
    { id: 'Garen', championId: 86, name: '가렌' },
    { id: 'Lux', championId: 99, name: '럭스' },
    { id: 'Ashe', championId: 22, name: '애쉬' },
    { id: 'Braum', championId: 201, name: '브라움' },
    { id: 'Darius', championId: 122, name: '다리우스' },
    { id: 'LeeSin', championId: 64, name: '리 신' },
    { id: 'Orianna', championId: 61, name: '오리아나' },
    { id: 'Jinx', championId: 222, name: '징크스' },
    { id: 'Nautilus', championId: 111, name: '노틸러스' },
    { id: 'Aatrox', championId: 266, name: '아트록스' },
    { id: 'Annie', championId: 1, name: '애니' }
] as const;

export function championPreferenceForm(position: string, championIds: readonly (number | string | Blob)[]) {
    const body = new FormData();
    body.append('position', position);
    for (const id of championIds) body.append('championIds', typeof id === 'number' ? String(id) : id);
    return body;
}

type Fixture = Awaited<ReturnType<typeof createHttpMatchResultFixture>>;
type ActionReply = Awaited<ReturnType<Fixture['action']>>;

/** 반복 필드를 실제 multipart form action으로 보내며 기존 테스트의 인증·CSRF 계약을 유지한다. */
export async function postChampionPreferenceForm(
    fixture: Fixture,
    body: FormData,
    cookie?: string
): Promise<ActionReply> {
    const response = await fixture.request('/me?/champions', {
        method: 'POST',
        body,
        headers: {
            accept: 'application/json',
            'x-sveltekit-action': 'true',
            origin: fixture.origin,
            ...(cookie ? { cookie } : {})
        }
    });
    const result = (await response.json()) as ActionReply['result'];
    return { response, result };
}

export const championCatalogUpstream: UpstreamRule = {
    method: 'GET',
    url: CHAMPION_PREFERENCES_CATALOG_URL,
    body: {
        type: 'champion',
        version: '26.21.1',
        data: Object.fromEntries(
            championPreferenceCatalog.map(({ id, championId, name }) => [
                id,
                { id, key: String(championId), name, image: { full: id + '.png' } }
            ])
        )
    }
};

export async function createHttpChampionPreferencesFixture(t: TestContext, overrides: UpstreamRule[] = []) {
    const fixture = await createHttpMatchResultFixture(t, [...overrides, championCatalogUpstream]);
    return {
        ...fixture,
        catalog: championPreferenceCatalog,
        champions: (position: string, championIds: readonly (number | string | Blob)[], cookie?: string) =>
            postChampionPreferenceForm(fixture, championPreferenceForm(position, championIds), cookie)
    };
}
