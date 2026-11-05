import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { assertAction, HTTP_IDS } from '../../support/http.ts';
import { createHttpMatchResultFixture } from '../../support/http-match-fixtures.ts';
import { replayBytes, replayPlayer } from '../../support/rofl-fixtures.ts';

test('HTTP 경기: 공개 조회와 관리자 라인업 확정·실제 출전자 ROFL 업로드를 연결한다', async (t) => {
    const f = await createHttpMatchResultFixture(t);
    assert.equal((await f.request(f.path)).status, 200);
    assertAction(await f.action(f.path, 'confirmLineup', await f.lineupFields(), f.participant.cookie), 403);
    const slot = await f.confirm();
    const reply = await f.action(f.path, 'upload', { ...slot, file: f.file() }, f.participant.cookie);
    assertAction(reply, 200);
    const games = await f.db.select().from(schema.games);
    assert.equal(games.length, 1);
    assert.equal(games[0]!.status, 'completed');
    assert.equal((await f.db.select().from(schema.gameParticipants)).length, 10);
    assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 10);
    assert.equal((await f.request(f.path + '?game=' + games[0]!.id)).status, 200);
    assert.ok(f.upstreamCalls.some((url) => url.includes('/riot/account/v1/accounts/by-riot-id/')));
});

test('HTTP 경기: 인증·서버 소속·경기 참가·다른 서버 ID를 검증하며 거부 요청은 저장하지 않는다', async (t) => {
    const f = await createHttpMatchResultFixture(t);
    const slot = await f.confirm();
    const outsider = await f.session(HTTP_IDS.outsider);
    assertAction(await f.action(f.path, 'upload', { ...slot, file: f.file() }), 401);
    assertAction(await f.action(f.path, 'upload', { ...slot, file: f.file() }, outsider.cookie), 404);
    const otherPath = f.path.replace(HTTP_IDS.guild, HTTP_IDS.otherGuild);
    assertAction(await f.action(otherPath, 'upload', { ...slot, file: f.file() }, f.manager.cookie), 404);
    assert.equal((await f.db.select().from(schema.games)).length, 0);
    assert.equal((await f.db.select().from(schema.roflMetadata)).length, 0);
});

test('HTTP 경기: 누락된 파일·잘못된 확장자·손상된 ROFL·잘못된 revision을 정상 오류로 반환한다', async (t) => {
    const f = await createHttpMatchResultFixture(t);
    const slot = await f.confirm();
    assertAction(await f.action(f.path, 'upload', slot, f.manager.cookie), 400);
    assertAction(
        await f.action(
            f.path,
            'upload',
            { ...slot, file: new File(['wrong'], 'wrong.txt') },
            f.manager.cookie
        ),
        400
    );
    assertAction(
        await f.action(
            f.path,
            'upload',
            { ...slot, file: new File(['broken'], 'wrong.rofl') },
            f.manager.cookie
        ),
        400
    );
    assertAction(
        await f.action(
            f.path,
            'upload',
            { ...slot, expectedRevision: '-1', file: f.file() },
            f.manager.cookie
        ),
        400
    );
    assert.equal((await f.db.select().from(schema.games)).length, 0);
});

test('HTTP 경기: 동시에 같은 파일을 올려도 한 번만 저장하며 다른 바이트의 동일 결과는 409다', async (t) => {
    const f = await createHttpMatchResultFixture(t);
    const slot = await f.confirm();
    const replies = await Promise.all(
        [1, 2].map(() => f.action(f.path, 'upload', { ...slot, file: f.file() }, f.participant.cookie))
    );
    for (const reply of replies) assertAction(reply, 200);
    assertAction(await f.action(f.path, 'upload', { ...slot, file: f.file() }, f.participant.cookie), 200);
    assertAction(
        await f.action(f.path, 'upload', { ...slot, file: f.file(1_800_125, 0x43) }, f.participant.cookie),
        409
    );
    assert.equal((await f.db.select().from(schema.games)).length, 1);
    assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 10);
});

test('HTTP 경기: 라인업 해제 후 오래된 업로드를 거절하고 정정 뒤 원본 재전송을 차단한다', async (t) => {
    const f = await createHttpMatchResultFixture(t);
    const old = await f.confirm();
    assertAction(await f.action(f.path, 'releaseLineup', old, f.manager.cookie), 200);
    assertAction(await f.action(f.path, 'upload', { ...old, file: f.file() }, f.participant.cookie), 403);
    assertAction(await f.action(f.path, 'upload', { ...old, file: f.file() }, f.manager.cookie), 409);
    const current = await f.confirm();
    assertAction(await f.action(f.path, 'upload', { ...current, file: f.file() }, f.participant.cookie), 200);
    const [game] = await f.db.select().from(schema.games);
    assertAction(
        await f.action(
            f.path,
            'revertResult',
            { expectedRevision: String((await f.matchRow()).revision), gameId: game!.id },
            f.participant.cookie
        ),
        403
    );
    assertAction(
        await f.action(
            f.path,
            'revertResult',
            { expectedRevision: String((await f.matchRow()).revision), gameId: game!.id },
            f.manager.cookie
        ),
        200
    );
    assert.equal(
        (await f.db.select().from(schema.games).where(eq(schema.games.id, game!.id)))[0]!.status,
        'cancelled'
    );
    assertAction(await f.action(f.path, 'upload', { ...current, file: f.file() }, f.participant.cookie), 409);
    assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 20);
});

test('HTTP 경기: 외부 계정 확인 실패는 502로 반환하고 게임과 ROFL을 남기지 않는다', async (t) => {
    const f = await createHttpMatchResultFixture(t, [
        {
            method: 'GET',
            url: 'https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/ReplayPlayer0/KR1',
            status: 503,
            body: {}
        }
    ]);
    const slot = await f.confirm();
    assertAction(await f.action(f.path, 'upload', { ...slot, file: f.file() }, f.participant.cookie), 502);
    assert.equal((await f.db.select().from(schema.games)).length, 0);
    assert.equal((await f.db.select().from(schema.roflMetadata)).length, 0);
});

test('HTTP 경기: 512KiB보다 큰 ROFL도 저장하고 다음 세트는 기존 라인업을 그대로 사용한다', async (t) => {
    const f = await createHttpMatchResultFixture(t);
    const slot = await f.confirm();
    const large = f.file(1_800_125, 0x42, 1024 * 1024);
    assert.ok(large.size > 512 * 1024);
    assertAction(await f.action(f.path, 'upload', { ...slot, file: large }, f.participant.cookie), 200);
    assertAction(
        await f.action(
            f.path,
            'releaseLineup',
            { expectedRevision: String((await f.matchRow()).revision), lineupId: slot.lineupId },
            f.manager.cookie
        ),
        409
    );
    const second = {
        ...slot,
        expectedRevision: String((await f.matchRow()).revision),
        expectedGameNumber: '2'
    };
    assertAction(
        await f.action(f.path, 'upload', { ...second, file: f.file(1_900_000) }, f.participant.cookie),
        200
    );
    assert.equal((await f.db.select().from(schema.matchLineups)).length, 1);
    assert.equal((await f.matchRow()).status, 'completed');
    assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 20);
});

test('HTTP 경기: 파일의 팀·포지션으로 미연결 부계정을 당시 출전에 귀속하고 서버 대표 계정은 유지한다', async (t) => {
    const f = await createHttpMatchResultFixture(t, [
        {
            method: 'GET',
            url: 'https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/AlternateTop/KR1',
            body: { puuid: 'fixture-http-alternate-top', gameName: 'AlternateTop', tagLine: 'KR1' }
        }
    ]);
    const slot = await f.confirm();
    const links = await f.db.select().from(schema.guildRiotAccounts);
    const players = f.identities.map((person, index) =>
        replayPlayer(index === 0 ? 'AlternateTop' : person.gameName, person.tagLine, index)
    );
    const file = new File([Uint8Array.from(replayBytes(players.reverse()))], 'alternate.rofl');
    assertAction(await f.action(f.path, 'upload', { ...slot, file }, f.participant.cookie), 200);
    const [account] = await f.db
        .select()
        .from(schema.riotAccounts)
        .where(eq(schema.riotAccounts.puuid, 'fixture-http-alternate-top'));
    assert.ok(account);
    const [played] = await f.db
        .select()
        .from(schema.gameParticipants)
        .where(eq(schema.gameParticipants.scrimParticipantId, f.people[0]!.id));
    assert.equal(played?.riotAccountId, account.id);
    assert.equal(played?.roflParticipantIndex, 9);
    assert.deepEqual(await f.db.select().from(schema.guildRiotAccounts), links);
});
