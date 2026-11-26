import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { createHttpFixture, HTTP_IDS } from '../../support/http.ts';

test('HTTP: 실제 서버의 모집·경기·전적·통계를 로그인 없이 열람한다', async (t) => {
    const f = await createHttpFixture(t);
    const [scrim] = await f.db
        .insert(schema.scrims)
        .values({ guildId: HTTP_IDS.guild, title: '공개 HTTP 내전', mmrSeasonId: f.season.id })
        .returning();
    const avatarHash = 'abcdef0123456789abcdef0123456789';
    const avatar = `https://cdn.discordapp.com/avatars/${HTTP_IDS.member}/${avatarHash}.webp?size=128`;
    const [person] = await f.db
        .insert(schema.scrimParticipants)
        .values({ scrimId: scrim!.id, userId: HTTP_IDS.member, displayName: '공개 전적 사용자' })
        .returning();
    await f.db.insert(schema.scrimParticipantRegistrations).values({
        scrimParticipantId: person!.id,
        status: 'selected'
    });
    await f.db
        .update(schema.users)
        .set({ globalName: '공개 전적 사용자', avatarHash })
        .where(eq(schema.users.id, HTTP_IDS.member));
    for (const path of [
        '/g/' + HTTP_IDS.guild,
        '/g/' + HTTP_IDS.guild + '/scrims',
        '/g/' + HTTP_IDS.guild + '/scrims/' + scrim!.id,
        '/g/' + HTTP_IDS.guild + '/matches',
        '/g/' + HTTP_IDS.guild + '/stats',
        '/g/' + HTTP_IDS.guild + '/players/' + HTTP_IDS.member
    ]) {
        await t.test(path, async () => {
            const response = await f.request(path);
            assert.equal(response.status, 200);
            assert.match(response.headers.get('content-type') ?? '', /text\/html/);
            const html = await response.text();
            assert.doesNotMatch(html, /Internal Error|fixture-bot-token|fixture-oauth-secret/);
            if (path.includes('/scrims')) assert.match(html, /공개 HTTP 내전/);
            if (path.includes('/players/')) assert.match(html, /공개 전적 사용자/);
            if (path.includes('/scrims') || path.includes('/players/'))
                assert.ok(html.includes(`src="${avatar}"`), `${path}: 공개 선수 사진이 표시되어야 한다`);
        });
    }
    await f.db.update(schema.users).set({ publicProfile: false }).where(eq(schema.users.id, HTTP_IDS.member));
    const privateRoster = await f.request(`/g/${HTTP_IDS.guild}/scrims/${scrim!.id}`);
    assert.equal(privateRoster.status, 200);
    const privateHtml = await privateRoster.text();
    assert.match(privateHtml, /비공개 사용자/);
    assert.ok(!privateHtml.includes(avatarHash));
});

test('HTTP: 다른 서버의 내전 ID와 운영 빌드의 개발 샘플은 404다', async (t) => {
    const f = await createHttpFixture(t);
    const [scrim] = await f.db
        .insert(schema.scrims)
        .values({ guildId: HTTP_IDS.guild, title: '서버 경계' })
        .returning();
    assert.equal((await f.request('/g/' + HTTP_IDS.otherGuild + '/scrims/' + scrim!.id)).status, 404);
    assert.equal((await f.request('/g/devGuild001/scrims')).status, 404);
    assert.equal((await f.request('/dev/landing')).status, 404);
    const home = await f.request('/');
    assert.equal(home.status, 200);
    assert.match(await home.text(), /내전 상황판/);
});

test('HTTP: 순위 endpoint는 공개 JSON을 반환하고 잘못된 URL 상태를 거절한다', async (t) => {
    const f = await createHttpFixture(t);
    const path = '/g/' + HTTP_IDS.guild + '/ranking';
    const response = await f.request(path + '?position=mid&offset=0');
    assert.equal(response.status, 200);
    const page = await response.json();
    assert.deepEqual(page, { entries: [], me: null, hasMore: false });
    for (const query of ['position=unknown&offset=0', 'position=mid&offset=-1', 'position=mid&offset=1.5']) {
        assert.equal((await f.request(path + '?' + query)).status, 400);
    }
    await f.db
        .update(schema.mmrSeasons)
        .set({ endedAt: new Date() })
        .where(eq(schema.mmrSeasons.id, f.season.id));
    assert.equal((await f.request(path + '?position=mid&offset=0')).status, 404);
});

test('HTTP: 서버 관리 권한 없이는 관리 페이지에 접근하지 못한다', async (t) => {
    const f = await createHttpFixture(t);
    for (const [name, userId] of [
        ['일반 멤버', HTTP_IDS.member],
        ['서비스 운영자', HTTP_IDS.serviceAdmin]
    ] as const) {
        await t.test(name, async () => {
            const { cookie } = await f.session(userId);
            const response = await f.request('/g/' + HTTP_IDS.guild + '/admin', { headers: { cookie } });
            assert.equal(response.status, 403);
        });
    }
});
