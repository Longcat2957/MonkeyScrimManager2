import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { assertAction, HTTP_IDS } from '../../support/http.ts';
import { createHttpMatchResultFixture } from '../../support/http-match-fixtures.ts';

test('HTTP 진행 내전 전체 취소·복구는 기존 action으로 원본 결과를 보존하고 편성 준비로 돌아간다', async (t) => {
    const f = await createHttpMatchResultFixture(t);
    assertAction(await f.record(), 200);
    const path = '/g/' + HTTP_IDS.guild + '/scrims/' + f.scrim.id;
    const row = async () =>
        (await f.db.select().from(schema.scrims).where(eq(schema.scrims.id, f.scrim.id)))[0]!;
    const fields = { expectedRevision: String((await row()).revision) };
    assertAction(await f.action(path, 'cancel', fields), 401);
    assertAction(await f.action(path, 'cancel', fields, f.participant.cookie), 403);
    assertAction(
        await f.action(path.replace(HTTP_IDS.guild, HTTP_IDS.otherGuild), 'cancel', fields, f.manager.cookie),
        404
    );
    assertAction(await f.action(path, 'cancel', fields, f.manager.cookie), 200);
    assert.equal((await row()).status, 'cancelled');
    assert.equal((await f.db.select().from(schema.scrimCancellations))[0]!.reversedGameCount, 1);
    assert.equal(
        (await f.db.select().from(schema.mmrLedgerEntries)).filter((entry) => entry.kind === 'game_reversal')
            .length,
        10
    );
    assert.ok((await f.db.select().from(schema.userPositionMmr)).every((rating) => rating.mmr === 1500));
    assert.equal((await f.db.select().from(schema.matchLineupPlayers)).length, 10);
    assert.equal((await f.db.select().from(schema.gameParticipants)).length, 10);
    assert.equal((await f.request(f.path)).status, 200);
    assertAction(await f.action(path, 'cancel', fields, f.manager.cookie), 409);
    assertAction(
        await f.action(
            path,
            'restore',
            { expectedRevision: String((await row()).revision) },
            f.manager.cookie
        ),
        200
    );
    assert.equal((await row()).status, 'preparing');
    assert.equal((await f.matchRow()).status, 'cancelled');
    assert.equal((await f.db.select().from(schema.matchRoflImports)).length, 1);
    assert.ok((await f.db.select().from(schema.matchRoflImports))[0]!.cancelledAt);
});

test('HTTP 안전하지 않은 후속 점수 보정은 전체 취소 409로 남고 결과·MMR은 바뀌지 않는다', async (t) => {
    const f = await createHttpMatchResultFixture(t);
    assertAction(await f.record(), 200);
    const [rating] = await f.db.select().from(schema.userPositionMmr);
    await f.db.insert(schema.mmrLedgerEntries).values({
        seasonId: f.season.id,
        ratingId: rating!.id,
        revision: rating!.revision + 1,
        kind: 'adjustment',
        beforeMmr: rating!.mmr,
        afterMmr: rating!.mmr,
        reason: '동일 점수 관리 보정'
    });
    await f.db
        .update(schema.userPositionMmr)
        .set({ revision: rating!.revision + 1 })
        .where(eq(schema.userPositionMmr.id, rating!.id));
    const [scrim] = await f.db.select().from(schema.scrims).where(eq(schema.scrims.id, f.scrim.id));
    const path = '/g/' + HTTP_IDS.guild + '/scrims/' + f.scrim.id;
    assertAction(
        await f.action(path, 'cancel', { expectedRevision: String(scrim!.revision) }, f.manager.cookie),
        409
    );
    assert.deepEqual(
        (await f.db.select().from(schema.scrims).where(eq(schema.scrims.id, f.scrim.id)))[0],
        scrim
    );
    assert.equal((await f.db.select().from(schema.games))[0]!.status, 'completed');
    assert.equal((await f.db.select().from(schema.gameMmrApplications))[0]!.reversedAt, null);
    assert.deepEqual(await f.db.select().from(schema.scrimCancellations), []);
});
