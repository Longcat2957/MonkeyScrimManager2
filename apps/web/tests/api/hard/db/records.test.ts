import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { and, eq } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { getGuildRecords, getPlayerRecords } from '../../../../src/lib/server/records/queries.ts';
import { summarize } from '../../../../src/lib/features/players/stats.ts';
import { champion, createGameFixture, errorCode } from '../../support/domain-fixtures.ts';

async function fixture(t: TestContext) {
    const f = await createGameFixture(t);
    const first = await f.createGame(f.db, 1, f.match.id, 'a', {
        startedAt: new Date('2026-01-01T00:00:00Z')
    });
    await f.apply(first.id);
    const second = await f.createGame(f.db, 2, f.match.id, 'b', { missingStats: true });
    await f.apply(second.id);
    const profile = () => getPlayerRecords(f.db, null, f.guildId, f.manager.userId, champion);
    const records = () => getGuildRecords(f.db, null, f.guildId, champion);
    return { ...f, first, second, profile, records };
}

test('공개 전적은 완료 Game·실출전만 집계하고 실제 0과 누락 null을 보존한다', async (t) => {
    const f = await fixture(t);
    const pending = await f.createGame(f.db, 3);
    await f.db
        .update(schema.games)
        .set({ status: 'pending', winnerSide: null })
        .where(eq(schema.games.id, pending.id));
    const records = await f.records();
    assert.equal(records.recordedGames.length, 2);
    assert.equal(records.players.length, 10);
    assert.equal(records.allGames.length, 20);
    assert.deepEqual(
        records.recordedGames.map((game) => game.kills),
        [18, null]
    );
    const profile = await f.profile();
    assert.equal(profile.games[0]?.playedAt, '2026-01-01T00:00:00.000Z');
    assert.equal(profile.games[0]?.kills, 0);
    assert.equal(profile.games[0]?.teamKills, 8);
    assert.equal(profile.games[1]?.playedAt, null);
    assert.equal(profile.games[1]?.kills, null);
    assert.equal(profile.games[1]?.teamKills, null);
    assert.equal(profile.games[1]?.champion.id, 'unknown');
    assert.equal(profile.games[0]?.teammates.length, 4);
    assert.ok(profile.games[0]?.teammates.every((teammate) => teammate.userId !== f.manager.userId));
    assert.equal(summarize(profile.games)?.wins, 1);
    assert.equal(summarize(profile.games)?.winStreak, null);
    assert.equal(profile.mmr.find((rating) => rating.position === 'top')?.games, 2);
    assert.equal(
        profile.mmr.find((rating) => rating.position === 'top')?.rating,
        (await f.ratings())[0]!.mmr
    );
});

test('현재 Riot 계정 소유자가 바뀌어도 과거 출전자는 재귀속하지 않는다', async (t) => {
    const f = await fixture(t);
    await f.db
        .update(schema.guildRiotAccounts)
        .set({ userId: f.users[1]!.id, isPrimary: false })
        .where(
            and(
                eq(schema.guildRiotAccounts.guildId, f.guildId),
                eq(schema.guildRiotAccounts.riotAccountId, f.accounts[0]!.id)
            )
        );
    await f.db.insert(schema.guildRiotAccounts).values({
        guildId: f.otherGuildId,
        userId: f.manager.userId,
        riotAccountId: f.accounts[0]!.id,
        isPrimary: true
    });
    const oldOwner = await f.profile();
    assert.deepEqual(oldOwner.player.riotIds, []);
    assert.equal(oldOwner.games.length, 2);
    assert.equal(oldOwner.games[0]?.position, 'top');
    const newOwner = await getPlayerRecords(f.db, null, f.guildId, f.users[1]!.id, champion);
    assert.equal(newOwner.games.length, 2);
    assert.equal(newOwner.games[0]?.position, 'jungle');
    assert.deepEqual(newOwner.player.riotIds, ['선수1#KR1', '선수0#KR1']);
    const otherGuild = await getPlayerRecords(f.db, null, f.otherGuildId, f.manager.userId, champion);
    assert.deepEqual(otherGuild.games, []);
    assert.deepEqual(otherGuild.mmr, []);
    assert.deepEqual(otherGuild.player.riotIds, ['선수0#KR1']);
});

test('새 시즌은 과거 시즌 기록·점수를 합산하지 않는다', async (t) => {
    const f = await fixture(t);
    await f.db
        .update(schema.mmrSeasons)
        .set({ endedAt: new Date('2026-11-03T12:00:00Z') })
        .where(eq(schema.mmrSeasons.id, f.season.id));
    await f.db.insert(schema.mmrSeasons).values({ guildId: f.guildId, name: '다음 시즌' });
    assert.deepEqual((await f.records()).recordedGames, []);
    const profile = await f.profile();
    assert.deepEqual(profile.games, []);
    assert.equal(profile.mmr.length, 5);
    assert.ok(profile.mmr.every((rating) => rating.rating === 1500 && rating.games === 0));
    assert.equal((await f.ratings()).length, 10);
});

test('활성 시즌이 없으면 임의의 전체 시즌 집계를 만들지 않는다', async (t) => {
    const f = await fixture(t);
    await f.db
        .update(schema.mmrSeasons)
        .set({ endedAt: new Date('2026-11-03T12:00:00Z') })
        .where(eq(schema.mmrSeasons.id, f.season.id));
    assert.deepEqual((await f.records()).recordedGames, []);
    assert.deepEqual((await f.profile()).mmr, []);
});

for (const parent of ['scrim', 'match'] as const)
    test(`취소한 ${parent} 기록은 제외하고 중도 종료의 정상 기록은 유지한다`, async (t) => {
        const f = await fixture(t);
        const table = parent === 'scrim' ? schema.scrims : schema.matches;
        const id = parent === 'scrim' ? f.scrimId : f.match.id;
        await f.db.update(table).set({ status: 'cancelled' }).where(eq(table.id, id));
        assert.equal((await f.records()).allGames.length, 0);
        assert.equal((await f.profile()).mmr.find((rating) => rating.position === 'top')?.games, 0);
        await f.db.update(table).set({ status: 'ended_early' }).where(eq(table.id, id));
        assert.equal((await f.records()).recordedGames.length, 2);
        assert.equal((await f.profile()).mmr.find((rating) => rating.position === 'top')?.games, 2);
    });

for (const broken of ['missingPosition', 'missingParticipant'] as const)
    test(`실출전 ${broken} 불일치는 원장만으로 포지션 경기 수를 늘리지 않는다`, async (t) => {
        const f = await fixture(t);
        const target = and(
            eq(schema.gameParticipants.gameId, f.first.id),
            eq(schema.gameParticipants.scrimParticipantId, f.participants[0]!.id)
        );
        // 정상 반영 후 일부 근거를 손상시켜 조회가 원장만 신뢰하지 않는지 확인한다.
        if (broken === 'missingPosition')
            await f.db.update(schema.gameParticipants).set({ position: null }).where(target);
        else await f.db.delete(schema.gameParticipants).where(target);
        assert.equal((await f.profile()).mmr.find((rating) => rating.position === 'top')?.games, 1);
    });

test('미출전 초기 점수 조회는 DB 행을 생성하지 않고 서버에 없는 사용자는 숨긴다', async (t) => {
    const f = await createGameFixture(t);
    const profile = await getPlayerRecords(f.db, null, f.guildId, f.manager.userId, champion);
    assert.equal(profile.mmr.length, 5);
    assert.ok(profile.mmr.every((rating) => rating.rating === 1500 && rating.games === 0));
    assert.equal((await f.db.select().from(schema.userPositionMmr)).length, 0);
    const stranger = '899999999999999999';
    await f.db.insert(schema.users).values({ id: stranger, username: '다른 서버 사용자' });
    await assert.rejects(getPlayerRecords(f.db, null, f.guildId, stranger, champion), errorCode('NOT_FOUND'));
    assert.deepEqual((await getGuildRecords(f.db, null, f.otherGuildId, champion)).allGames, []);
});
