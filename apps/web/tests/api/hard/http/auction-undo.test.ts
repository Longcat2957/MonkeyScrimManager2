import assert from 'node:assert/strict';
import test from 'node:test';
import { and, eq } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { assertAction, createHttpFixture } from '../../support/http.ts';
import { prepareHttpAuctionFixture } from '../../support/http-auction-fixtures.ts';

test('실제 경매 action은 추첨·유찰 복귀의 취소와 권한·revision을 보존한다', async (t) => {
    const f = await createHttpFixture(t);
    const { path, manager, member, revision, action, setup } = await prepareHttpAuctionFixture(f);
    assertAction(await setup(), 200);
    assertAction(await action('start'), 200);
    assertAction(await action('draw'), 200);
    const [draw] = await f.db.select().from(schema.auctionActions);
    const stale = await revision();
    assertAction(await f.action(path, 'revert', { expectedRevision: stale }), 401);
    assertAction(await f.action(path, 'revert', { expectedRevision: stale }, member.cookie), 403);
    assert.equal((await f.db.select().from(schema.auctionActions)).length, 1);
    assertAction(await action('revert'), 200);
    assertAction(await f.action(path, 'revert', { expectedRevision: stale }, manager.cookie), 409);
    assertAction(await action('revert'), 409);
    const [queued] = await f.db
        .select()
        .from(schema.auctionQueueEntries)
        .where(eq(schema.auctionQueueEntries.ordinal, 1));
    assert.equal(queued!.scrimParticipantId, draw!.scrimParticipantId);
    assertAction(await action('draw'), 200);
    const [opened] = await f.db
        .select()
        .from(schema.auctionLots)
        .where(eq(schema.auctionLots.status, 'open'));
    assertAction(await action('pass', { lotId: opened!.id }), 200);
    assertAction(await action('restore', { participantId: opened!.scrimParticipantId }), 200);
    assertAction(await action('revert'), 200);
    assert.equal(
        (await f.db.select().from(schema.auctionLots).where(eq(schema.auctionLots.status, 'open'))).length,
        0
    );
    const prior = await f.db
        .select()
        .from(schema.auctionLots)
        .where(and(eq(schema.auctionLots.id, opened!.id), eq(schema.auctionLots.status, 'unsold')));
    assert.equal(prior.length, 1);
    assert.equal(prior[0]!.voidedAt, null);
    assert.equal(
        (await f.db.select().from(schema.auctionActions)).filter((entry) => entry.kind === 'revert').length,
        2
    );
    assert.equal((await f.request(path)).status, 200);
});

test('행위 원장 도입 전의 완료 경매도 포인트와 배정을 유지한 채 다시 확정할 수 있다', async (t) => {
    const f = await createHttpFixture(t);
    const { path, teams, manager, revision, action, setup } = await prepareHttpAuctionFixture(f);
    assertAction(await setup(), 200);
    assertAction(await action('start'), 200);
    for (let index = 0; index < 8; index++) {
        assertAction(await action('draw'), 200);
        const [lot] = await f.db
            .select()
            .from(schema.auctionLots)
            .where(eq(schema.auctionLots.status, 'open'));
        assertAction(
            await action('award', { lotId: lot!.id, teamId: teams[Math.floor(index / 4)]!.id, price: '3' }),
            200
        );
    }
    await f.db.delete(schema.auctionActions);
    const purchases = await f.db
        .select()
        .from(schema.auctionAcquisitions)
        .orderBy(schema.auctionAcquisitions.id);
    const bracketPath = path.slice(0, -'/auction'.length) + '/bracket';
    assertAction(
        await f.action(
            bracketPath,
            'reopenFormation',
            {
                expectedRevision: await revision(),
                formationMethod: 'auction'
            },
            manager.cookie
        ),
        200
    );
    assertAction(await action('revert'), 409);
    assertAction(await action('confirmFormation'), 200);
    assert.deepEqual(
        await f.db.select().from(schema.auctionAcquisitions).orderBy(schema.auctionAcquisitions.id),
        purchases
    );
    assert.equal((await f.db.select().from(schema.auctions))[0]?.status, 'completed');
    assert.equal((await f.db.select().from(schema.scrims))[0]?.status, 'ready');
    assert.equal((await f.db.select().from(schema.matches)).length, 0);
});
