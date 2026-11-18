import assert from 'node:assert/strict';
import test from 'node:test';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { revertScrim } from '../../../../src/lib/server/scrims/workflow.ts';
import { createGameFixture } from '../../support/domain-fixtures.ts';

test('0007은 기존 중도 종료·Game·MMR을 보존하며 이전 재개 경로를 유지한다', async (t) => {
    const f = await createGameFixture(t);
    const game = await f.createGame(f.db, 1);
    await f.apply(game.id);
    await f.db
        .update(schema.matches)
        .set({ status: 'ended_early', statusBeforeScrimEnd: 'in_progress' })
        .where(eq(schema.matches.id, f.match.id));
    await f.db.update(schema.scrims).set({ status: 'ended_early' }).where(eq(schema.scrims.id, f.scrimId));
    const before = await f.row();
    const games = await f.db.select().from(schema.games);
    const ledger = await f.db.select().from(schema.mmrLedgerEntries);
    await f.pool.query(`
        ALTER TABLE scrims DROP CONSTRAINT scrims_early_end_restore_state;
        ALTER TABLE scrims DROP CONSTRAINT scrims_formation_method_required;
        ALTER TABLE scrims DROP COLUMN ended_early_from_status;
        ALTER TABLE scrims ADD CONSTRAINT scrims_formation_method_required
            CHECK (status IN ('recruit', 'preparing', 'cancelled') OR formation_method IS NOT NULL);
        ALTER TABLE matches DROP CONSTRAINT matches_winner_requires_completion;
        ALTER TABLE matches DROP CONSTRAINT matches_scrim_end_restore_state;
        ALTER TABLE matches ADD CONSTRAINT matches_winner_requires_completion
            CHECK ((status = 'completed' AND winner_team_id IS NOT NULL)
                OR (status <> 'completed' AND winner_team_id IS NULL));
        ALTER TABLE matches ADD CONSTRAINT matches_scrim_end_restore_state
            CHECK ((status_before_scrim_end IS NULL AND ended_at_before_scrim_end IS NULL
                    AND end_reason_before_scrim_end IS NULL)
                OR (status_before_scrim_end IS NOT NULL
                    AND ((status_before_scrim_end = 'pending' AND status = 'cancelled')
                        OR (status_before_scrim_end = 'in_progress' AND status = 'ended_early'))));
    `);
    await f.db.transaction((tx) => tx.execute(sql.raw(f.migrationSql('0007_scrim_early_end'))));
    assert.deepEqual(await f.row(), before);
    await revertScrim(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    assert.equal((await f.row()).status, 'in_progress');
    assert.equal((await f.db.select().from(schema.matches))[0]?.status, 'in_progress');
    assert.deepEqual(await f.db.select().from(schema.games), games);
    assert.deepEqual(await f.db.select().from(schema.mmrLedgerEntries), ledger);
});

test('0007은 중도 종료 승자만 nullable로 허용하고 정상 완료·복원 근거 제약을 유지한다', async (t) => {
    const f = await createGameFixture(t);
    const query = (text: string) =>
        f.pool.query(text, text.includes('$2') ? [f.match.id, f.match.teamAId] : [f.match.id]);
    const violated = (constraint: string) => ({ code: '23514', constraint });
    await assert.rejects(
        query('UPDATE matches SET winner_team_id = $2 WHERE id = $1'),
        violated('matches_winner_requires_completion')
    );
    await assert.rejects(
        query("UPDATE matches SET status = 'completed', winner_team_id = NULL WHERE id = $1"),
        violated('matches_winner_requires_completion')
    );
    await query("UPDATE matches SET status = 'ended_early', winner_team_id = $2 WHERE id = $1");
    await query('UPDATE matches SET winner_team_id = NULL WHERE id = $1');
    await query("UPDATE matches SET status_before_scrim_end = 'pending' WHERE id = $1");
    await assert.rejects(
        query("UPDATE matches SET status_before_scrim_end = 'completed' WHERE id = $1"),
        violated('matches_scrim_end_restore_state')
    );
    await assert.rejects(
        f.pool.query("UPDATE scrims SET ended_early_from_status = 'preparing' WHERE id = $1", [f.scrimId]),
        violated('scrims_early_end_restore_state')
    );
    await f.pool.query(
        "UPDATE scrims SET status = 'ended_early', ended_early_from_status = 'preparing', formation_method = NULL WHERE id = $1",
        [f.scrimId]
    );
    await assert.rejects(
        f.pool.query('UPDATE scrims SET ended_early_from_status = NULL WHERE id = $1', [f.scrimId]),
        violated('scrims_formation_method_required')
    );
});
