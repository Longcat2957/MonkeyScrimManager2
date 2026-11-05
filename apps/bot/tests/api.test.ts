import assert from 'node:assert/strict';
import test from 'node:test';
import { BotApiError, createApiClient } from '../src/api/client.ts';
import { ACCOUNT, GUILD, REGISTRATION, registrationContext, SCRIM, USER } from './fixtures.ts';

test('신청 생성·수정·철회는 같은 사용자와 interaction ID를 JSON으로 전달한다', async () => {
    const calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
    const api = createApiClient({
        origin: new URL('http://127.0.0.1:3000'),
        token: 'fixture',
        fetch: async (input, init) => {
            assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer fixture');
            assert.equal(init?.redirect, 'error');
            calls.push({ url: String(input), method: init!.method!, body: JSON.parse(String(init!.body)) });
            return Response.json(registrationContext());
        }
    });
    await api.saveRegistration(GUILD, SCRIM, {
        action: 'create',
        actorId: USER,
        interactionId: '970000000000000100',
        riotAccountId: ACCOUNT,
        positions: ['bot']
    });
    await api.saveRegistration(GUILD, SCRIM, {
        action: 'update',
        actorId: USER,
        interactionId: '970000000000000101',
        registrationId: REGISTRATION,
        riotAccountId: ACCOUNT,
        positions: ['mid']
    });
    await api.saveRegistration(GUILD, SCRIM, {
        action: 'withdraw',
        actorId: USER,
        interactionId: '970000000000000102',
        registrationId: REGISTRATION
    });
    assert.deepEqual(
        calls.map((call) => call.method),
        ['POST', 'PATCH', 'PATCH']
    );
    assert.ok(calls.every((call) => call.url.endsWith(`/guilds/${GUILD}/scrims/${SCRIM}/registrations`)));
    assert.equal(calls[1]!.body.registrationId, REGISTRATION);
    assert.equal(api.health.connected, true);
});

test('API 인증 실패는 정상 연결로 표시하지 않는다', async () => {
    const api = createApiClient({
        origin: new URL('http://localhost:3000'),
        token: 'fixture',
        fetch: async () =>
            Response.json({ error: { code: 'UNAUTHENTICATED', message: '인증 실패' } }, { status: 401 })
    });
    await assert.rejects(
        api.claim('worker'),
        (error) => error instanceof BotApiError && error.status === 401
    );
    assert.equal(api.health.connected, false);
    assert.equal(api.health.errorCode, 'UNAUTHENTICATED');
});

test('네트워크 오류는 토큰·내부 주소를 오류 문구에 노출하지 않는다', async () => {
    const api = createApiClient({
        origin: new URL('http://localhost:3000'),
        token: 'secret-value',
        fetch: async () => {
            throw new Error('secret-value http://localhost:3000');
        }
    });
    await assert.rejects(
        api.claim('worker'),
        (error) =>
            error instanceof BotApiError &&
            error.code === 'API_UNAVAILABLE' &&
            !error.message.includes('secret-value')
    );
});

test('잘못된 성공 응답은 API 정상 응답으로 간주하지 않는다', async () => {
    const api = createApiClient({
        origin: new URL('http://localhost:3000'),
        token: 'fixture',
        fetch: async () => new Response('not-json')
    });
    await assert.rejects(
        api.claim('worker'),
        (error) => error instanceof BotApiError && error.code === 'INVALID_RESPONSE'
    );
});

test('게시 복구 검색어는 특수문자와 대소문자를 보존해 내부 API에 전달한다', async () => {
    const queries = ['', '  2세트 A_%\\ 한글?&=#  '];
    const calls: URL[] = [];
    const api = createApiClient({
        origin: new URL('http://127.0.0.1:3000'),
        token: 'fixture',
        fetch: async (input, init) => {
            calls.push(new URL(String(input)));
            assert.equal(init?.method, 'GET');
            assert.equal(init?.body, undefined);
            assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer fixture');
            return Response.json({ publications: [] });
        }
    });
    for (const query of queries) await api.failedPublications(GUILD, USER, query);
    assert.ok(calls.every((url) => url.pathname === `/internal/bot/guilds/${GUILD}/publications`));
    assert.ok(calls.every((url) => url.searchParams.get('actorId') === USER));
    assert.deepEqual(
        calls.map((url) => url.searchParams.get('q')),
        queries
    );
});
