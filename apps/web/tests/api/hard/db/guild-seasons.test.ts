import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { type TestContext } from 'node:test';
import { eq, isNull } from 'drizzle-orm';
import type { RotateGuildSeasonInput } from '../../../../src/lib/features/seasons.ts';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { getBotSeasons, rotateBotSeason } from '../../../../src/lib/server/discord/bot-seasons.ts';
import {
    getGuildSeasons,
    rotateGuildSeason,
    rotateGuildSeasonInTransaction,
    validateRotateGuildSeasonInput
} from '../../../../src/lib/server/guild/seasons.ts';
import { createScrim } from '../../../../src/lib/server/scrims/service.ts';
import { createAccessFixture } from '../../support/access-fixtures.ts';
import { createGameFixture, errorCode, settings } from '../../support/domain-fixtures.ts';

let sequence = 996000000000000000n;
const interactionId = () => String(sequence++);

async function fixture(t: TestContext) {
    const f = await createAccessFixture(t);
    const [season] = await f.db
        .insert(schema.mmrSeasons)
        .values({ guildId: f.ids.guild, name: '시즌 1', startedAt: new Date(0) })
        .returning();
    const input: RotateGuildSeasonInput = {
        expectedCurrentSeasonId: season!.id,
        name: '새 시즌',
        confirm: true
    };
    return {
        ...f,
        season: season!,
        input,
        rotate: (patch: Partial<RotateGuildSeasonInput> = {}) =>
            rotateGuildSeason(f.db, f.owner, f.ids.guild, { ...input, ...patch }, f.dependencies)
    };
}

test('웹 시즌 조회는 관리자에게 현재·완료 시즌을 제공하며 빈 조회로 초기화하지 않는다', async (t) => {
    const f = await createAccessFixture(t);
    assert.deepEqual(await getGuildSeasons(f.db, f.owner, f.ids.guild, f.dependencies), {
        current: null,
        completed: []
    });
    await assert.rejects(
        getGuildSeasons(f.db, null, f.ids.guild, f.dependencies),
        errorCode('UNAUTHENTICATED')
    );
    for (const actor of [f.member, { ...f.member, isServiceAdmin: true }])
        await assert.rejects(
            getGuildSeasons(f.db, actor, f.ids.guild, f.dependencies),
            errorCode('FORBIDDEN')
        );
    assert.equal((await f.db.select().from(schema.mmrSeasons)).length, 0);
    assert.equal((await f.db.select().from(schema.userPositionMmr)).length, 0);
    assert.equal((await f.db.select().from(schema.discordInteractionReceipts)).length, 0);
});

test('웹 시즌 전환은 실제 과거 결과·점수를 보존하고 기존 내전의 후속 결과도 이전 시즌에 반영한다', async (t) => {
    const f = await createGameFixture(t);
    const game = await f.createGame(f.db, 1);
    await f.apply(game.id);
    const snapshot = () =>
        Promise.all([
            f.db.select().from(schema.scrims),
            f.db.select().from(schema.games),
            f.db.select().from(schema.gameMmrApplications),
            f.db.select().from(schema.mmrLedgerEntries),
            f.db.select().from(schema.userPositionMmr)
        ]);
    const before = await snapshot();
    const result = await rotateGuildSeason(
        f.db,
        f.manager,
        f.guildId,
        { expectedCurrentSeasonId: f.season.id, name: '  다음 시즌  ', confirm: true },
        f.access
    );
    assert.equal(result.current!.name, '다음 시즌');
    assert.equal(result.completed[0]!.id, f.season.id);
    assert.equal(result.completed[0]!.endedAt, result.current!.startedAt);
    assert.deepEqual(await snapshot(), before);
    assert.deepEqual(await getBotSeasons(f.db, f.guildId, f.manager.userId, f.access), result);
    const nextId = await createScrim(
        f.db,
        f.manager,
        f.guildId,
        { ...settings, requestId: randomUUID() },
        f.access
    );
    assert.equal(
        (await f.db.select().from(schema.scrims).where(eq(schema.scrims.id, nextId)))[0]!.mmrSeasonId,
        result.current!.id
    );
    const later = await f.createGame(f.db, 2, f.match.id, 'b', { champion: 'Lux' });
    await f.apply(later.id);
    assert.ok(
        (await f.db.select().from(schema.gameMmrApplications)).every((row) => row.seasonId === f.season.id)
    );
    assert.ok(
        (await f.db.select().from(schema.userPositionMmr)).every((row) => row.seasonId === f.season.id)
    );
    assert.equal((await f.db.select().from(schema.discordInteractionReceipts)).length, 0);
});

test('웹 시즌은 공백·길이·확인·기준을 검증하고 같은 이름과 한글 100자를 허용한다', async (t) => {
    const f = await fixture(t);
    for (const patch of [
        { name: '' },
        { name: '   ' },
        { name: '가'.repeat(101) },
        { confirm: false },
        { expectedCurrentSeasonId: 'invalid' }
    ])
        await assert.rejects(f.rotate(patch), errorCode('INVALID_INPUT'));
    await assert.rejects(f.rotate({ expectedCurrentSeasonId: randomUUID() }), errorCode('CONFLICT'));
    const [other] = await f.db
        .insert(schema.mmrSeasons)
        .values({ guildId: f.ids.otherGuild, name: '다른 서버' })
        .returning();
    await assert.rejects(f.rotate({ expectedCurrentSeasonId: other!.id }), errorCode('CONFLICT'));
    const name = '가'.repeat(100);
    const first = await f.rotate({ name: ` ${name} ` });
    assert.equal(first.current!.name, name);
    const second = await f.rotate({ expectedCurrentSeasonId: first.current!.id, name });
    assert.equal(second.current!.name, name);
    assert.equal(second.completed.length, 2);
    assert.equal(second.completed[0]!.id, first.current!.id);
    assert.equal(second.completed[1]!.id, f.season.id);
    assert.equal((await f.db.select().from(schema.discordInteractionReceipts)).length, 0);
});

test('웹 시즌은 활성 시즌이 없거나 시작 시각이 미래이면 전환하지 않고 초기 설정을 합성하지 않는다', async (t) => {
    const f = await fixture(t);
    await f.db
        .update(schema.mmrSeasons)
        .set({ startedAt: new Date(Date.now() + 3_600_000) })
        .where(eq(schema.mmrSeasons.id, f.season.id));
    await assert.rejects(f.rotate(), errorCode('CONFLICT'));
    await f.db
        .update(schema.mmrSeasons)
        .set({ startedAt: new Date(0), endedAt: new Date() })
        .where(eq(schema.mmrSeasons.id, f.season.id));
    const completed = await getGuildSeasons(f.db, f.owner, f.ids.guild, f.dependencies);
    assert.equal(completed.current, null);
    assert.equal(completed.completed.length, 1);
    await assert.rejects(f.rotate(), errorCode('CONFLICT'));
    assert.deepEqual(await getGuildSeasons(f.db, f.owner, f.ids.guild, f.dependencies), completed);
    await assert.rejects(
        rotateGuildSeason(f.db, f.owner, f.ids.otherGuild, f.input, f.dependencies),
        errorCode('CONFLICT')
    );
    assert.equal((await f.db.select().from(schema.mmrSeasons)).length, 1);
});

test('웹 시즌은 매번 Discord 권한을 확인하고 공통 전환 안에서도 현재 운영 역할과 만료를 다시 검사한다', async (t) => {
    const f = await fixture(t);
    await f.db
        .insert(schema.guildDiscordSettings)
        .values({ guildId: f.ids.guild, operatorRoleId: f.ids.role });
    assert.ok((await getGuildSeasons(f.db, f.member, f.ids.guild, f.dependencies)).current);
    f.members.get(f.ids.guild)!.get(f.ids.member)!.roleIds = [];
    await assert.rejects(
        getGuildSeasons(f.db, f.member, f.ids.guild, f.dependencies),
        errorCode('FORBIDDEN')
    );
    await assert.rejects(
        rotateGuildSeason(f.db, f.member, f.ids.guild, f.input, f.dependencies),
        errorCode('FORBIDDEN')
    );
    f.members.get(f.ids.guild)!.get(f.ids.member)!.roleIds = [f.ids.role];
    await getGuildSeasons(f.db, f.member, f.ids.guild, f.dependencies);
    const validated = validateRotateGuildSeasonInput(f.input);
    await f.db
        .update(schema.guildDiscordSettings)
        .set({ operatorRoleId: null })
        .where(eq(schema.guildDiscordSettings.guildId, f.ids.guild));
    await assert.rejects(
        f.db.transaction((tx) => rotateGuildSeasonInTransaction(tx, f.member, f.ids.guild, validated)),
        errorCode('FORBIDDEN')
    );
    await f.db
        .update(schema.guildDiscordSettings)
        .set({ operatorRoleId: f.ids.role })
        .where(eq(schema.guildDiscordSettings.guildId, f.ids.guild));
    await f.db.update(schema.guildMembers).set({ syncedAt: new Date(0) });
    await assert.rejects(
        f.db.transaction((tx) => rotateGuildSeasonInTransaction(tx, f.member, f.ids.guild, validated)),
        errorCode('SERVICE_UNAVAILABLE')
    );
    assert.equal((await f.db.select().from(schema.mmrSeasons)).length, 1);
});

test('같은 현재 시즌을 기준으로 한 동시 웹 전환은 한 번만 성공하고 receipt를 만들지 않는다', async (t) => {
    const f = await fixture(t);
    const results = await Promise.allSettled([f.rotate(), f.rotate()]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = results.find((result) => result.status === 'rejected');
    assert.ok(rejected && rejected.status === 'rejected' && errorCode('CONFLICT')(rejected.reason));
    assert.equal((await f.db.select().from(schema.mmrSeasons)).length, 2);
    assert.equal(
        (await f.db.select().from(schema.mmrSeasons).where(isNull(schema.mmrSeasons.endedAt))).length,
        1
    );
    assert.equal((await f.db.select().from(schema.discordInteractionReceipts)).length, 0);
    await assert.rejects(f.rotate(), errorCode('CONFLICT'));
});

test('웹·봇 동시 전환은 공통 잠금으로 한 번만 성공하고 봇 interaction의 결과 재사용을 유지한다', async (t) => {
    const f = await fixture(t);
    const botInput = { ...f.input, actorId: f.ids.owner, interactionId: interactionId() };
    const results = await Promise.allSettled([
        f.rotate(),
        rotateBotSeason(f.db, f.ids.guild, botInput, f.dependencies)
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = results.find((result) => result.status === 'rejected');
    assert.ok(rejected && rejected.status === 'rejected' && errorCode('CONFLICT')(rejected.reason));
    const current = await getGuildSeasons(f.db, f.owner, f.ids.guild, f.dependencies);
    assert.equal(current.completed.length, 1);
    assert.equal(
        (await f.db.select().from(schema.mmrSeasons).where(isNull(schema.mmrSeasons.endedAt))).length,
        1
    );
    const receipts = await f.db.select().from(schema.discordInteractionReceipts);
    assert.equal(receipts.length, results[1]!.status === 'fulfilled' ? 1 : 0);
    if (results[1]!.status === 'fulfilled')
        assert.deepEqual(
            await rotateBotSeason(f.db, f.ids.guild, botInput, f.dependencies),
            results[1]!.value
        );
    const nextBotInput = {
        ...botInput,
        expectedCurrentSeasonId: current.current!.id,
        interactionId: interactionId()
    };
    const next = await rotateBotSeason(f.db, f.ids.guild, nextBotInput, f.dependencies);
    assert.deepEqual(await rotateBotSeason(f.db, f.ids.guild, nextBotInput, f.dependencies), next);
    assert.equal(next.completed.length, 2);
    await assert.rejects(
        rotateBotSeason(f.db, f.ids.guild, { ...nextBotInput, name: '다른 요청' }, f.dependencies),
        errorCode('CONFLICT')
    );
});

test('웹 새 시즌 저장 실패는 이전 시즌 종료도 같은 트랜잭션에서 롤백한다', async (t) => {
    const f = await fixture(t);
    await f.pool.query(
        "ALTER TABLE mmr_seasons ADD CONSTRAINT fixture_web_season_name CHECK (name <> '실패')"
    );
    const before = await f.db.select().from(schema.mmrSeasons);
    await assert.rejects(f.rotate({ name: '실패' }));
    assert.deepEqual(await f.db.select().from(schema.mmrSeasons), before);
    assert.equal((await f.db.select().from(schema.discordInteractionReceipts)).length, 0);
});
