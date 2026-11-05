import assert from 'node:assert/strict';
import test from 'node:test';
import { and, eq } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { createHttpFixture, HTTP_IDS, type UpstreamRule } from '../../support/http.ts';

type Fixture = Awaited<ReturnType<typeof createHttpFixture>>;
type DataNode = { type: string; data?: unknown[]; uses?: { url?: number } };
const guildPath = '/g/' + HTTP_IDS.guild;
const memberUrl = 'https://discord.com/api/v10/guilds/' + HTTP_IDS.guild + '/members/';

async function createScrim(f: Fixture) {
    const [scrim] = await f.db
        .insert(schema.scrims)
        .values({ guildId: HTTP_IDS.guild, title: '권한 갱신 내전', mmrSeasonId: f.season.id })
        .returning();
    return guildPath + '/scrims/' + scrim!.id;
}

function memberWhere(userId: string) {
    return and(eq(schema.guildMembers.guildId, HTTP_IDS.guild), eq(schema.guildMembers.userId, userId));
}

async function expire(f: Fixture, userId = HTTP_IDS.manager) {
    await f.db
        .update(schema.guildMembers)
        .set({ syncedAt: new Date(Date.now() - 61_000) })
        .where(memberWhere(userId));
}

function discordCalls(f: Fixture) {
    return f.upstreamCalls.filter((path) => path.startsWith('https://discord.com/'));
}

async function warmGuildList(f: Fixture, cookie: string) {
    const response = await f.request('/', { headers: { cookie } });
    assert.equal(response.status, 200);
    await response.text();
    f.upstreamCalls.length = 0;
}

async function readData(f: Fixture, path: string, invalidated: string, cookie?: string) {
    const response = await f.request(path + '/__data.json?x-sveltekit-invalidated=' + invalidated, {
        headers: cookie ? { cookie } : {}
    });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { type: string; nodes: DataNode[] };
    assert.equal(payload.type, 'data');
    return payload.nodes;
}

/** SvelteKit data 응답의 참조 배열에서 해당 load가 반환한 문맥의 권한만 읽는다. */
function permission(node: DataNode | undefined, context: 'guild' | 'scrim') {
    assert.equal(node?.type, 'data');
    const values = node!.data!;
    const root = values[0] as Record<string, number>;
    const record = values[root[context]!] as Record<string, number>;
    return values[record[context === 'guild' ? 'isAdmin' : 'canManage']!];
}

test('HTTP: 61초 지난 운영 권한은 공개 GET과 상위 layout 재사용 이동 전에 갱신된다', async (t) => {
    const f = await createHttpFixture(t);
    const path = await createScrim(f);
    const { cookie } = await f.session(HTTP_IDS.manager);
    await warmGuildList(f, cookie);
    await expire(f);
    const response = await f.request(path, { headers: { cookie } });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /운영 메뉴/);
    assert.deepEqual(discordCalls(f), [
        memberUrl + HTTP_IDS.manager,
        'https://discord.com/api/v10/guilds/' + HTTP_IDS.guild
    ]);

    await expire(f);
    // 루트·서버 layout을 재사용하는 요청에서도 내전 조회보다 먼저 권한을 갱신한다.
    const reused = await readData(f, path, '0011', cookie);
    assert.equal(reused[0]?.type, 'skip');
    assert.equal(reused[1]?.type, 'skip');
    assert.equal(permission(reused[2], 'scrim'), true);
    assert.equal(permission(reused[3], 'scrim'), true);
    const refreshed = await f.db.query.guildMembers.findFirst({ where: memberWhere(HTTP_IDS.manager) });
    assert.ok(refreshed?.syncedAt && Date.now() - refreshed.syncedAt.getTime() < 60_000);
    assert.equal(discordCalls(f).length, 4);

    const current = await readData(f, path, '0111', cookie);
    assert.equal(permission(current[1], 'guild'), true);
    assert.equal(permission(current[2], 'scrim'), true);
    assert.equal(current[1]?.uses?.url, 1);
    assert.equal(current[2]?.uses?.url, 1);
    assert.equal(discordCalls(f).length, 4, '갱신 직후 다시 읽을 때 Discord를 중복 조회하지 않는다.');
});

test('HTTP: 운영 권한 회수는 내부 이동의 서버·내전·페이지 문맥에 함께 반영된다', async (t) => {
    const f = await createHttpFixture(t);
    const path = await createScrim(f);
    const { cookie } = await f.session(HTTP_IDS.member);
    await warmGuildList(f, cookie);
    await f.db
        .update(schema.guildMembers)
        .set({ manageGuild: true, isAdmin: true })
        .where(memberWhere(HTTP_IDS.member));
    const initial = await readData(f, path, '0111', cookie);
    assert.equal(permission(initial[1], 'guild'), true);
    assert.equal(permission(initial[2], 'scrim'), true);
    await expire(f, HTTP_IDS.member);

    const revoked = await readData(f, path, '0111', cookie);
    assert.equal(permission(revoked[1], 'guild'), false);
    assert.equal(permission(revoked[2], 'scrim'), false);
    assert.equal(permission(revoked[3], 'scrim'), false);
    const membership = await f.db.query.guildMembers.findFirst({ where: memberWhere(HTTP_IDS.member) });
    assert.equal(membership?.manageGuild, false);
    assert.equal(membership?.isAdmin, false);
    assert.ok(membership?.syncedAt && Date.now() - membership.syncedAt.getTime() < 60_000);
    assert.equal(discordCalls(f).length, 2);
});

test('HTTP: 탈퇴한 운영자의 공개 열람은 유지하고 소속과 운영 권한을 제거한다', async (t) => {
    const f = await createHttpFixture(t, [
        { method: 'GET', url: memberUrl + HTTP_IDS.manager, status: 404, body: {} }
    ]);
    const path = await createScrim(f);
    const { cookie } = await f.session(HTTP_IDS.manager);
    await warmGuildList(f, cookie);
    // 이전 방문 이후 탈퇴했지만 아직 서버에 남아 있는 소속 캐시를 재현한다.
    await f.db.insert(schema.guildMembers).values({
        guildId: HTTP_IDS.guild,
        userId: HTTP_IDS.manager,
        manageGuild: true,
        isAdmin: true,
        roleIds: [],
        syncedAt: new Date(Date.now() - 61_000)
    });
    const nodes = await readData(f, path, '0111', cookie);
    assert.equal(permission(nodes[1], 'guild'), false);
    assert.equal(permission(nodes[2], 'scrim'), false);
    assert.equal(permission(nodes[3], 'scrim'), false);
    assert.equal(
        await f.db.query.guildMembers.findFirst({ where: memberWhere(HTTP_IDS.manager) }),
        undefined
    );
    const response = await f.request(path, { headers: { cookie } });
    assert.equal(response.status, 200);
    assert.doesNotMatch(await response.text(), /운영 메뉴/);
    assert.deepEqual(discordCalls(f), [memberUrl + HTTP_IDS.manager]);
});

test('HTTP: Discord 503이면 공개 HTML과 내부 이동은 200이며 만료된 권한은 비활성이다', async (t) => {
    const outage: UpstreamRule = { method: 'GET', url: memberUrl + HTTP_IDS.manager, status: 503, body: {} };
    const f = await createHttpFixture(t, [outage]);
    const path = await createScrim(f);
    const { cookie } = await f.session(HTTP_IDS.manager);
    await expire(f);
    const response = await f.request(path, { headers: { cookie } });
    assert.equal(response.status, 200);
    assert.doesNotMatch(await response.text(), /운영 메뉴/);
    const nodes = await readData(f, path, '0111', cookie);
    assert.equal(permission(nodes[1], 'guild'), false);
    assert.equal(permission(nodes[2], 'scrim'), false);
    assert.equal(permission(nodes[3], 'scrim'), false);
    const membership = await f.db.query.guildMembers.findFirst({ where: memberWhere(HTTP_IDS.manager) });
    assert.ok(membership?.syncedAt && Date.now() - membership.syncedAt.getTime() > 60_000);
    assert.ok(discordCalls(f).includes(memberUrl + HTTP_IDS.manager));
});

test('HTTP: 비로그인 사용자는 공개 열람과 내부 이동 중 Discord를 조회하지 않는다', async (t) => {
    const f = await createHttpFixture(t);
    const path = await createScrim(f);
    await expire(f);
    const response = await f.request(path);
    assert.equal(response.status, 200);
    assert.doesNotMatch(await response.text(), /운영 메뉴/);
    const nodes = await readData(f, path, '0111');
    assert.equal(permission(nodes[1], 'guild'), false);
    assert.equal(permission(nodes[2], 'scrim'), false);
    assert.equal(permission(nodes[3], 'scrim'), false);
    assert.deepEqual(discordCalls(f), []);
});
