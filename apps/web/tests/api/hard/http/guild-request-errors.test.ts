import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { guildDiscordSettings, webRequestErrors } from '../../../../src/lib/server/db/schema.ts';
import {
    deleteExpiredRequestErrors,
    storeRequestError
} from '../../../../src/lib/server/guild/request-errors.ts';
import { createHttpFixture, HTTP_IDS } from '../../support/http.ts';

const admin = '/g/' + HTTP_IDS.guild + '/admin';
const tab = admin + '?tab=errors';
const expiredAt = new Date(Date.now() - 31 * 86400_000);

test('길드 오류 로그는 두 서버 훅에서 요청당 한 건만 저장하고 열람 권한과 길드 범위를 검증한다', async (t) => {
    const f = await createHttpFixture(
        t,
        [
            {
                method: 'GET',
                url: 'https://discord.com/api/v10/guilds/' + HTTP_IDS.guild + '/members/' + HTTP_IDS.member,
                body: {
                    user: {
                        id: HTTP_IDS.member,
                        username: '운영 역할 멤버',
                        global_name: null,
                        avatar: null,
                        bot: false
                    },
                    roles: [HTTP_IDS.role]
                }
            }
        ],
        { botInternalToken: '' }
    );
    const manager = await f.session(HTTP_IDS.manager);
    const member = await f.session(HTTP_IDS.member);
    const managerHeaders = { cookie: manager.cookie };
    async function entry(response: Response, status: number, kind: string | null, guildId: string | null) {
        assert.equal(response.status, status);
        const requestId = response.headers.get('x-request-id');
        assert.ok(requestId);
        const rows = await f.db
            .select()
            .from(webRequestErrors)
            .where(eq(webRequestErrors.requestId, requestId));
        assert.equal(rows.length, 1);
        assert.deepEqual([rows[0]!.status, rows[0]!.kind, rows[0]!.guildId], [status, kind, guildId]);
        return rows[0]!;
    }

    const empty = await f.request(tab, { headers: managerHeaders });
    assert.equal(empty.status, 200);
    assert.match(empty.headers.get('cache-control') ?? '', /private, no-store/);
    assert.match(await empty.text(), /최근 30일간 기록된 요청 오류가 없어요/);
    const redirect = await f.request('/auth/logout', { method: 'POST', headers: { origin: f.origin } });
    assert.equal(redirect.status, 303);
    assert.equal((await f.db.select().from(webRequestErrors)).length, 0);

    await entry(await f.request('/internal/bot/guilds/' + HTTP_IDS.guild + '/members'), 503, null, null);
    const secret = 'not-for-storage';
    const forbidden = await entry(
        await f.request(tab + '&token=' + secret, { headers: { cookie: member.cookie } }),
        403,
        'app',
        HTTP_IDS.guild
    );
    assert.equal(forbidden.route, '/g/[guildId]/admin');
    await f.pool.query('alter table guild_audit_entries rename to unavailable_audit');
    try {
        await entry(
            await f.request(admin + '?tab=audit', { headers: managerHeaders }),
            500,
            'unknown',
            HTTP_IDS.guild
        );
    } finally {
        await f.pool.query('alter table unavailable_audit rename to guild_audit_entries');
    }
    const form = { name: secret, expectedCurrentSeasonId: randomUUID(), confirm: 'true' };
    await entry(
        (await f.action(admin, 'rotateSeason', form, manager.cookie)).response,
        409,
        null,
        HTTP_IDS.guild
    );
    await entry(
        await f.request(admin + '?/rotateSeason', {
            method: 'POST',
            headers: { ...managerHeaders, origin: f.origin, accept: 'text/html' },
            body: new URLSearchParams(form)
        }),
        409,
        null,
        HTTP_IDS.guild
    );

    const unverified = await entry(
        (await f.action('/g/' + HTTP_IDS.otherGuild + '/admin', 'rotateSeason', form)).response,
        401,
        null,
        null
    );
    const other = await f.request('/g/' + HTTP_IDS.otherGuild + '/admin?tab=errors', {
        headers: managerHeaders
    });
    assert.match(await other.text(), /최근 30일간 기록된 요청 오류가 없어요/);
    const oldId = randomUUID();
    const old = { ...forbidden, requestId: oldId, occurredAt: expiredAt };
    const responseOnly = { ...old, guildId: null, kind: null, status: 400 };
    await storeRequestError(f.db, responseOnly);
    await storeRequestError(f.db, old);
    await storeRequestError(f.db, responseOnly);
    assert.deepEqual(
        await f.db.select().from(webRequestErrors).where(eq(webRequestErrors.requestId, oldId)),
        [old]
    );
    const html = await (await f.request(tab, { headers: managerHeaders })).text();
    assert.ok(html.includes(forbidden.requestId));
    for (const hidden of [secret, oldId, unverified.requestId]) assert.ok(!html.includes(hidden));
    assert.ok(!JSON.stringify(await f.db.select().from(webRequestErrors)).includes(secret));
    await deleteExpiredRequestErrors(f.db);
    assert.equal(
        (await f.db.select().from(webRequestErrors).where(eq(webRequestErrors.requestId, oldId))).length,
        0
    );

    assert.deepEqual(
        await f.db.select().from(webRequestErrors).where(eq(webRequestErrors.requestId, forbidden.requestId)),
        [forbidden]
    );

    const anonymous = await f.request(tab);
    assert.equal(anonymous.status, 401);
    const denied = await f.request(admin + '/__data.json?tab=errors', { headers: { cookie: member.cookie } });
    assert.equal(denied.status, 200);
    assert.ok(!(await denied.text()).includes(forbidden.requestId));
    const [dataError] = await f.db
        .select()
        .from(webRequestErrors)
        .where(eq(webRequestErrors.requestId, denied.headers.get('x-request-id')!));
    assert.equal(dataError?.status, 403);

    await f.db
        .insert(guildDiscordSettings)
        .values({ guildId: HTTP_IDS.guild, operatorRoleId: HTTP_IDS.role })
        .onConflictDoUpdate({ target: guildDiscordSettings.guildId, set: { operatorRoleId: HTTP_IDS.role } });
    assert.equal((await f.request(tab, { headers: { cookie: member.cookie } })).status, 200);
    await f.db
        .update(guildDiscordSettings)
        .set({ operatorRoleId: null })
        .where(eq(guildDiscordSettings.guildId, HTTP_IDS.guild));
    const revoked = await f.request(tab, { headers: { cookie: member.cookie } });
    assert.equal(revoked.status, 403);
    assert.ok(!(await revoked.text()).includes(forbidden.requestId));
});

test('오류 로그 테이블 장애는 원래 응답을 보존하며 복구한 목록 조회는 새 요청 오류를 만들지 않는다', async (t) => {
    const f = await createHttpFixture(t);
    const manager = await f.session(HTTP_IDS.manager);
    const member = await f.session(HTTP_IDS.member);
    await f.pool.query('alter table web_request_errors rename to unavailable_errors');
    try {
        const response = await f.request(tab, { headers: { cookie: manager.cookie } });
        assert.equal(response.status, 200);
        assert.match(await response.text(), /오류 로그를 불러오지 못했어요/);
        const denied = await f.request(tab, { headers: { cookie: member.cookie } });
        assert.equal(denied.status, 403);
        assert.match(await denied.text(), /접근 권한이 없어요/);
    } finally {
        await f.pool.query('alter table unavailable_errors rename to web_request_errors');
    }
    const restored = await f.request(tab, { headers: { cookie: manager.cookie } });
    assert.match(await restored.text(), /최근 30일간 기록된 요청 오류가 없어요/);
    assert.equal((await f.db.select().from(webRequestErrors)).length, 0);
});
