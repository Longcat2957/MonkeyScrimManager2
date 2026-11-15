import assert from 'node:assert/strict';
import test from 'node:test';
import { unflatten } from 'devalue';
import { and, eq } from 'drizzle-orm';
import { withdrawAccount } from '../../../../src/lib/server/accounts/privacy.ts';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { createHttpRecordSeasonsFixture } from '../../support/http-record-seasons-fixtures.ts';
import { HTTP_IDS } from '../../support/http.ts';

type Fixture = Awaited<ReturnType<typeof createHttpRecordSeasonsFixture>>;
async function pageData<T>(f: Fixture, path: string, cookie?: string): Promise<T> {
    const [pathname, query] = path.split('?');
    const response = await f.request(
        pathname + '/__data.json' + (query ? '?' + query : ''),
        cookie ? { headers: { cookie } } : undefined
    );
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { nodes: ({ type: string; data?: unknown[] } | null)[] };
    const node = payload.nodes.toReversed().find((entry) => entry?.type === 'data' && entry.data);
    assert.ok(node?.data);
    return unflatten(node.data) as T;
}

test('익명 SSR·페이지 데이터·추가 순위에 비공개 원문이 없고 UUID 경로는 실제 기록·MMR을 유지한다', async (t) => {
    const f = await createHttpRecordSeasonsFixture(t, { games: 3 });
    const [target] = await f.db.select().from(schema.users).where(eq(schema.users.id, HTTP_IDS.member));
    const past = 'season=' + f.previousSeason.id;
    type Profile = {
        player: { userId: string; displayName: string; iconUrl: string | null; riotIds: string[] };
        overallGames: number;
        mmr: unknown[];
        history: unknown[];
    };
    const baseline = await pageData<Profile>(f, f.paths.player + '?' + past);
    const scores = await f.db.select().from(schema.userPositionMmr);
    await f.db
        .update(schema.users)
        .set({ publicProfile: false, publicRiotIds: false })
        .where(eq(schema.users.id, HTTP_IDS.member));
    const publicPath = f.paths.home + '/players/' + target!.publicId;
    const profile = await pageData<Profile>(f, publicPath + '?' + past);
    assert.equal(profile.player.userId, target!.publicId);
    assert.equal(profile.player.displayName, '비공개 사용자');
    assert.equal(profile.player.iconUrl, null);
    assert.deepEqual(profile.player.riotIds, []);
    assert.equal(profile.overallGames, 3);
    assert.deepEqual(profile.mmr, baseline.mmr);
    assert.equal(profile.history.length, baseline.history.length);
    const scrim = f.paths.home + '/scrims/' + f.scrim.id;
    const paths = [
        f.paths.home + '?' + past,
        f.paths.stats + '?' + past + '&min=1',
        publicPath + '?' + past,
        f.path,
        f.paths.home + '/scrims',
        scrim,
        scrim + '/manual',
        scrim + '/result'
    ];
    const forbidden = [HTTP_IDS.member, target!.username, f.identities[0]!.gameName];
    for (const path of paths) {
        const ssr = await f.request(path);
        assert.equal(ssr.status, 200, path);
        const source = await ssr.text();
        for (const value of forbidden) assert.equal(source.includes(value), false, path + ': SSR 개인정보');
        const data = JSON.stringify(await pageData<unknown>(f, path));
        for (const value of forbidden)
            assert.equal(data.includes(value), false, path + ': 페이지 자료 개인정보');
    }
    // 완료된 내전의 대진 경로는 기존 정책대로 결과 화면으로 보낸다.
    const bracket = await f.request(scrim + '/bracket');
    assert.equal(bracket.status, 307);
    assert.equal(
        new URL(bracket.headers.get('location')!, f.url + scrim + '/bracket').pathname,
        scrim + '/result'
    );
    const bracketData = await f.request(scrim + '/bracket/__data.json');
    assert.equal(bracketData.status, 200);
    const redirected = (await bracketData.json()) as { type: string; location: string };
    assert.equal(redirected.type, 'redirect');
    assert.equal(new URL(redirected.location, f.url + scrim + '/bracket').pathname, scrim + '/result');
    const ranking = await f.request(f.paths.ranking + '?' + past + '&position=top&offset=0');
    assert.equal(ranking.status, 200);
    const body = (await ranking.json()) as {
        entries: { userId: string; identityKey: string; mmr: number }[];
    };
    assert.ok(
        body.entries.some(
            (entry) => entry.userId === target!.publicId && entry.identityKey === target!.publicId
        )
    );
    assert.equal((await f.request(f.paths.player + '?' + past)).status, 404);
    assert.equal(
        (await f.request(f.paths.player + '?' + past, { headers: { cookie: f.participant.cookie } })).status,
        200
    );
    assert.equal(
        (await f.request(f.paths.player + '?' + past, { headers: { cookie: f.manager.cookie } })).status,
        200
    );
    await f.db
        .delete(schema.guildMembers)
        .where(
            and(
                eq(schema.guildMembers.guildId, HTTP_IDS.otherGuild),
                eq(schema.guildMembers.userId, HTTP_IDS.member)
            )
        );
    assert.equal((await f.request('/g/' + HTTP_IDS.otherGuild + '/players/' + target!.publicId)).status, 404);
    assert.deepEqual(await f.db.select().from(schema.userPositionMmr), scores);
});

test('탈퇴된 실제 참가자는 소속·계정 연결 없이 같은 공개 UUID의 과거 시즌 결과를 계속 읽는다', async (t) => {
    const f = await createHttpRecordSeasonsFixture(t, { games: 3 });
    const [target] = await f.db.select().from(schema.users).where(eq(schema.users.id, HTTP_IDS.member));
    const publicPath = f.paths.home + '/players/' + target!.publicId + '?season=' + f.previousSeason.id;
    type Profile = {
        player: { userId: string; displayName: string; riotIds: string[] };
        overallGames: number;
        mmr: unknown[];
    };
    const baseline = await pageData<Profile>(f, publicPath);
    const scores = await f.db.select().from(schema.userPositionMmr);
    const originals = await f.db.select().from(schema.gameParticipants);
    await withdrawAccount(f.db, { userId: HTTP_IDS.member, isServiceAdmin: false }, { confirm: true });
    const profile = await pageData<Profile>(f, publicPath);
    assert.equal(profile.player.userId, target!.publicId);
    assert.equal(profile.player.displayName, '탈퇴한 사용자');
    assert.deepEqual(profile.player.riotIds, []);
    assert.equal(profile.overallGames, 3);
    assert.deepEqual(profile.mmr, baseline.mmr);
    const payload = JSON.stringify(profile);
    for (const value of [HTTP_IDS.member, target!.username, f.identities[0]!.gameName])
        assert.equal(payload.includes(value), false);
    assert.equal((await f.request(f.paths.player + '?season=' + f.previousSeason.id)).status, 404);
    assert.equal((await f.request(publicPath, { headers: { cookie: f.participant.cookie } })).status, 200);
    assert.deepEqual(await f.db.select().from(schema.userPositionMmr), scores);
    assert.deepEqual(await f.db.select().from(schema.gameParticipants), originals);
});
