import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { cancellationRestoreBlock } from '../../../../src/lib/server/scrims/service.ts';
import { createFormationFixture } from '../../support/domain-fixtures.ts';

test('0006은 기존 취소·편성 자료를 보존하고 과거 취소의 복귀 단계를 추정하지 않는다', async (t) => {
    const f = await createFormationFixture(t);
    await f.fill();
    await f.db.update(schema.scrims).set({ status: 'cancelled' }).where(eq(schema.scrims.id, f.scrimId));
    const before = await f.row();
    const participants = await f.db.select().from(schema.scrimParticipants);
    await f.pool.query(`
        ALTER TABLE scrims DROP CONSTRAINT scrims_cancellation_restore_state;
        ALTER TABLE scrims DROP COLUMN cancelled_from_status;
        ALTER TABLE scrims DROP COLUMN cancelled_auction_status;
    `);
    const migration = await readFile(
        new URL('../../../../drizzle/0006_scrim_cancellation_restore.sql', import.meta.url),
        'utf8'
    );
    await f.db.transaction((tx) => tx.execute(sql.raw(migration)));
    const after = await f.row();
    assert.deepEqual(after, before);
    assert.equal(after.cancelledFromStatus, null);
    assert.equal(after.cancelledAuctionStatus, null);
    assert.match((await cancellationRestoreBlock(f.db, after)) ?? '', /취소 전 단계/);
    assert.deepEqual(await f.db.select().from(schema.scrimParticipants), participants);
});

test('0006 취소 복구 CHECK는 잘못된 단계와 분리된 경매 복원 근거를 거절한다', async (t) => {
    const f = await createFormationFixture(t);
    const query = (text: string) => f.pool.query(text, [f.scrimId]);
    await assert.rejects(query("UPDATE scrims SET cancelled_from_status = 'preparing' WHERE id = $1"));
    await assert.rejects(query("UPDATE scrims SET cancelled_auction_status = 'setup' WHERE id = $1"));
    await assert.rejects(
        query("UPDATE scrims SET status = 'cancelled', cancelled_from_status = 'in_progress' WHERE id = $1")
    );
    await query(
        "UPDATE scrims SET status = 'cancelled', cancelled_from_status = 'preparing', cancelled_auction_status = 'setup' WHERE id = $1"
    );
    assert.equal((await f.row()).cancelledFromStatus, 'preparing');
});
