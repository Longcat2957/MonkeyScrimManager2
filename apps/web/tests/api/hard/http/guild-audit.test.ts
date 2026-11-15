import assert from 'node:assert/strict';
import test from 'node:test';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { assertAction, createHttpFixture, HTTP_IDS } from '../../support/http.ts';

const adminPath = '/g/' + HTTP_IDS.guild + '/admin';

test('HTTP 감사 이력은 관리자만 조회하며 성공한 계정·설정 변경과 같은 서버의 이력만 보여 준다', async (t) => {
    const f = await createHttpFixture(t);
    const manager = await f.session(HTTP_IDS.manager);
    const member = await f.session(HTTP_IDS.member);
    assert.equal((await f.request(adminPath + '?tab=audit')).status, 401);
    assert.equal(
        (await f.request(adminPath + '?tab=audit', { headers: { cookie: member.cookie } })).status,
        403
    );
    const empty = await f.request(adminPath + '?tab=audit', { headers: { cookie: manager.cookie } });
    assert.equal(empty.status, 200);
    assert.match(await empty.text(), /아직 기록된 관리 변경이 없어요/);

    assertAction(
        await f.action(
            adminPath,
            'link',
            { userId: HTTP_IDS.member, riotId: 'HttpPlayer#KR1' },
            manager.cookie
        ),
        204
    );
    assertAction(
        await f.action(
            adminPath,
            'discord',
            { key: 'resultChannelId', value: HTTP_IDS.channel },
            manager.cookie
        ),
        204
    );
    const page = await f.request(adminPath + '?tab=audit', { headers: { cookie: manager.cookie } });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Riot 계정 연결/);
    assert.match(html, /HttpPlayer#KR1/);
    assert.match(html, /Discord 연동 변경/);
    assert.match(html, /결과 채널/);
    assert.ok(!html.includes('fixture-HttpPlayer'), '감사 조회에 PUUID를 보내지 않는다');
    const events = await f.db.select().from(schema.guildAuditEntries);
    assert.equal(events.length, 2);
    assert.ok(events.every((entry) => entry.guildId === HTTP_IDS.guild));

    const other = await f.request('/g/' + HTTP_IDS.otherGuild + '/admin?tab=audit', {
        headers: { cookie: manager.cookie }
    });
    assert.equal(other.status, 200);
    assert.ok(!(await other.text()).includes('HttpPlayer#KR1'));
});

test('HTTP 감사 이력의 부분 데이터도 공개하지 않고 실패·동일 설정 반복은 새 이력을 만들지 않는다', async (t) => {
    const f = await createHttpFixture(t);
    const manager = await f.session(HTTP_IDS.manager);
    const member = await f.session(HTTP_IDS.member);
    const fields = { key: 'resultChannelId', value: HTTP_IDS.channel };
    assertAction(await f.action(adminPath, 'discord', fields, member.cookie), 403);
    assert.equal((await f.db.select().from(schema.guildAuditEntries)).length, 0);
    assertAction(await f.action(adminPath, 'discord', fields, manager.cookie), 204);
    assertAction(await f.action(adminPath, 'discord', fields, manager.cookie), 204);
    assert.equal((await f.db.select().from(schema.guildAuditEntries)).length, 1);
    const denied = await f.request(adminPath + '/__data.json?tab=audit', {
        headers: { cookie: member.cookie }
    });
    const text = await denied.text();
    assert.ok(!text.includes('discord_setting_changed'));
    assert.ok(!text.includes('previousSetting'));
});
