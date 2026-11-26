import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { createHttpFixture, HTTP_IDS, assertAction } from '../../support/http.ts';
import { createHttpMatchResultFixture } from '../../support/http-match-fixtures.ts';

async function waitFor(check: () => boolean | Promise<boolean>) {
    const until = Date.now() + 4000;
    while (Date.now() < until) {
        if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail('기대한 실제 요청 상태가 제한 시간 안에 관찰되지 않았다.');
}

test('실제 HTTP 요청 ID·업무 오류·부분 실패 로그는 비밀·원시 SQL·URL query를 남기지 않는다', async (t) => {
    const f = await createHttpFixture(t);
    const session = await f.session(HTTP_IDS.member);
    const privateText = 'fixture-private-query-header-riot-id';
    const response = await f.request('/docs?token=' + privateText, {
        headers: {
            cookie: session.cookie,
            authorization: 'Bearer ' + privateText,
            'x-request-id': privateText
        }
    });
    assert.equal(response.status, 200);
    const requestId = response.headers.get('x-request-id');
    assert.match(requestId ?? '', /^[0-9a-f-]{36}$/);
    await waitFor(() => f.requestObservations.some((line) => line.requestId === requestId));
    const entry = f.requestObservations.find((line) => line.requestId === requestId)!;
    assert.equal(entry.route, '/(site)/docs');
    assert.equal(entry.code, null);
    assert.ok(Number.isFinite(entry.durationMs));
    assert.deepEqual(
        Object.keys(entry).sort(),
        [
            'event',
            'requestId',
            'route',
            'kind',
            'method',
            'status',
            'code',
            'durationMs',
            'phases',
            'db',
            'upstream'
        ].sort()
    );
    const denied = await f.request(
        `/internal/bot/guilds/${HTTP_IDS.guild}/seasons?actorId=${HTTP_IDS.member}`,
        { headers: { authorization: 'Bearer ' + privateText } }
    );
    assert.equal(denied.status, 401);
    await waitFor(() =>
        f.requestObservations.some(
            (line) => line.requestId === denied.headers.get('x-request-id') && line.code === 'UNAUTHENTICATED'
        )
    );
    // 이 fixture의 schema만 잠깐 손상해 실제 예상 밖 DB 오류·복구를 재현한다.
    await f.pool.query('alter table guild_riot_accounts rename to accounts_temporarily_unavailable');
    try {
        const failed = await f.request('/me?private=' + privateText, { headers: { cookie: session.cookie } });
        assert.equal(failed.status, 500);
        await waitFor(() =>
            f.requestObservations.some((line) => line.route === '/(app)/me' && line.status === 500)
        );
    } finally {
        await f.pool.query('alter table accounts_temporarily_unavailable rename to guild_riot_accounts');
    }
    assert.equal((await f.request('/me', { headers: { cookie: session.cookie } })).status, 200);
    for (const secret of [
        privateText,
        session.cookie,
        session.cookie.split('=')[1]!,
        'guild_riot_accounts',
        HTTP_IDS.guild
    ])
        assert.equal(f.logsContain(secret), false, '로그에 요청 자료나 원시 DB 문구를 남기지 않는다.');
});

test('실제 upload 동시성 초과는 429·Retry-After로 거절하고 진행 요청 종료 뒤 정상 저장을 회복한다', async (t) => {
    const f = await createHttpMatchResultFixture(t, [], {
        operations: { ROFL_MAX_CONCURRENT: '1' }
    });
    const firstFields = await f.review(await f.confirm());
    const blocker = await f.pool.connect();
    let first: ReturnType<typeof f.action> | undefined;
    try {
        await blocker.query('begin');
        const pid = (await blocker.query('select pg_backend_pid() pid')).rows[0].pid as number;
        await blocker.query('select id from scrims where id=$1 for update', [f.scrim.id]);
        first = f.action(f.path, 'upload', { ...firstFields, file: f.file() }, f.participant.cookie);
        await waitFor(
            async () =>
                Number(
                    (
                        await f.pool.query(
                            'select count(*) n from pg_stat_activity where $1 = any(pg_blocking_pids(pid))',
                            [pid]
                        )
                    ).rows[0].n
                ) > 0
        );
        const limited = await f.action(
            f.path,
            'upload',
            { ...firstFields, file: f.file() },
            f.participant.cookie
        );
        assertAction(limited, 429);
        assert.equal(limited.response.headers.get('retry-after'), '2');
        assert.match(JSON.stringify(limited.result), /ROFL_OVERLOADED/);
        assert.equal((await f.db.select().from(schema.games)).length, 0);
        assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 0);
        await blocker.query('commit');
    } finally {
        await blocker.query('rollback');
        blocker.release();
    }
    assert.ok(first);
    assertAction(await first, 200);
    assert.equal((await f.db.select().from(schema.games)).length, 1);
    const next = await f.record(2, f.file(1_900_000));
    assertAction(next, 200);
    assert.equal(
        (await f.db.select().from(schema.games).where(eq(schema.games.status, 'completed'))).length,
        2
    );
    assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 20);
    await waitFor(() =>
        f.requestObservations.some((line) => line.code === 'ROFL_OVERLOADED' && line.status === 429)
    );
});
