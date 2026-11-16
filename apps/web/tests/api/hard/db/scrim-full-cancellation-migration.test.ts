import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { importMatchRofl } from '../../../../src/lib/server/matches/service.ts';
import { cancelScrim, cancellationRestoreBlock } from '../../../../src/lib/server/scrims/service.ts';
import { createMatchResultFixture, replayBytes } from '../../support/match-fixtures.ts';

test('0008은 기존 결과·출전·MMR을 보존하고 과거 취소의 배치 근거를 추정하지 않는다', async (t) => {
    const f = await createMatchResultFixture(t, { keepAutomaticLineup: true });
    await importMatchRofl(
        f.db,
        f.manager,
        f.guildId,
        f.match.id,
        { ...(await f.slot()), bytes: replayBytes(f.players()) },
        f.dependencies
    );
    const before = {
        matches: await f.db.select().from(schema.matches),
        games: await f.db.select().from(schema.games),
        lineups: await f.db.select().from(schema.matchLineupPlayers),
        receipts: await f.db.select().from(schema.matchRoflImports),
        entries: await f.db.select().from(schema.mmrLedgerEntries)
    };
    await f.pool.query(
        `ALTER TABLE matches DROP CONSTRAINT matches_cancellation_batch_fk; ALTER TABLE matches DROP CONSTRAINT matches_cancellation_batch_state; ALTER TABLE matches DROP COLUMN cancellation_batch_id; DROP TABLE scrim_cancellations;`
    );
    const migration = await readFile(
        new URL('../../../../drizzle/0008_scrim_result_cancellation.sql', import.meta.url),
        'utf8'
    );
    // 격리 스키마에서는 배포 SQL의 public 참조만 현재 search_path로 바꾼다. 업무 DDL은 그대로 실행한다.
    await f.db.transaction((tx) => tx.execute(sql.raw(migration.replaceAll('"public".', ''))));
    assert.deepEqual(await f.db.select().from(schema.matches), before.matches);
    assert.deepEqual(await f.db.select().from(schema.games), before.games);
    assert.deepEqual(await f.db.select().from(schema.matchLineupPlayers), before.lineups);
    assert.deepEqual(await f.db.select().from(schema.matchRoflImports), before.receipts);
    assert.deepEqual(await f.db.select().from(schema.mmrLedgerEntries), before.entries);
    assert.deepEqual(await f.db.select().from(schema.scrimCancellations), []);
    await f.db.update(schema.scrims).set({ status: 'cancelled' }).where(eq(schema.scrims.id, f.scrimId));
    assert.match((await cancellationRestoreBlock(f.db, await f.row())) ?? '', /취소 전 단계/);
});

test('0008은 배치의 내전 귀속·취소 상태·1회 활성·사유·수량을 DB에서 제한한다', async (t) => {
    const f = await createMatchResultFixture(t, { keepAutomaticLineup: true });
    await cancelScrim(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    const [batch] = await f.db.select().from(schema.scrimCancellations);
    const [other] = await f.db
        .insert(schema.scrims)
        .values({ guildId: f.guildId, title: '다른 내전' })
        .returning();
    await assert.rejects(f.pool.query("UPDATE matches SET status='in_progress' WHERE id=$1", [f.match.id]), {
        code: '23514',
        constraint: 'matches_cancellation_batch_state'
    });
    await assert.rejects(
        f.pool.query('UPDATE scrim_cancellations SET scrim_id=$1 WHERE id=$2', [other!.id, batch!.id]),
        { code: '23503', constraint: 'matches_cancellation_batch_fk' }
    );
    await assert.rejects(
        f.pool.query(
            "INSERT INTO scrim_cancellations (scrim_id,reason,reversed_game_count,context) VALUES ($1,'중복',0,'{}')",
            [f.scrimId]
        ),
        { code: '23505', constraint: 'scrim_cancellations_active_unique' }
    );
    for (const [assignment, constraint] of [
        ["reason=' '", 'scrim_cancellations_reason'],
        ['reversed_game_count=-1', 'scrim_cancellations_game_count'],
        ["context='[]'", 'scrim_cancellations_context'],
        ["restored_at=cancelled_at-interval '1 second'", 'scrim_cancellations_time_order']
    ])
        await assert.rejects(
            f.pool.query(`UPDATE scrim_cancellations SET ${assignment} WHERE id=$1`, [batch!.id]),
            { code: '23514', constraint }
        );
    const version = await f.pool.query<{ server_version_num: string }>('SHOW server_version_num');
    // PostgreSQL 18부터 RESTRICT 위반은 전용 SQLSTATE를 반환한다. 제약 이름도 함께 검사한다.
    await assert.rejects(f.pool.query('DELETE FROM scrim_cancellations WHERE id=$1', [batch!.id]), {
        code: Number(version.rows[0]!.server_version_num) >= 180000 ? '23001' : '23503',
        constraint: 'matches_cancellation_batch_fk'
    });
});
