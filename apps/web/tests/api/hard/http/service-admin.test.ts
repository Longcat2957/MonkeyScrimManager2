import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { assertAction, createHttpFixture, HTTP_IDS } from '../../support/http.ts';

test('HTTP 운영자 지정·회수는 서비스 운영자만 실행하고 일반 서버 관리 권한으로 우회하지 않는다', async (t) => {
    const f = await createHttpFixture(t);
    const manager = await f.session(HTTP_IDS.manager);
    const member = await f.session(HTTP_IDS.member);
    const serviceAdmin = await f.session(HTTP_IDS.serviceAdmin);
    const input = { userId: HTTP_IDS.manager, enabled: 'true' };
    assertAction(await f.action('/backoffice', 'setServiceAdmin', input), 401);
    for (const session of [manager, member]) {
        assert.equal((await f.request('/backoffice', { headers: { cookie: session.cookie } })).status, 403);
        assertAction(
            await f.action(
                '/backoffice',
                'setServiceAdmin',
                { ...input, isServiceAdmin: 'true' },
                session.cookie
            ),
            403
        );
    }
    const crossSite = await f.request('/backoffice?/setServiceAdmin', {
        method: 'POST',
        body: new URLSearchParams(input),
        headers: { cookie: serviceAdmin.cookie, origin: 'https://other.invalid', accept: 'application/json' }
    });
    assert.equal(crossSite.status, 403);
    const [before] = await f.db.select().from(schema.users).where(eq(schema.users.id, HTTP_IDS.manager));
    assert.equal(before!.isServiceAdmin, false);
    assertAction(await f.action('/backoffice', 'setServiceAdmin', input, serviceAdmin.cookie), 200);
    assert.equal((await f.request('/backoffice', { headers: { cookie: manager.cookie } })).status, 200);
    const [after] = await f.db.select().from(schema.users).where(eq(schema.users.id, HTTP_IDS.manager));
    assert.equal(after!.isServiceAdmin, true);
    assertAction(
        await f.action(
            '/backoffice',
            'setServiceAdmin',
            { userId: HTTP_IDS.member, enabled: 'true' },
            serviceAdmin.cookie
        ),
        200
    );
    assertAction(
        await f.action(
            '/g/' + HTTP_IDS.guild + '/admin',
            'discord',
            { key: 'resultChannelId', value: HTTP_IDS.channel },
            member.cookie
        ),
        403
    );
});

test('HTTP 자기 권한 회수는 내 정보로 이동하고 기존 세션의 다음 요청부터 권한을 거절한다', async (t) => {
    const f = await createHttpFixture(t);
    const serviceAdmin = await f.session(HTTP_IDS.serviceAdmin);
    const manager = await f.session(HTTP_IDS.manager);
    assertAction(
        await f.action(
            '/backoffice',
            'setServiceAdmin',
            { userId: HTTP_IDS.manager, enabled: 'true' },
            serviceAdmin.cookie
        ),
        200
    );
    const revoked = await f.action(
        '/backoffice',
        'setServiceAdmin',
        { userId: HTTP_IDS.serviceAdmin, enabled: 'false' },
        serviceAdmin.cookie
    );
    assert.equal(revoked.result.type, 'redirect');
    assert.equal(revoked.result.status, 303);
    assert.equal(revoked.result.location, '/me');
    assert.equal((await f.request('/backoffice', { headers: { cookie: serviceAdmin.cookie } })).status, 403);
    assertAction(
        await f.action(
            '/backoffice',
            'setServiceAdmin',
            { userId: HTTP_IDS.serviceAdmin, enabled: 'true' },
            serviceAdmin.cookie
        ),
        403
    );
    assertAction(
        await f.action(
            '/backoffice',
            'setServiceAdmin',
            { userId: HTTP_IDS.manager, enabled: 'false' },
            manager.cookie
        ),
        409
    );
    const [remaining] = await f.db.select().from(schema.users).where(eq(schema.users.id, HTTP_IDS.manager));
    assert.equal(remaining!.isServiceAdmin, true);
    const denied = await f.request('/backoffice/__data.json', { headers: { cookie: serviceAdmin.cookie } });
    const text = await denied.text();
    assert.ok(!text.includes('"admins"'));
    assert.ok(!text.includes('"overview"'));
});
