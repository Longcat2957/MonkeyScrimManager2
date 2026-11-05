import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { assertAction, HTTP_IDS } from '../../support/http.ts';
import { createHttpMatchResultFixture } from '../../support/http-match-fixtures.ts';

type Fixture = Awaited<ReturnType<typeof createHttpMatchResultFixture>>;

async function cancelledResult(f: Fixture) {
    const original = await f.confirm();
    assertAction(
        await f.action(f.path, 'upload', { ...original, file: f.file() }, f.participant.cookie),
        200
    );
    const [game] = await f.db.select().from(schema.games);
    assertAction(
        await f.action(
            f.path,
            'revertResult',
            { expectedRevision: String((await f.matchRow()).revision), gameId: game!.id },
            f.manager.cookie
        ),
        200
    );
    return {
        original,
        game: game!,
        current: { ...original, expectedRevision: String((await f.matchRow()).revision) }
    };
}

test('HTTP 복구: 취소한 동일 파일을 현재 슬롯에 재업로드하면 Riot 재조회 없이 새 Game과 기존 ROFL을 연결한다', async (t) => {
    const f = await createHttpMatchResultFixture(t);
    const { game, current } = await cancelledResult(f);
    const riotCalls = f.upstreamCalls.filter((url) => url.includes('/riot/account/')).length;
    const reply = await f.action(f.path, 'upload', { ...current, file: f.file() }, f.participant.cookie);
    assertAction(reply, 200);
    assert.equal(f.upstreamCalls.filter((url) => url.includes('/riot/account/')).length, riotCalls);
    const games = await f.db.select().from(schema.games);
    assert.equal(games.length, 2);
    assert.equal(games.find((row) => row.id === game.id)?.status, 'cancelled');
    const restored = games.find((row) => row.status === 'completed');
    assert.ok(restored);
    assert.notEqual(restored.id, game.id);
    assert.equal(restored.gameNumber, 1);
    assert.equal(restored.roflMetadataId, game.roflMetadataId);
    assert.equal((await f.db.select().from(schema.roflMetadata)).length, 1);
    assert.equal((await f.db.select().from(schema.gameParticipants)).length, 20);
    assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 30);
    assert.equal((await f.request(f.path + '?game=' + restored.id)).status, 200);
});

test('HTTP 복구: 오래된 요청·다른 세트·서버·파일 변형과 권한 없는 요청은 복구하지 않는다', async (t) => {
    const f = await createHttpMatchResultFixture(t);
    const { original, game, current } = await cancelledResult(f);
    const fields = { ...current, file: f.file() };
    assertAction(await f.action(f.path, 'upload', fields), 401);
    const outsider = await f.session(HTTP_IDS.outsider);
    assertAction(await f.action(f.path, 'upload', fields, outsider.cookie), 404);
    assertAction(
        await f.action(
            f.path.replace(HTTP_IDS.guild, HTTP_IDS.otherGuild),
            'upload',
            fields,
            f.manager.cookie
        ),
        404
    );
    assertAction(
        await f.action(f.path, 'upload', { ...original, file: f.file() }, f.participant.cookie),
        409
    );
    assertAction(
        await f.action(
            f.path,
            'upload',
            { ...current, expectedGameNumber: '2', file: f.file() },
            f.participant.cookie
        ),
        409
    );
    assertAction(
        await f.action(f.path, 'upload', { ...current, file: f.file(1_800_125, 0x43) }, f.participant.cookie),
        409
    );
    assert.equal((await f.db.select().from(schema.games)).length, 1);
    assert.equal(
        (await f.db.select().from(schema.games).where(eq(schema.games.id, game.id)))[0]!.status,
        'cancelled'
    );
    assert.equal((await f.db.select().from(schema.roflMetadata)).length, 1);
    assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 20);
});

test('HTTP 복구: 동시에 재업로드하고 같은 성공 요청을 반복해도 결과와 점수가 한 번만 반영된다', async (t) => {
    const f = await createHttpMatchResultFixture(t);
    const { current } = await cancelledResult(f);
    const request = () => f.action(f.path, 'upload', { ...current, file: f.file() }, f.participant.cookie);
    const replies = await Promise.all([request(), request()]);
    for (const reply of replies) assertAction(reply, 200);
    assert.deepEqual(replies[0]!.result, replies[1]!.result);
    const repeated = await request();
    assertAction(repeated, 200);
    assert.deepEqual(repeated.result, replies[0]!.result);
    assert.equal((await f.db.select().from(schema.games)).length, 2);
    assert.equal((await f.db.select().from(schema.matchRoflImports)).length, 2);
    assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 30);
});
