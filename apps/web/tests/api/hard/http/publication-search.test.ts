import assert from 'node:assert/strict';
import test from 'node:test';
import type { BotFailedPublication } from '../../../../../../shared/bot-api.js';
import { createHttpFixture, HTTP_BOT_TOKEN, HTTP_IDS } from '../../support/http.ts';
import {
    seedLiteralPublications,
    seedPublicationSearch,
    seedPublicationTargets
} from '../../support/publication-search-fixtures.ts';

type Fixture = Awaited<ReturnType<typeof createHttpFixture>>;

async function search(
    f: Fixture,
    query = '',
    options: { guildId?: string; actorId?: string; token?: string } = {}
) {
    const params = new URLSearchParams({ actorId: options.actorId ?? HTTP_IDS.manager, q: query });
    return f.request(
        '/internal/bot/guilds/' + (options.guildId ?? HTTP_IDS.guild) + '/publications?' + params,
        {
            headers: { authorization: 'Bearer ' + (options.token ?? HTTP_BOT_TOKEN) }
        }
    );
}

async function publications(response: Response) {
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    return ((await response.json()) as { publications: BotFailedPublication[] }).publications;
}

test('HTTP 봇: 게시 복구 검색어는 최신 25개 제한보다 먼저 적용된다', async (t) => {
    const f = await createHttpFixture(t);
    const seeded = await seedPublicationSearch(f.db, HTTP_IDS.guild, HTTP_IDS.otherGuild);
    const initial = await publications(await search(f));
    assert.equal(initial.length, 25);
    assert.ok(initial.every((job) => job.id !== seeded.oldJob.id));
    const found = await publications(await search(f, '  이전 주차  '));
    assert.deepEqual(
        found.map((job) => job.id),
        [seeded.oldJob.id]
    );
    assert.equal(found[0]!.targetLabel, null);
    const other = await publications(await search(f, '이전 주차', { guildId: HTTP_IDS.otherGuild }));
    assert.deepEqual(
        other.map((job) => job.id),
        [seeded.foreignJob.id]
    );
});

test('HTTP 봇: 복구 검색의 특수문자·길이·권한 계약을 실제 요청에서 검증한다', async (t) => {
    const f = await createHttpFixture(t);
    const jobs = await seedLiteralPublications(f.db, HTTP_IDS.guild);
    for (const [query, index] of [
        ['%', 0],
        ['_', 2],
        ['\\', 4],
        ['mixed case', 6]
    ] as const) {
        const found = await publications(await search(f, query));
        assert.deepEqual(
            found.map((job) => job.id),
            [jobs[index]!.id],
            query
        );
    }
    for (const query of ['가'.repeat(101), '잘못된\0검색']) {
        const response = await search(f, query);
        assert.equal(response.status, 400);
        assert.equal((await response.json()).error.code, 'INVALID_INPUT');
    }
    assert.deepEqual(await publications(await search(f, '가'.repeat(100))), []);
    const denied = await search(f, '%', { actorId: HTTP_IDS.member });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).error.code, 'FORBIDDEN');
    const unauthenticated = await search(f, '%', { token: 'invalid-fixture-token' });
    assert.equal(unauthenticated.status, 401);
    assert.equal((await unauthenticated.json()).error.code, 'UNAUTHENTICATED');
});

test('HTTP 봇: 같은 내전의 세트·취소 결과·라인업·DM을 대상 이름으로 찾는다', async (t) => {
    const f = await createHttpFixture(t);
    const targets = await seedPublicationTargets(f.db, HTTP_IDS.guild, [HTTP_IDS.manager, HTTP_IDS.member]);
    const found = await publications(await search(f));
    assert.equal(found.length, 7);
    assert.ok(found.every((job) => job.title === targets.scrim.title));
    assert.equal(new Set(found.map((job) => job.targetLabel)).size, 7);
    for (const [query, expected] of [
        ['2세트', targets.result2.id],
        ['취소 결과', targets.cancelledResult.id],
        ['준결승 B', targets.lineupB.id],
        ['바위게팀', targets.lineupB.id],
        ['수신자 A%', targets.dmA.id],
        ['수신자 B_', targets.dmB.id]
    ]) {
        const rows = await publications(await search(f, query));
        assert.deepEqual(
            rows.map((job) => job.id),
            [expected],
            query
        );
    }
    assert.deepEqual(await publications(await search(f, '2세트', { guildId: HTTP_IDS.otherGuild })), []);
});
