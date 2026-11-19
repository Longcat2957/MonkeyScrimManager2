import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import type { BotSeasonSnapshot } from '../../../../../../shared/bot-api.js';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { assertAction, createHttpFixture, HTTP_BOT_TOKEN, HTTP_IDS } from '../../support/http.ts';
import { createHttpMatchResultFixture } from '../../support/http-match-fixtures.ts';

const path = '/internal/bot/guilds/' + HTTP_IDS.guild + '/seasons';
test('HTTP 시즌 명령은 봇 인증·실효 관리자·명시 확인·현재 시즌 충돌 검사를 유지한다', async (t) => {
    const f = await createHttpFixture(t);
    const read = async (actorId = HTTP_IDS.manager, token = HTTP_BOT_TOKEN) =>
        f.request(path + '?actorId=' + actorId, { headers: { authorization: 'Bearer ' + token } });
    assert.equal((await read(HTTP_IDS.manager, '')).status, 401);
    assert.equal((await read(HTTP_IDS.member)).status, 403);
    const before = await read();
    assert.equal(before.status, 200);
    assert.match(before.headers.get('cache-control')!, /no-store/);
    assert.equal(((await before.json()) as BotSeasonSnapshot).current!.id, f.season.id);
    const input = {
        actorId: HTTP_IDS.manager,
        interactionId: '996000000000000001',
        expectedCurrentSeasonId: f.season.id,
        name: '다음 시즌',
        confirm: true
    };
    assert.equal(
        (
            await f.request(path, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(input)
            })
        ).status,
        401
    );
    const rotate = (body: unknown) =>
        f.request(path, {
            method: 'POST',
            headers: { authorization: 'Bearer ' + HTTP_BOT_TOKEN, 'content-type': 'application/json' },
            body: JSON.stringify(body)
        });
    assert.equal((await rotate({ ...input, confirm: false })).status, 400);
    const response = await rotate(input);
    assert.equal(response.status, 200);
    const changed: BotSeasonSnapshot = await response.json();
    assert.notEqual(changed.current!.id, f.season.id);
    assert.deepEqual(await (await rotate(input)).json(), changed);
    assert.equal((await rotate({ ...input, interactionId: '996000000000000002' })).status, 409);
    assert.equal((await f.db.select().from(schema.mmrSeasons)).length, 2);
});

test('시즌을 전환해도 진행 중인 경기의 정상 ROFL은 고정한 이전 시즌에 반영한다', async (t) => {
    const f = await createHttpMatchResultFixture(t);
    const response = await f.request(path, {
        method: 'POST',
        headers: { authorization: 'Bearer ' + HTTP_BOT_TOKEN, 'content-type': 'application/json' },
        body: JSON.stringify({
            actorId: HTTP_IDS.manager,
            interactionId: '996000000000000003',
            expectedCurrentSeasonId: f.season.id,
            name: '새 시즌',
            confirm: true
        })
    });
    assert.equal(response.status, 200);
    const next: BotSeasonSnapshot = await response.json();
    assertAction(await f.record(), 200);
    const rows = await f.db.select().from(schema.userPositionMmr);
    assert.equal(rows.length, 10);
    assert.ok(rows.every((row) => row.seasonId === f.season.id));
    assert.equal(rows.filter((row) => row.seasonId === next.current!.id).length, 0);
    assert.equal(
        (await f.db.select().from(schema.scrims).where(eq(schema.scrims.id, f.scrim.id)))[0]!.mmrSeasonId,
        f.season.id
    );
});
