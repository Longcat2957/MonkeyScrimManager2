import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { assertAction, createHttpFixture, HTTP_IDS } from '../../support/http.ts';

test('HTTP 공개 설정은 본인만 변경하며 잘못된 값·교차 출처·대상 ID 위조로 다른 계정을 바꾸지 않는다', async (t) => {
    const f = await createHttpFixture(t);
    const member = await f.session(HTTP_IDS.member);
    const fields = { publicProfile: 'false', publicRiotIds: 'true' };
    assertAction(await f.action('/me', 'privacy', fields), 401);
    assert.equal((await f.request('/me')).status, 401);
    for (const invalid of ['1', '', 'FALSE']) {
        assertAction(
            await f.action('/me', 'privacy', { ...fields, publicProfile: invalid }, member.cookie),
            400
        );
    }
    const crossSite = await f.request('/me?/privacy', {
        method: 'POST',
        body: new URLSearchParams(fields),
        headers: { cookie: member.cookie, origin: 'https://other.invalid', accept: 'application/json' }
    });
    assert.equal(crossSite.status, 403);
    assertAction(
        await f.action('/me', 'privacy', { ...fields, userId: HTTP_IDS.manager }, member.cookie),
        200
    );
    const rows = await f.db.select().from(schema.users);
    const own = rows.find((row) => row.id === HTTP_IDS.member)!;
    const other = rows.find((row) => row.id === HTTP_IDS.manager)!;
    assert.equal(own.publicProfile, false);
    assert.equal(own.publicRiotIds, true);
    assert.equal(other.publicProfile, true);
    assert.equal(other.publicRiotIds, true);
    const page = await f.request('/me', { headers: { cookie: member.cookie } });
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    assert.ok((await page.text()).includes('공개 설정'));
});

test('HTTP 탈퇴는 명시 확인·현재 권한을 검사하고 성공할 때만 쿠키·모든 본인 세션을 정리한다', async (t) => {
    const f = await createHttpFixture(t);
    const member = await f.session(HTTP_IDS.member);
    const anotherSession = await f.session(HTTP_IDS.member);
    const manager = await f.session(HTTP_IDS.manager);
    const operator = await f.session(HTTP_IDS.serviceAdmin);
    assertAction(await f.action('/me', 'withdraw', { confirm: 'true' }), 401);
    assertAction(await f.action('/me', 'withdraw', { confirm: 'false' }, member.cookie), 400);
    assertAction(await f.action('/me', 'withdraw', { confirm: 'true' }, operator.cookie), 409);
    const [before] = await f.db.select().from(schema.users).where(eq(schema.users.id, HTTP_IDS.member));
    const response = await f.request('/me?/withdraw', {
        method: 'POST',
        body: new URLSearchParams({ confirm: 'true', userId: HTTP_IDS.manager }),
        headers: { cookie: member.cookie, origin: f.origin, accept: 'text/html' }
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/');
    const cookies = response.headers.getSetCookie();
    for (const name of ['__Host-monkeybot_session', '__Host-monkeybot_oauth']) {
        assert.ok(cookies.some((cookie) => cookie.startsWith(name + '=;') && /Max-Age=0/i.test(cookie)));
    }
    const [after] = await f.db.select().from(schema.users).where(eq(schema.users.id, HTTP_IDS.member));
    assert.equal(after!.id, before!.id);
    assert.equal(after!.publicId, before!.publicId);
    assert.equal(after!.username, '탈퇴한 사용자');
    assert.equal(after!.publicProfile, false);
    assert.equal(after!.publicRiotIds, false);
    assert.ok(after!.withdrawnAt);
    assert.equal(
        (await f.db.select().from(schema.sessions).where(eq(schema.sessions.userId, HTTP_IDS.member))).length,
        0
    );
    for (const session of [member, anotherSession]) {
        assert.equal((await f.request('/me', { headers: { cookie: session.cookie } })).status, 401);
    }
    assert.equal((await f.request('/me', { headers: { cookie: manager.cookie } })).status, 200);
    assert.equal((await f.request('/me', { headers: { cookie: operator.cookie } })).status, 200);
});
