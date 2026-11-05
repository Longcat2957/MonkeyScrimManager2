import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { hashSessionToken } from '../../../../src/lib/server/auth/session-core.ts';
import { sessions, users } from '../../../../src/lib/server/db/schema.ts';
import { createHttpFixture, HTTP_COOKIE, HTTP_IDS } from '../../support/http.ts';

test('HTTP: 비로그인 개인 페이지는 401이고 공개 홈은 200이다', async (t) => {
    const f = await createHttpFixture(t);
    assert.equal((await f.request('/me')).status, 401);
    assert.equal((await f.request('/')).status, 200);
});

test('HTTP: 유효 세션은 사용자를 복원하고 만료 세션은 DB와 쿠키에서 폐기한다', async (t) => {
    const f = await createHttpFixture(t);
    const active = await f.session(HTTP_IDS.member);
    assert.equal((await f.request('/me', { headers: { cookie: active.cookie } })).status, 200);
    const expired = await f.session(HTTP_IDS.member, true);
    const denied = await f.request('/me', { headers: { cookie: expired.cookie } });
    assert.equal(denied.status, 401);
    assert.ok(
        denied.headers
            .getSetCookie()
            .some((value) => value.startsWith(HTTP_COOKIE + '=') && /Max-Age=0/i.test(value))
    );
    assert.equal(
        (await f.db.select().from(sessions).where(eq(sessions.tokenHash, expired.tokenHash))).length,
        0
    );
    assert.equal(
        (await f.db.select().from(sessions).where(eq(sessions.tokenHash, active.tokenHash))).length,
        1
    );
});

test('HTTP: OAuth 시작·콜백은 실제 라우트와 DB 세션을 사용하고 외부 프로필만 고정 응답을 쓴다', async (t) => {
    const f = await createHttpFixture(t);
    const start = await f.request('/auth/discord?returnTo=%2Fme');
    assert.equal(start.status, 303);
    assert.equal(start.headers.get('cache-control'), 'no-store');
    const destination = new URL(start.headers.get('location')!);
    assert.equal(destination.origin, 'https://discord.com');
    assert.equal(destination.searchParams.get('scope'), 'identify');
    assert.equal(destination.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(destination.searchParams.get('redirect_uri'), f.origin + '/auth/discord/callback');
    const transaction = start.headers
        .getSetCookie()
        .find((value) => value.startsWith('__Host-monkeybot_oauth='))!;
    assert.match(transaction, /HttpOnly/i);
    assert.match(transaction, /Secure/i);
    assert.match(transaction, /SameSite=Lax/i);
    const callback = await f.request(
        '/auth/discord/callback?code=fixture-code&state=' + destination.searchParams.get('state'),
        {
            headers: { cookie: transaction.split(';')[0]! }
        }
    );
    assert.equal(callback.status, 303);
    assert.equal(callback.headers.get('location'), '/me');
    const issued = callback.headers.getSetCookie().find((value) => value.startsWith(HTTP_COOKIE + '='))!;
    assert.match(issued, /HttpOnly/i);
    assert.match(issued, /Secure/i);
    const token = issued.split(';')[0]!.slice(HTTP_COOKIE.length + 1);
    const rows = await f.db.select().from(sessions);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.tokenHash, hashSessionToken(token));
    assert.notEqual(rows[0]!.tokenHash, token);
    assert.equal(rows[0]!.userId, HTTP_IDS.member);
    assert.equal(
        (await f.db.select().from(users).where(eq(users.id, HTTP_IDS.member)))[0]!.username,
        'OAuth 사용자'
    );
    assert.equal((await f.request('/me', { headers: { cookie: issued.split(';')[0]! } })).status, 200);
});

test('HTTP: 쿠키 없는 OAuth 콜백은 외부 요청과 세션 생성 전에 거절한다', async (t) => {
    const f = await createHttpFixture(t);
    const response = await f.request('/auth/discord/callback?code=fixture-code&state=invalid');
    assert.equal(response.status, 400);
    assert.equal((await f.db.select().from(sessions)).length, 0);
    assert.equal(
        f.upstreamCalls.some((path) => path.includes('oauth2/token')),
        false
    );
});

test('HTTP: 로그아웃은 동일 출처 POST만 허용하고 세션을 영구 삭제한다', async (t) => {
    const f = await createHttpFixture(t);
    const session = await f.session(HTTP_IDS.member);
    assert.equal((await f.request('/auth/logout', { headers: { cookie: session.cookie } })).status, 405);
    assert.equal(
        (
            await f.request('/auth/logout', {
                method: 'POST',
                headers: { cookie: session.cookie, origin: 'https://other.invalid' }
            })
        ).status,
        403
    );
    assert.equal((await f.db.select().from(sessions)).length, 1);
    const response = await f.request('/auth/logout', {
        method: 'POST',
        headers: { cookie: session.cookie, origin: f.origin }
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/');
    assert.ok(
        response.headers
            .getSetCookie()
            .some((value) => value.startsWith(HTTP_COOKIE + '=') && /Max-Age=0/i.test(value))
    );
    assert.equal((await f.db.select().from(sessions)).length, 0);
    assert.equal((await f.request('/me', { headers: { cookie: session.cookie } })).status, 401);
});
