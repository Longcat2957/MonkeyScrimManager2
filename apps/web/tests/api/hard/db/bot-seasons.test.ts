import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { type TestContext } from 'node:test';
import { eq, isNull } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { getBotSeasons, rotateBotSeason } from '../../../../src/lib/server/discord/bot-seasons.ts';
import { initializeBotGuild } from '../../../../src/lib/server/discord/bot-service.ts';
import { createScrim } from '../../../../src/lib/server/scrims/service.ts';
import { createAccessFixture } from '../../support/access-fixtures.ts';
import { errorCode, settings } from '../../support/domain-fixtures.ts';

let sequence = 995000000000000000n;
const requestId = () => String(sequence++);
async function fixture(t: TestContext) {
    const f = await createAccessFixture(t);
    const [season] = await f.db
        .insert(schema.mmrSeasons)
        .values({ guildId: f.ids.guild, name: '시즌 1', startedAt: new Date(0) })
        .returning();
    const input = () => ({
        actorId: f.ids.owner,
        interactionId: requestId(),
        expectedCurrentSeasonId: season!.id,
        name: '시즌 2',
        confirm: true
    });
    return {
        ...f,
        season: season!,
        input,
        rotate: (patch = {}) => rotateBotSeason(f.db, f.ids.guild, { ...input(), ...patch }, f.dependencies)
    };
}

test('시즌 조회는 관리자만 가능하며 빈 상태를 읽어도 시즌·점수를 생성하지 않는다', async (t) => {
    const f = await createAccessFixture(t);
    assert.deepEqual(await getBotSeasons(f.db, f.ids.guild, f.ids.owner, f.dependencies), {
        current: null,
        completed: []
    });
    await assert.rejects(
        getBotSeasons(f.db, f.ids.guild, f.ids.member, f.dependencies),
        errorCode('FORBIDDEN')
    );
    assert.equal((await f.db.select().from(schema.mmrSeasons)).length, 0);
    assert.equal((await f.db.select().from(schema.userPositionMmr)).length, 0);
});

test('시즌 전환은 이전 시즌 종료·새 시즌 생성을 원자 처리하고 내전·기존 점수를 보존한다', async (t) => {
    const f = await fixture(t);
    const scrimId = await createScrim(
        f.db,
        f.owner,
        f.ids.guild,
        { ...settings, requestId: randomUUID() },
        f.dependencies
    );
    await f.db
        .insert(schema.userPositionMmr)
        .values({ seasonId: f.season.id, userId: f.ids.member, position: 'top', mmr: 1700 });
    const beforeScrims = await f.db.select().from(schema.scrims);
    const beforeScores = await f.db.select().from(schema.userPositionMmr);
    const result = await f.rotate({ name: '  다음 시즌  ' });
    assert.equal(result.current!.name, '다음 시즌');
    assert.notEqual(result.current!.id, f.season.id);
    assert.equal(result.completed[0]!.endedAt, result.current!.startedAt);
    assert.deepEqual(await f.db.select().from(schema.scrims), beforeScrims);
    assert.deepEqual(await f.db.select().from(schema.userPositionMmr), beforeScores);
    const nextId = await createScrim(
        f.db,
        f.owner,
        f.ids.guild,
        { ...settings, requestId: randomUUID() },
        f.dependencies
    );
    const rows = await f.db.select().from(schema.scrims);
    assert.equal(rows.find((row) => row.id === scrimId)!.mmrSeasonId, f.season.id);
    assert.equal(rows.find((row) => row.id === nextId)!.mmrSeasonId, result.current!.id);
    const receipts = await f.db.select().from(schema.discordInteractionReceipts);
    assert.equal(receipts[0]!.actorId, f.ids.owner);
    assert.deepEqual(receipts[0]!.result, result);
});

test('같은 interaction은 결과를 재사용하고 같은 식별자의 다른 내용은 거절한다', async (t) => {
    const f = await fixture(t);
    const input = f.input();
    const first = await rotateBotSeason(f.db, f.ids.guild, input, f.dependencies);
    assert.deepEqual(await rotateBotSeason(f.db, f.ids.guild, input, f.dependencies), first);
    await assert.rejects(
        rotateBotSeason(f.db, f.ids.guild, { ...input, name: '다른 이름' }, f.dependencies),
        errorCode('CONFLICT')
    );
    assert.equal((await f.db.select().from(schema.mmrSeasons)).length, 2);
});

test('서로 다른 동시 전환은 한 번만 성공하고 최초 설정과 경쟁해도 활성 시즌이 하나다', async (t) => {
    const f = await fixture(t);
    const results = await Promise.allSettled([
        f.rotate(),
        f.rotate(),
        initializeBotGuild(
            f.db,
            f.ids.guild,
            { actorId: f.ids.owner, interactionId: requestId() },
            f.dependencies
        )
    ]);
    assert.equal(results.slice(0, 2).filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = results.slice(0, 2).find((result) => result.status === 'rejected');
    assert.ok(rejected && rejected.status === 'rejected' && errorCode('CONFLICT')(rejected.reason));
    assert.equal(results[2]!.status, 'fulfilled');
    assert.equal(
        (await f.db.select().from(schema.mmrSeasons).where(isNull(schema.mmrSeasons.endedAt))).length,
        1
    );
});

test('이름·확인·오래된 시즌·다른 서버·권한 위반은 현재 시즌과 receipt를 변경하지 않는다', async (t) => {
    const f = await fixture(t);
    for (const patch of [
        { name: '' },
        { name: '가'.repeat(101) },
        { confirm: false },
        { expectedCurrentSeasonId: 'invalid' }
    ])
        await assert.rejects(f.rotate(patch), errorCode('INVALID_INPUT'));
    await assert.rejects(f.rotate({ expectedCurrentSeasonId: randomUUID() }), errorCode('CONFLICT'));
    await assert.rejects(f.rotate({ actorId: f.ids.member }), errorCode('FORBIDDEN'));
    await assert.rejects(
        rotateBotSeason(f.db, f.ids.otherGuild, f.input(), f.dependencies),
        errorCode('CONFLICT')
    );
    assert.equal(
        (await f.db.select().from(schema.mmrSeasons).where(eq(schema.mmrSeasons.id, f.season.id)))[0]!
            .endedAt,
        null
    );
    assert.equal((await f.db.select().from(schema.discordInteractionReceipts)).length, 0);
});

test('다음 시즌 저장 실패는 이전 시즌 종료와 처리 receipt도 함께 롤백한다', async (t) => {
    const f = await fixture(t);
    // 테스트 스키마에만 제약을 추가해 종료 UPDATE 다음 INSERT의 실패를 재현한다.
    await f.pool.query("ALTER TABLE mmr_seasons ADD CONSTRAINT fixture_season_name CHECK (name <> '실패')");
    await assert.rejects(f.rotate({ name: '실패' }));
    const result = await getBotSeasons(f.db, f.ids.guild, f.ids.owner, f.dependencies);
    assert.equal(result.current!.id, f.season.id);
    assert.equal(result.completed.length, 0);
    assert.equal((await f.db.select().from(schema.discordInteractionReceipts)).length, 0);
});
