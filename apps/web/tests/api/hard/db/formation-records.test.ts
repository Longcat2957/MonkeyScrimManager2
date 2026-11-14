import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { and, eq, inArray } from 'drizzle-orm';
import { headToHead, pairKey } from '../../../../src/lib/features/scrims/formation.ts';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { formationPairRecords } from '../../../../src/lib/server/scrims/formation-records.ts';
import { getManualFormation } from '../../../../src/lib/server/scrims/manual.ts';
import { createGameFixture, errorCode } from '../../support/domain-fixtures.ts';

async function fixture(t: TestContext) {
    const f = await createGameFixture(t);
    const [target] = await f.db
        .insert(schema.scrims)
        .values({
            guildId: f.guildId,
            mmrSeasonId: f.season.id,
            title: '지난 기록을 참고하는 편성',
            status: 'preparing',
            formationMethod: 'manual'
        })
        .returning();
    const current = await f.db
        .insert(schema.scrimParticipants)
        .values(
            f.users.slice(0, 10).map((user, index) => ({
                // 사용자 ID 순서와 반대로 만들어 pairKey 승수 방향의 변환을 검증한다.
                id: `10000000-0000-4000-8000-${String(100 - index).padStart(12, '0')}`,
                scrimId: target!.id,
                userId: user.id,
                riotAccountId: f.accounts[index]!.id,
                displayName: `현재 이름 ${index}`
            }))
        )
        .returning();
    await f.db.insert(schema.scrimParticipantRegistrations).values(
        current.map((participant) => ({
            scrimParticipantId: participant.id,
            status: 'selected' as const
        }))
    );
    const view = async () => {
        const formation = await getManualFormation(f.db, null, f.guildId, target!.id);
        assert.ok(formation);
        return formation;
    };
    const pair = async (a = 0, b = 5) => (await view()).pairs[pairKey(current[a]!.id, current[b]!.id)];
    return { ...f, target: target!, current, view, pair };
}

test('편성 참고: 기록·시즌·사용자 귀속이 없으면 빈 자료이며 조회로 점수를 생성하지 않는다', async (t) => {
    const f = await fixture(t);
    assert.deepEqual((await f.view()).pairs, {});
    assert.equal((await f.db.select().from(schema.userPositionMmr)).length, 0);
    assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 0);
    await f.createGame(f.db, 1);
    await f.db.update(schema.scrims).set({ mmrSeasonId: null }).where(eq(schema.scrims.id, f.target.id));
    assert.deepEqual((await f.view()).pairs, {});
    await f.db
        .update(schema.scrims)
        .set({ mmrSeasonId: f.season.id })
        .where(eq(schema.scrims.id, f.target.id));
    await f.db
        .update(schema.scrimParticipants)
        .set({ userId: null })
        .where(
            inArray(
                schema.scrimParticipants.id,
                f.current.map((player) => player.id)
            )
        );
    assert.deepEqual((await f.view()).pairs, {});
    assert.equal((await f.db.select().from(schema.userPositionMmr)).length, 0);
});

test('편성 참고: 같은 시즌 실출전의 동팀·동포지션 승패를 현재 참가자 쌍으로 한 번씩 집계한다', async (t) => {
    const f = await fixture(t);
    await f.createGame(f.db, 1);
    await f.createGame(f.db, 2, f.match.id, 'b', { winnerSide: 'red' });
    await f.createGame(f.db, 3, f.match.id, 'a', { winnerSide: 'red' });
    const formation = await f.view();
    const sameTeam = formation.pairs[pairKey(f.current[0]!.id, f.current[1]!.id)]!;
    assert.deepEqual(sameTeam.together, { plays: 3, wins: 2 });
    assert.deepEqual(sameTeam.against, { plays: 0, firstWins: 0 });
    assert.deepEqual(sameTeam.againstByLane, {});
    assert.deepEqual(formation.pairs[pairKey(f.current[5]!.id, f.current[6]!.id)]!.together, {
        plays: 3,
        wins: 1
    });
    const opponent = await f.pair();
    assert.deepEqual(opponent?.against, { plays: 3, firstWins: 1 });
    assert.deepEqual(opponent?.againstByLane, { top: { plays: 3, firstWins: 1 } });
    assert.deepEqual(headToHead(formation.pairs, f.current[0]!.id, f.current[5]!.id, 'top'), {
        wins: 2,
        losses: 1
    });
    assert.deepEqual(headToHead(formation.pairs, f.current[5]!.id, f.current[0]!.id, 'top'), {
        wins: 1,
        losses: 2
    });
    assert.equal(headToHead(formation.pairs, f.current[0]!.id, f.current[5]!.id, 'mid'), null);
    assert.equal(formation.pairs[pairKey(f.current[0]!.id, f.current[6]!.id)], undefined);
    const currentIds = new Set(f.current.map((player) => player.id));
    assert.ok(Object.keys(formation.pairs).every((key) => key.split('|').every((id) => currentIds.has(id))));
    assert.equal((await f.db.select().from(schema.userPositionMmr)).length, 0);
});

test('편성 참고: 과거 확정 포지션을 구분하고 누락 포지션을 희망 위치로 보충하지 않는다', async (t) => {
    const f = await fixture(t);
    await f.createGame(f.db, 1);
    const second = await f.createGame(f.db, 2);
    const third = await f.createGame(f.db, 3);
    const moving = [0, 2, 5, 7].map((index) => f.participants[index]!.id);
    await f.db
        .update(schema.gameParticipants)
        .set({ position: null })
        .where(
            and(
                eq(schema.gameParticipants.gameId, second.id),
                inArray(schema.gameParticipants.scrimParticipantId, moving)
            )
        );
    for (const [indices, position] of [
        [[0, 5], 'mid'],
        [[2, 7], 'top']
    ] as const) {
        await f.db
            .update(schema.gameParticipants)
            .set({ position })
            .where(
                and(
                    eq(schema.gameParticipants.gameId, second.id),
                    inArray(
                        schema.gameParticipants.scrimParticipantId,
                        indices.map((index) => f.participants[index]!.id)
                    )
                )
            );
    }
    await f.db
        .update(schema.gameParticipants)
        .set({ position: null })
        .where(
            and(
                eq(schema.gameParticipants.gameId, third.id),
                eq(schema.gameParticipants.scrimParticipantId, f.participants[0]!.id)
            )
        );
    await f.db.insert(schema.scrimParticipantPreferences).values({
        scrimParticipantId: f.current[0]!.id,
        position: 'top',
        priority: 1
    });
    const formation = await f.view();
    assert.deepEqual((await f.pair())?.againstByLane, {
        top: { plays: 1, firstWins: 0 },
        mid: { plays: 1, firstWins: 0 }
    });
    assert.deepEqual((await f.pair())?.against, { plays: 2, firstWins: 0 });
    assert.deepEqual(formation.pairs[pairKey(f.current[0]!.id, f.current[1]!.id)]?.together, {
        plays: 3,
        wins: 3
    });
});

test('편성 참고: 취소·미완료 Game과 취소 부모는 제외하고 중도 종료의 유효 결과는 유지한다', async (t) => {
    const f = await fixture(t);
    await f.createGame(f.db, 1);
    const pending = await f.createGame(f.db, 2);
    await f.db
        .update(schema.games)
        .set({ status: 'pending', winnerSide: null })
        .where(eq(schema.games.id, pending.id));
    const cancelled = await f.createGame(f.db, 3);
    await f.db
        .update(schema.games)
        .set({ status: 'cancelled', winnerSide: null })
        .where(eq(schema.games.id, cancelled.id));
    assert.equal((await f.pair())?.against.plays, 1);
    for (const [table, id] of [
        [schema.matches, f.match.id],
        [schema.scrims, f.scrimId]
    ] as const) {
        await f.db.update(table).set({ status: 'cancelled' }).where(eq(table.id, id));
        assert.deepEqual((await f.view()).pairs, {});
        await f.db.update(table).set({ status: 'ended_early' }).where(eq(table.id, id));
        assert.equal((await f.pair())?.against.plays, 1);
    }
});

test('편성 참고: 조회 서버·내전 고정 시즌을 지키고 활성 시즌이나 편성 방식으로 기록을 바꾸지 않는다', async (t) => {
    const f = await fixture(t);
    await f.createGame(f.db, 1);
    const before = (await f.view()).pairs;
    await f.db
        .update(schema.mmrSeasons)
        .set({ endedAt: new Date(1) })
        .where(eq(schema.mmrSeasons.id, f.season.id));
    const [next] = await f.db
        .insert(schema.mmrSeasons)
        .values({ guildId: f.guildId, name: '새 시즌' })
        .returning();
    assert.deepEqual((await f.view()).pairs, before);
    await f.db
        .update(schema.scrims)
        .set({ formationMethod: 'auction' })
        .where(eq(schema.scrims.id, f.scrimId));
    assert.deepEqual((await f.view()).pairs, before);
    await f.db.update(schema.scrims).set({ mmrSeasonId: next!.id }).where(eq(schema.scrims.id, f.target.id));
    assert.deepEqual((await f.view()).pairs, {});
    const players = (await f.view()).players;
    assert.deepEqual(
        await f.db.transaction((tx) => formationPairRecords(tx, f.otherGuildId, f.season.id, players)),
        {}
    );
    await assert.rejects(getManualFormation(f.db, null, f.otherGuildId, f.target.id), errorCode('NOT_FOUND'));
});

test('편성 참고: 계정 연결 변경과 희망 포지션은 당시 사용자 귀속·확정 실출전을 바꾸지 않는다', async (t) => {
    const f = await fixture(t);
    await f.createGame(f.db, 1);
    const before = (await f.view()).pairs;
    await f.db
        .update(schema.guildRiotAccounts)
        .set({ userId: f.users[15]!.id, isPrimary: false })
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
    await f.db
        .insert(schema.scrimParticipantPreferences)
        .values({ scrimParticipantId: f.current[0]!.id, position: 'support', priority: 1 });
    assert.deepEqual((await f.view()).pairs, before);
    await f.db
        .update(schema.scrimParticipants)
        .set({ userId: null })
        .where(eq(schema.scrimParticipants.id, f.current[0]!.id));
    assert.equal(await f.pair(), undefined);
    assert.deepEqual((await f.view()).pairs[pairKey(f.current[1]!.id, f.current[2]!.id)]?.together, {
        plays: 1,
        wins: 1
    });
});
