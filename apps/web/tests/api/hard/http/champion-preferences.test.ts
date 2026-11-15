import assert from 'node:assert/strict';
import test from 'node:test';
import { parse, unflatten } from 'devalue';
import { asc, eq } from 'drizzle-orm';
import type {
    ChampionPreferenceSelections,
    MyChampionPreferences
} from '../../../../src/lib/features/me/champions.ts';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { assertAction, HTTP_IDS } from '../../support/http.ts';
import {
    CHAMPION_PREFERENCES_CATALOG_URL,
    championPreferenceForm,
    createHttpChampionPreferencesFixture,
    postChampionPreferenceForm
} from '../../support/http-champion-preferences-fixtures.ts';

type Fixture = Awaited<ReturnType<typeof createHttpChampionPreferencesFixture>>;
type Reply = Awaited<ReturnType<Fixture['champions']>>;

async function preferences(f: Fixture, cookie = f.participant.cookie): Promise<MyChampionPreferences> {
    const response = await f.request('/me/__data.json', { headers: { cookie } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    const payload = (await response.json()) as { nodes: ({ type: string; data?: unknown[] } | null)[] };
    for (const node of payload.nodes.toReversed()) {
        if (node?.type !== 'data' || !node.data) continue;
        const value = unflatten(node.data) as { championPreferences?: MyChampionPreferences };
        if (value.championPreferences) return value.championPreferences;
    }
    assert.fail('본인 선호 챔피언 자료가 없습니다.');
}

function actionData(reply: Reply) {
    const result = reply.result;
    assert.ok(result.type === 'success' || result.type === 'failure');
    assert.equal(typeof result.data, 'string');
    return parse(result.data!) as {
        championsSaved?: boolean;
        championPreferences?: ChampionPreferenceSelections;
        action?: string;
        values?: { position: string; championIds: number[] };
        message?: string;
    };
}

const rows = (f: Fixture) =>
    f.db
        .select()
        .from(schema.userChampionPreferences)
        .orderBy(
            asc(schema.userChampionPreferences.userId),
            asc(schema.userChampionPreferences.position),
            asc(schema.userChampionPreferences.ordinal)
        );

test('본인 선호만 저장하며 로그인·교차 출처를 검사하고 사용자·실행자 위조로 다른 설정을 바꾸지 않는다', async (t) => {
    const f = await createHttpChampionPreferencesFixture(t);
    assertAction(await f.champions('top', [103]), 401);
    assert.deepEqual(await rows(f), []);
    const crossSite = await f.request('/me?/champions', {
        method: 'POST',
        body: championPreferenceForm('top', [103]),
        headers: { cookie: f.participant.cookie, origin: 'https://other.invalid', accept: 'application/json' }
    });
    assert.equal(crossSite.status, 403);
    const body = championPreferenceForm('top', [103, 266]);
    body.append('userId', HTTP_IDS.manager);
    body.append('actorId', HTTP_IDS.manager);
    const saved = await postChampionPreferenceForm(f, body, f.participant.cookie);
    assertAction(saved, 200);
    assert.match(saved.response.headers.get('cache-control') ?? '', /no-store/);
    assert.equal(actionData(saved).championsSaved, true);
    assert.deepEqual(actionData(saved).championPreferences!.top, [103, 266]);
    assert.ok((await rows(f)).every((row) => row.userId === HTTP_IDS.member));
    assert.deepEqual((await preferences(f, f.manager.cookie)).preferences.top, []);
    const operator = await f.session(HTTP_IDS.serviceAdmin);
    assertAction(await f.champions('mid', [99], operator.cookie), 200);
    assert.deepEqual((await preferences(f, operator.cookie)).preferences.mid, [99]);
    assert.deepEqual((await preferences(f)).preferences.mid, []);
    const before = await preferences(f);
    assert.equal(before.catalogError, null);
    assert.equal(before.catalog.length, 12);
    assert.deepEqual(
        before.catalog.find((champion) => champion.championId === 103),
        {
            championId: 103,
            id: 'Ahri',
            name: '아리',
            iconUrl: 'https://ddragon.leagueoflegends.com/cdn/26.21.1/img/champion/Ahri.png'
        }
    );
    assertAction(
        await f.action(
            '/me',
            'privacy',
            { publicProfile: 'false', publicRiotIds: 'true' },
            f.participant.cookie
        ),
        200
    );
    assert.deepEqual((await preferences(f)).preferences, before.preferences);
    const [own] = await f.db.select().from(schema.users).where(eq(schema.users.id, HTTP_IDS.member));
    assert.equal(own!.publicProfile, false);
    assert.equal(own!.publicRiotIds, true);
});

test('한 lane의 순서 있는 최대10개만 교체하고 다른 lane·같은 값 재저장·빈 목록 초기화를 보존한다', async (t) => {
    const f = await createHttpChampionPreferencesFixture(t);
    const expected: ChampionPreferenceSelections = {
        top: [266, 103],
        jungle: [64],
        mid: [99, 61],
        bot: [222, 22],
        support: [201, 111]
    };
    for (const [position, ids] of Object.entries(expected))
        assertAction(await f.champions(position, ids, f.participant.cookie), 200);
    assert.deepEqual((await preferences(f)).preferences, expected);
    const ten = f.catalog
        .slice(0, 10)
        .map((champion) => champion.championId)
        .reverse();
    assertAction(await f.champions('top', ten, f.participant.cookie), 200);
    const stored = await rows(f);
    const lane = stored.filter((row) => row.position === 'top');
    assert.deepEqual(
        lane.map((row) => row.championId),
        ten
    );
    assert.deepEqual(
        lane.map((row) => row.ordinal),
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    );
    assertAction(await f.champions('top', ten, f.participant.cookie), 200);
    assert.deepEqual(await rows(f), stored);
    assertAction(await f.champions('top', [], f.participant.cookie), 200);
    assert.deepEqual((await preferences(f)).preferences, { ...expected, top: [] });
});

test('숫자 강제변환·파일·중복·범위·11개·잘못된 lane과 반복 lane은400이며 기존 목록을 그대로 둔다', async (t) => {
    const f = await createHttpChampionPreferencesFixture(t);
    assertAction(await f.champions('mid', [266, 103], f.participant.cookie), 200);
    const initial = await rows(f);
    for (const ids of [
        ['1.03e2'],
        ['0x67'],
        ['103.0'],
        ['+103'],
        [' 103'],
        ['103 '],
        ['01'],
        [''],
        ['0'],
        ['-1'],
        ['NaN'],
        ['Infinity'],
        ['9007199254740992'],
        ['2147483648'],
        ['[103]'],
        [103, 103],
        [999_999],
        f.catalog.slice(0, 11).map((champion) => champion.championId),
        [new Blob(['103'], { type: 'text/plain' })]
    ]) {
        const response = await f.champions('mid', ids, f.participant.cookie);
        assertAction(response, 400);
        assert.equal(actionData(response).action, 'champions');
        assert.deepEqual(await rows(f), initial);
    }
    for (const position of ['', 'adc', 'TOP']) {
        assertAction(await f.champions(position, [103], f.participant.cookie), 400);
        assert.deepEqual(await rows(f), initial);
    }
    const duplicatedLane = championPreferenceForm('top', [103]);
    duplicatedLane.append('position', 'jungle');
    assertAction(await postChampionPreferenceForm(f, duplicatedLane, f.participant.cookie), 400);
    const missingLane = championPreferenceForm('top', [103]);
    missingLane.delete('position');
    assertAction(await postChampionPreferenceForm(f, missingLane, f.participant.cookie), 400);
    assert.deepEqual(await rows(f), initial);
});

test('카탈로그 장애에도 저장 목록을 읽고 nonempty저장은503·불변이며 []해제는 카탈로그 없이 동작한다', async (t) => {
    const f = await createHttpChampionPreferencesFixture(t, [
        { method: 'GET', url: CHAMPION_PREFERENCES_CATALOG_URL, status: 503, body: {} }
    ]);
    await f.db.insert(schema.userChampionPreferences).values([
        { userId: HTTP_IDS.member, position: 'top', championId: 103, ordinal: 1 },
        { userId: HTTP_IDS.member, position: 'mid', championId: 266, ordinal: 1 }
    ]);
    const initial = await rows(f);
    const current = await preferences(f);
    assert.deepEqual(current.preferences.top, [103]);
    assert.deepEqual(current.preferences.mid, [266]);
    assert.deepEqual(current.catalog, []);
    assert.equal(typeof current.catalogError, 'string');
    assert.ok(current.catalogError!.length > 0);
    const failure = await f.champions('top', [103, 266], f.participant.cookie);
    assertAction(failure, 503);
    assert.deepEqual(actionData(failure).values, { position: 'top', championIds: [103, 266] });
    assert.deepEqual(await rows(f), initial);
    const requests = f.upstreamCalls.length;
    assertAction(await f.champions('top', [], f.participant.cookie), 200);
    assert.equal(f.upstreamCalls.length, requests);
    const after = await preferences(f);
    assert.deepEqual(after.preferences.top, []);
    assert.deepEqual(after.preferences.mid, [266]);
});

test('현재 lane의 기존 unknown만 보존·재정렬하며 다른 lane 복사나 삭제 후 재추가는 허용하지 않는다', async (t) => {
    const f = await createHttpChampionPreferencesFixture(t);
    await f.db.insert(schema.userChampionPreferences).values([
        { userId: HTTP_IDS.member, position: 'top', championId: 999_999, ordinal: 1 },
        { userId: HTTP_IDS.member, position: 'mid', championId: 103, ordinal: 1 }
    ]);
    assert.deepEqual((await preferences(f)).preferences.top, [999_999]);
    assertAction(await f.champions('top', [103, 999_999], f.participant.cookie), 200);
    assert.deepEqual((await preferences(f)).preferences.top, [103, 999_999]);
    const current = await rows(f);
    assertAction(await f.champions('jungle', [999_999], f.participant.cookie), 400);
    assertAction(await f.champions('top', [999_998], f.participant.cookie), 400);
    assert.deepEqual(await rows(f), current);
    assertAction(await f.champions('top', [], f.participant.cookie), 200);
    assertAction(await f.champions('top', [999_999], f.participant.cookie), 400);
    assert.deepEqual((await preferences(f)).preferences.top, []);
    assert.deepEqual((await preferences(f)).preferences.mid, [103]);
});

test('실제 경기 종료 후 탈퇴는 선호를 정리하며 stale withdrawn 세션도 다른 설정·기록·MMR을 되살리지 못한다', async (t) => {
    const f = await createHttpChampionPreferencesFixture(t);
    assertAction(await f.champions('top', [103, 266], f.participant.cookie), 200);
    assertAction(await f.champions('top', [99], f.manager.cookie), 200);
    for (const order of [1, 2])
        assertAction(
            await f.action(
                f.path,
                'upload',
                { ...(await f.confirm(order)), file: f.file(1_800_125 + order * 100_000) },
                f.participant.cookie
            ),
            200
        );
    const games = await f.db.select().from(schema.gameParticipants);
    const scores = await f.db.select().from(schema.userPositionMmr);
    const managerPrefs = (await rows(f)).filter((row) => row.userId === HTTP_IDS.manager);
    const withdrawal = await f.request('/me?/withdraw', {
        method: 'POST',
        body: new URLSearchParams({ confirm: 'true', userId: HTTP_IDS.manager }),
        headers: { cookie: f.participant.cookie, origin: f.origin, accept: 'text/html' }
    });
    assert.equal(withdrawal.status, 303);
    assert.deepEqual(
        (await rows(f)).filter((row) => row.userId === HTTP_IDS.member),
        []
    );
    assertAction(await f.champions('top', [103], f.participant.cookie), 401);
    // 탈퇴 처리 뒤 남아 있던 세션 행을 재현해 요청 경계가 현재 탈퇴 상태를 다시 검사하는지 확인한다.
    const stale = await f.session(HTTP_IDS.member);
    assertAction(await f.champions('top', [103], stale.cookie), 401);
    assert.equal((await f.request('/me', { headers: { cookie: stale.cookie } })).status, 401);
    assert.deepEqual(
        (await rows(f)).filter((row) => row.userId === HTTP_IDS.member),
        []
    );
    assert.deepEqual(
        (await rows(f)).filter((row) => row.userId === HTTP_IDS.manager),
        managerPrefs
    );
    assert.deepEqual(await f.db.select().from(schema.gameParticipants), games);
    assert.deepEqual(await f.db.select().from(schema.userPositionMmr), scores);
    assert.deepEqual(
        await f.db.select().from(schema.sessions).where(eq(schema.sessions.userId, HTTP_IDS.member)),
        []
    );
});
