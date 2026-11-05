import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { importMatchRofl, revertLastMatchGame } from '../../../../src/lib/server/matches/service.ts';
import { createMatchResultFixture, replayBytes } from '../../support/match-fixtures.ts';

test('0004는 이전 취소 결과의 근거·역분개 시각을 보존하며 같은 파일의 새 채택을 허용한다', async (t) => {
    const f = await createMatchResultFixture(t, { keepAutomaticLineup: true });
    const bytes = replayBytes(f.players());
    const first = await importMatchRofl(
        f.db,
        f.manager,
        f.guildId,
        f.match.id,
        {
            ...(await f.slot()),
            bytes
        },
        f.dependencies
    );
    await revertLastMatchGame(
        f.db,
        f.manager,
        f.guildId,
        f.match.id,
        {
            expectedRevision: (await f.matchRow()).revision,
            gameId: first.gameId,
            reason: '업그레이드 전 결과 취소'
        },
        f.dependencies
    );
    const [original] = await f.db.select().from(schema.matchRoflImports);
    const [application] = await f.db.select().from(schema.gameMmrApplications);
    assert.ok(original && application?.reversedAt);

    // 테스트 전용 스키마의 변경 대상만 0003 구조로 되돌려 기존 업무 행이 있는 업그레이드를 검증한다.
    await f.pool.query(`
        DROP INDEX games_active_rofl_metadata_unique;
        DROP INDEX match_rofl_imports_active_fingerprint_unique;
        DROP INDEX match_rofl_imports_metadata_idx;
        DROP INDEX match_rofl_imports_fingerprint_idx;
        ALTER TABLE games ADD CONSTRAINT games_rofl_metadata_id_unique UNIQUE (rofl_metadata_id);
        ALTER TABLE match_rofl_imports DROP CONSTRAINT match_rofl_imports_pkey;
        ALTER TABLE match_rofl_imports ADD PRIMARY KEY (rofl_metadata_id);
        ALTER TABLE match_rofl_imports DROP COLUMN cancelled_at;
        ALTER TABLE match_rofl_imports ADD CONSTRAINT match_rofl_imports_result_fingerprint_unique UNIQUE (result_fingerprint);
    `);
    const migration = await readFile(
        new URL('../../../../drizzle/0004_rofl_result_restoration.sql', import.meta.url),
        'utf8'
    );
    await f.db.transaction(async (tx) => {
        // 실행할 SQL은 실제 배포 마이그레이션 파일 그대로 사용한다.
        await tx.execute(sql.raw(migration));
    });
    const [upgraded] = await f.db.select().from(schema.matchRoflImports);
    assert.deepEqual(upgraded, { ...original, cancelledAt: application.reversedAt });
    const restored = await importMatchRofl(
        f.db,
        f.manager,
        f.guildId,
        f.match.id,
        {
            ...(await f.slot()),
            bytes,
            blueTeamSlot: 'b'
        },
        f.dependencies
    );
    assert.notEqual(restored.gameId, first.gameId);
    const [previous] = await f.db.select().from(schema.games).where(eq(schema.games.id, first.gameId));
    const [next] = await f.db.select().from(schema.games).where(eq(schema.games.id, restored.gameId));
    assert.equal(previous?.status, 'cancelled');
    assert.equal(next?.roflMetadataId, original.roflMetadataId);
    assert.equal((await f.db.select().from(schema.roflMetadata)).length, 1);
    assert.equal((await f.db.select().from(schema.matchRoflImports)).length, 2);
});
