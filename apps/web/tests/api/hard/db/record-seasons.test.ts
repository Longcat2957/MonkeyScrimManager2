import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { type TestContext } from 'node:test';
import { and, eq, sql } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { queryRankingPage } from '../../../../src/lib/server/guild/ranking-queries.ts';
import { getGuildRecords, getPlayerRecords } from '../../../../src/lib/server/records/queries.ts';
import { getRecordSeasons } from '../../../../src/lib/server/records/seasons.ts';
import { champion, createGameFixture, errorCode } from '../../support/domain-fixtures.ts';

async function fixture(t: TestContext) {
    const f = await createGameFixture(t);
    const game = await f.createGame(f.db, 1);
    await f.apply(game.id);
    await f.db
        .update(schema.mmrSeasons)
        // 테스트 호스트의 시계 대신 DB 시각과 저장된 시작 시각으로 종료 순서를 지킨다.
        .set({ endedAt: sql`greatest(now(), ${schema.mmrSeasons.startedAt})` })
        .where(eq(schema.mmrSeasons.id, f.season.id));
    const [current] = await f.db
        .insert(schema.mmrSeasons)
        .values({ guildId: f.guildId, name: '새 현재 시즌' })
        .returning();
    const records = (seasonId?: string | null) => getGuildRecords(f.db, null, f.guildId, champion, seasonId);
    const player = (seasonId?: string | null) =>
        getPlayerRecords(f.db, null, f.guildId, f.manager.userId, champion, seasonId);
    const rank = (seasonId?: string | null, offset = 0, limit = 10) =>
        queryRankingPage(f.db, null, f.guildId, 'top', { seasonId, offset, limit, userId: f.users[5]!.id });
    return { ...f, game, current: current!, records, player, rank };
}

test('공개 시즌 목록은 현재를 먼저 표시하고 선택한 과거 기록·MMR·순위만 조회한다', async (t) => {
    const f = await fixture(t);
    const before = await f.ratings();
    assert.equal(before.length, 10);
    const selection = await getRecordSeasons(f.db, null, f.guildId);
    assert.equal(selection.selectedSeasonId, f.current.id);
    assert.deepEqual(
        selection.seasons.map((season) => season.id),
        [f.current.id, f.season.id]
    );
    assert.equal((await f.records()).recordedGames.length, 0);
    const current = await f.player();
    assert.deepEqual(current.games, []);
    assert.equal(current.mmr.length, 5);
    assert.ok(current.mmr.every((row) => row.rating === 1500 && row.games === 0));
    assert.deepEqual((await f.rank())!.page.entries, []);
    const old = await f.records(f.season.id.toUpperCase());
    assert.equal(old.selectedSeasonId, f.season.id);
    assert.equal(old.recordedGames[0]!.id, f.game.id);
    const profile = await f.player(f.season.id);
    assert.equal(profile.games.length, 1);
    assert.equal(profile.mmr.find((row) => row.position === 'top')!.rating, 1516);
    assert.equal(profile.mmr.find((row) => row.position === 'top')!.games, 1);
    const ranking = await f.rank(f.season.id, 0, 1);
    assert.equal(ranking!.seasonName, f.season.name);
    assert.equal(ranking!.page.entries[0]!.userId, f.manager.userId);
    assert.equal(ranking!.page.hasMore, true);
    assert.equal(ranking!.page.me!.rank, 2);
    assert.equal((await f.rank(f.season.id, 1, 1))!.page.entries[0]!.userId, f.users[5]!.id);
    assert.deepEqual(await f.ratings(), before);
});

test('활성 시즌이 없어도 명시한 종료 시즌을 읽으며 생략을 전체 시즌으로 바꾸지 않는다', async (t) => {
    const f = await fixture(t);
    await f.db
        .update(schema.mmrSeasons)
        .set({ endedAt: sql`greatest(now(), ${schema.mmrSeasons.startedAt})` })
        .where(eq(schema.mmrSeasons.id, f.current.id));
    assert.equal((await getRecordSeasons(f.db, null, f.guildId)).selectedSeasonId, null);
    assert.deepEqual((await f.records()).recordedGames, []);
    assert.deepEqual((await f.player()).mmr, []);
    assert.equal(await f.rank(), null);
    assert.equal((await f.records(f.season.id)).recordedGames.length, 1);
    assert.equal((await f.rank(f.season.id))!.page.entries.length, 2);
    const empty = await f.player(f.current.id);
    assert.equal(empty.games.length, 0);
    assert.ok(empty.mmr.every((row) => row.games === 0 && row.rating === 1500));
});

test('다른 서버·미존재·잘못된 시즌을 거절하고 현재 멤버 순위 원칙을 보존한다', async (t) => {
    const f = await fixture(t);
    const [other] = await f.db
        .insert(schema.mmrSeasons)
        .values({ guildId: f.otherGuildId, name: '다른 서버 시즌' })
        .returning();
    for (const id of [other!.id, randomUUID()]) {
        await assert.rejects(f.records(id), errorCode('NOT_FOUND'));
        await assert.rejects(f.player(id), errorCode('NOT_FOUND'));
        await assert.rejects(f.rank(id), errorCode('NOT_FOUND'));
    }
    for (const id of ['', 'all', 'invalid']) await assert.rejects(f.records(id), errorCode('INVALID_INPUT'));
    await f.db
        .delete(schema.guildMembers)
        .where(
            and(eq(schema.guildMembers.guildId, f.guildId), eq(schema.guildMembers.userId, f.manager.userId))
        );
    assert.equal((await f.player(f.season.id)).games.length, 1);
    assert.ok(!(await f.rank(f.season.id))!.page.entries.some((row) => row.userId === f.manager.userId));
});

test('시즌 전환 뒤 기존 진행 내전의 새 결과도 고정된 이전 시즌에 남는다', async (t) => {
    const f = await fixture(t);
    const later = await f.createGame(f.db, 2, f.match.id, 'b', { champion: 'Lux' });
    await f.apply(later.id);
    const old = await f.player(f.season.id);
    assert.equal(old.games.length, 2);
    assert.deepEqual(old.games.map((game) => game.champion.id).sort(), ['Ahri', 'Lux']);
    assert.equal((await f.player()).games.length, 0);
    assert.ok(
        (await f.db.select().from(schema.userPositionMmr)).every((row) => row.seasonId === f.season.id)
    );
});
