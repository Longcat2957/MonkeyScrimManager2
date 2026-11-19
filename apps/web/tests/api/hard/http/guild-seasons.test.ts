import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { unflatten } from 'devalue';
import { and, eq, isNull } from 'drizzle-orm';
import type { GuildSeasonOverview } from '../../../../src/lib/features/seasons.ts';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { createHttpMatchResultFixture } from '../../support/http-match-fixtures.ts';
import { assertAction, createHttpFixture, HTTP_BOT_TOKEN, HTTP_IDS } from '../../support/http.ts';

type Fixture = Awaited<ReturnType<typeof createHttpFixture>>;
const adminPath = '/g/' + HTTP_IDS.guild + '/admin';
const botPath = '/internal/bot/guilds/' + HTTP_IDS.guild + '/seasons';
const memberUrl = 'https://discord.com/api/v10/guilds/' + HTTP_IDS.guild + '/members/';

const fields = (id: string, name = '새 웹 시즌') => ({
    expectedCurrentSeasonId: id,
    name,
    confirm: 'true'
});

async function overview(f: Fixture, cookie: string, guildId: string = HTTP_IDS.guild) {
    const response = await f.request('/g/' + guildId + '/admin/__data.json?tab=seasons', {
        headers: { cookie }
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    const payload = (await response.json()) as { nodes: ({ type: string; data?: unknown[] } | null)[] };
    for (const node of payload.nodes.toReversed()) {
        if (node?.type !== 'data' || !node.data) continue;
        const value = unflatten(node.data) as {
            tab?: string;
            seasons?: GuildSeasonOverview | null;
            members?: unknown[];
            discord?: unknown;
            audit?: unknown;
        };
        if (value.tab !== 'seasons' || !value.seasons) continue;
        assert.deepEqual(value.members, []);
        assert.equal(value.discord, null);
        assert.equal(value.audit, null);
        return value.seasons;
    }
    assert.fail('시즌 관리의 현재·종료 시즌 자료가 없습니다.');
}

async function deniedRead(f: Fixture, status: number, cookie?: string) {
    const headers = cookie ? { cookie } : undefined;
    const page = await f.request(adminPath + '?tab=seasons', { headers });
    assert.equal(page.status, status);
    const response = await f.request(adminPath + '/__data.json?tab=seasons', { headers });
    const text = await response.text();
    assert.equal(text.includes(f.season.id), false);
    const payload = JSON.parse(text) as {
        nodes?: ({ type?: string; error?: { status?: number } } | null)[];
    };
    assert.ok(
        response.status === status ||
            payload.nodes?.some((node) => node?.type === 'error' && node.error?.status === status)
    );
}

async function preserved(f: Fixture) {
    return Promise.all([
        f.db.select().from(schema.scrims),
        f.db.select().from(schema.matches),
        f.db.select().from(schema.games),
        f.db.select().from(schema.gameParticipants),
        f.db.select().from(schema.matchLineups),
        f.db.select().from(schema.matchLineupPlayers),
        f.db.select().from(schema.gameMmrApplications),
        f.db.select().from(schema.mmrLedgerEntries),
        f.db.select().from(schema.userPositionMmr),
        f.db.select().from(schema.roflMetadata),
        f.db.select().from(schema.roflGameDataV1),
        f.db.select().from(schema.roflParticipantDataV1),
        f.db.select().from(schema.matchRoflImports)
    ]);
}

test('웹 시즌 관리의 SSR·부분 자료·전환은 실효 서버 관리자만 허용하며 서비스 운영자나 위조 실행자를 거절한다', async (t) => {
    const f = await createHttpFixture(t);
    const manager = await f.session(HTTP_IDS.manager);
    const member = await f.session(HTTP_IDS.member);
    const serviceAdmin = await f.session(HTTP_IDS.serviceAdmin);
    await deniedRead(f, 401);
    await deniedRead(f, 403, member.cookie);
    await deniedRead(f, 403, serviceAdmin.cookie);
    assertAction(await f.action(adminPath, 'rotateSeason', fields(f.season.id)), 401);
    for (const cookie of [member.cookie, serviceAdmin.cookie])
        assertAction(
            await f.action(
                adminPath,
                'rotateSeason',
                { ...fields(f.season.id), actorId: HTTP_IDS.manager, guildId: HTTP_IDS.otherGuild },
                cookie
            ),
            403
        );
    const allowed = await f.request(adminPath + '?tab=seasons', { headers: { cookie: manager.cookie } });
    assert.equal(allowed.status, 200);
    assert.match(allowed.headers.get('cache-control') ?? '', /no-store/);
    assert.equal((await overview(f, manager.cookie)).current!.id, f.season.id);
    assert.equal((await f.db.select().from(schema.mmrSeasons)).length, 1);
    assert.deepEqual(await f.db.select().from(schema.discordInteractionReceipts), []);
});

test('웹 전환은 기존 ROFL·MMR·내전 시즌을 보존하고 이후 기존 경기와 새 모집을 각각 원래·새 시즌에 귀속한다', async (t) => {
    const f = await createHttpMatchResultFixture(t);
    assertAction(await f.record(), 200);
    const before = await preserved(f);
    assertAction(
        await f.action(adminPath, 'rotateSeason', fields(f.season.id, '  새 웹 시즌  '), f.manager.cookie),
        200
    );
    const next = await overview(f, f.manager.cookie);
    assert.ok(next.current);
    assert.notEqual(next.current.id, f.season.id);
    assert.equal(next.current.name, '새 웹 시즌');
    assert.equal(next.completed.length, 1);
    assert.equal(next.completed[0]!.id, f.season.id);
    assert.equal(next.completed[0]!.endedAt, next.current.startedAt);
    assert.deepEqual(await preserved(f), before);
    assert.deepEqual(await f.db.select().from(schema.discordInteractionReceipts), []);
    assertAction(await f.record(2, f.file(1_900_125)), 200);
    const scores = await f.db.select().from(schema.userPositionMmr);
    assert.equal(scores.length, 10);
    assert.ok(scores.every((row) => row.seasonId === f.season.id));
    assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 20);
    assert.equal(
        (await f.db.select().from(schema.scrims).where(eq(schema.scrims.id, f.scrim.id)))[0]!.mmrSeasonId,
        f.season.id
    );
    const newTitle = '시즌 전환 후 새 모집';
    assertAction(
        await f.action(
            '/g/' + HTTP_IDS.guild + '/scrims',
            'create',
            {
                title: newTitle,
                date: '',
                time: '',
                teamCount: '2',
                reserveCapacity: '2',
                hardFearless: 'false',
                requestId: randomUUID()
            },
            f.manager.cookie
        ),
        200
    );
    const [created] = await f.db.select().from(schema.scrims).where(eq(schema.scrims.title, newTitle));
    assert.equal(created!.mmrSeasonId, next.current.id);
});

test('잘못된 전환 입력·교차 출처·다른 서버 현재 ID·오래된 선택은 시즌이나 봇 receipt를 추가하지 않는다', async (t) => {
    const f = await createHttpFixture(t);
    const manager = await f.session(HTTP_IDS.manager);
    const initial = await f.db.select().from(schema.mmrSeasons);
    for (const overrides of [
        { name: '' },
        { name: '  ' },
        { name: '가'.repeat(101) },
        { confirm: 'false' },
        { confirm: 'true ' },
        { expectedCurrentSeasonId: 'not-a-season' }
    ])
        assertAction(
            await f.action(
                adminPath,
                'rotateSeason',
                { ...fields(f.season.id), ...overrides },
                manager.cookie
            ),
            400
        );
    const crossSite = await f.request(adminPath + '?/rotateSeason', {
        method: 'POST',
        body: new URLSearchParams(fields(f.season.id)),
        headers: { cookie: manager.cookie, origin: 'https://other.invalid', accept: 'application/json' }
    });
    assert.equal(crossSite.status, 403);
    const [foreign] = await f.db
        .insert(schema.mmrSeasons)
        .values({ guildId: HTTP_IDS.otherGuild, name: '다른 서버 현재 시즌' })
        .returning();
    assertAction(await f.action(adminPath, 'rotateSeason', fields(foreign!.id), manager.cookie), 409);
    assert.deepEqual(
        await f.db.select().from(schema.mmrSeasons).where(eq(schema.mmrSeasons.guildId, HTTP_IDS.guild)),
        initial
    );
    assertAction(await f.action(adminPath, 'rotateSeason', fields(f.season.id), manager.cookie), 200);
    const after = await overview(f, manager.cookie);
    assertAction(await f.action(adminPath, 'rotateSeason', fields(f.season.id), manager.cookie), 409);
    assert.deepEqual(await overview(f, manager.cookie), after);
    const retainedName = '입력 보존용 다시 확인';
    const native = await f.request(adminPath + '?tab=seasons&/rotateSeason', {
        method: 'POST',
        body: new URLSearchParams(fields(f.season.id, retainedName)),
        headers: { cookie: manager.cookie, origin: f.origin, accept: 'text/html' }
    });
    assert.equal(native.status, 409);
    const html = await native.text();
    assert.ok(html.includes('value="' + retainedName + '"'));
    assert.match(html, /현재 시즌/);
    assert.equal(
        (await f.db.select().from(schema.mmrSeasons).where(eq(schema.mmrSeasons.guildId, HTTP_IDS.guild)))
            .length,
        2
    );
    assert.deepEqual(await f.db.select().from(schema.discordInteractionReceipts), []);
});

test('웹·봇의 동시 전환은 한 번만 커밋하며 실제 봇이 성공한 경우에만 재전송 receipt를 남긴다', async (t) => {
    const f = await createHttpFixture(t);
    const manager = await f.session(HTTP_IDS.manager);
    const input = {
        actorId: HTTP_IDS.manager,
        interactionId: '996000000000000051',
        expectedCurrentSeasonId: f.season.id,
        name: '봇 동시 전환',
        confirm: true
    };
    const bot = () =>
        f.request(botPath, {
            method: 'POST',
            headers: { authorization: 'Bearer ' + HTTP_BOT_TOKEN, 'content-type': 'application/json' },
            body: JSON.stringify(input)
        });
    const [web, reply] = await Promise.all([
        f.action(adminPath, 'rotateSeason', fields(f.season.id, '웹 동시 전환'), manager.cookie),
        bot()
    ]);
    assert.deepEqual(
        [web.response.status, reply.status].sort((a, b) => a - b),
        [200, 409]
    );
    const current = await overview(f, manager.cookie);
    assert.equal(current.completed.length, 1);
    assert.notEqual(current.current!.id, f.season.id);
    const active = await f.db
        .select()
        .from(schema.mmrSeasons)
        .where(and(eq(schema.mmrSeasons.guildId, HTTP_IDS.guild), isNull(schema.mmrSeasons.endedAt)));
    assert.equal(active.length, 1);
    const receipts = await f.db.select().from(schema.discordInteractionReceipts);
    if (reply.status === 200) {
        assertAction(web, 409);
        assert.equal(current.current!.name, input.name);
        assert.equal(receipts.length, 1);
        assert.equal(receipts[0]!.interactionId, input.interactionId);
        const result = await reply.json();
        const repeated = await bot();
        assert.equal(repeated.status, 200);
        assert.deepEqual(await repeated.json(), result);
    } else {
        assertAction(web, 200);
        assert.equal(current.current!.name, '웹 동시 전환');
        assert.deepEqual(receipts, []);
        assert.equal((await bot()).status, 409);
    }
    assert.equal((await f.db.select().from(schema.mmrSeasons)).length, 2);
});

test('시즌이 없는 서버의 웹 조회와 전환은 최초 시즌을 임의로 초기화하지 않는다', async (t) => {
    const f = await createHttpFixture(t);
    const manager = await f.session(HTTP_IDS.manager);
    await f.db.delete(schema.mmrSeasons).where(eq(schema.mmrSeasons.id, f.season.id));
    assert.deepEqual(await overview(f, manager.cookie), { current: null, completed: [] });
    assertAction(await f.action(adminPath, 'rotateSeason', fields(f.season.id), manager.cookie), 409);
    assert.deepEqual(await f.db.select().from(schema.mmrSeasons), []);
    assert.deepEqual(await f.db.select().from(schema.discordInteractionReceipts), []);
});

test('방금 저장된 관리자 힌트도 실제 Discord 권한이 없으면 시즌 조회·전환을 허용하지 않는다', async (t) => {
    const f = await createHttpFixture(t);
    const member = await f.session(HTTP_IDS.member);
    const grantHint = () =>
        f.db
            .update(schema.guildMembers)
            .set({
                manageGuild: true,
                isAdmin: true,
                syncedAt: new Date()
            })
            .where(
                and(
                    eq(schema.guildMembers.guildId, HTTP_IDS.guild),
                    eq(schema.guildMembers.userId, HTTP_IDS.member)
                )
            );
    await grantHint();
    await deniedRead(f, 403, member.cookie);
    await grantHint();
    f.upstreamCalls.length = 0;
    assertAction(await f.action(adminPath, 'rotateSeason', fields(f.season.id), member.cookie), 403);
    assert.ok(f.upstreamCalls.includes(memberUrl + HTTP_IDS.member));
    assert.equal((await f.db.select().from(schema.mmrSeasons)).length, 1);
    assert.deepEqual(await f.db.select().from(schema.discordInteractionReceipts), []);
});

test('실시간 권한 확인 실패는 오래된 관리자 캐시로 우회하지 않고 기존 시즌을 보존한다', async (t) => {
    const f = await createHttpFixture(t, [
        { method: 'GET', url: memberUrl + HTTP_IDS.manager, status: 503, body: {} }
    ]);
    const manager = await f.session(HTTP_IDS.manager);
    const initial = await f.db.select().from(schema.mmrSeasons);
    await deniedRead(f, 502, manager.cookie);
    assertAction(await f.action(adminPath, 'rotateSeason', fields(f.season.id), manager.cookie), 502);
    assert.deepEqual(await f.db.select().from(schema.mmrSeasons), initial);
    assert.deepEqual(await f.db.select().from(schema.discordInteractionReceipts), []);
});
