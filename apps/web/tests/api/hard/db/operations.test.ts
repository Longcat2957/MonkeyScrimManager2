import assert from 'node:assert/strict';
import test from 'node:test';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { boundedDatabasePool } from '../../../../src/lib/server/db/pool.ts';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { actionFailure } from '../../../../src/lib/server/actions.ts';
import { observeRequest } from '../../../../src/lib/server/operations/context.ts';
import { createTestDatabase } from '../../support/database.ts';
import { OperationLimitError } from '../../../../src/lib/server/operations/errors.ts';

test('서버 statement timeout은 실제 SQL·트랜잭션을 취소하고 다음 풀 요청은 정상 처리한다', async (t) => {
    const fixture = await createTestDatabase(t);
    const pool = boundedDatabasePool(
        fixture.connectionString,
        { lockMs: 50, statementMs: 150, leaseMs: 1000 },
        1
    );
    t.after(() => pool.end());
    const db = drizzle({ client: pool, schema });
    assert.equal((await pool.query('select current_schema() s')).rows[0].s, fixture.schemaName);
    assert.equal((await pool.query('show statement_timeout')).rows[0].statement_timeout, '150ms');
    const userId = '970000000000009001';
    await assert.rejects(
        db.transaction(async (tx) => {
            await tx.insert(schema.users).values({ id: userId, username: '롤백 대상' });
            await tx.execute(sql`select pg_sleep(3)`);
        }),
        (cause) => actionFailure(cause).status === 503
    );
    assert.equal((await fixture.db.select().from(schema.users).where(eq(schema.users.id, userId))).length, 0);
    assert.equal((await pool.query('select 1 n')).rows[0].n, 1);
    assert.equal(pool.waitingCount, 0);
});

test('서버 lock timeout은 잠금 대기를 실제 해제하고 실패한 변경을 남기지 않는다', async (t) => {
    const fixture = await createTestDatabase(t);
    const pool = boundedDatabasePool(
        fixture.connectionString,
        { lockMs: 50, statementMs: 300, leaseMs: 1000 },
        1
    );
    t.after(() => pool.end());
    const userId = '970000000000009002';
    await fixture.db.insert(schema.users).values({ id: userId, username: '원래 이름' });
    const blocker = await fixture.pool.connect();
    try {
        await blocker.query('begin');
        await blocker.query('select id from users where id=$1 for update', [userId]);
        await assert.rejects(
            pool.query('update users set username=$1 where id=$2', ['바뀌면 안 됨', userId]),
            (error) => actionFailure(error).status === 503
        );
    } finally {
        await blocker.query('rollback');
        blocker.release();
    }
    assert.equal(
        (await fixture.db.select().from(schema.users).where(eq(schema.users.id, userId)))[0]!.username,
        '원래 이름'
    );
    assert.equal((await pool.query('select 1 n')).rows[0].n, 1);
});

test('서버 transaction timeout은 열린 작업을 롤백하고 연결 종료 뒤 풀을 회복한다', async (t) => {
    const fixture = await createTestDatabase(t);
    const pool = boundedDatabasePool(
        fixture.connectionString,
        { lockMs: 50, statementMs: 250, leaseMs: 600 },
        1
    );
    t.after(() => pool.end());
    const db = drizzle({ client: pool, schema });
    const userId = '970000000000009003';
    const logs: string[] = [];
    await observeRequest(
        { requestId: 'transaction', routeId: '/fixture', method: 'POST' },
        async () => {
            try {
                await db.transaction(async (tx) => {
                    await tx.insert(schema.users).values({ id: userId, username: '미커밋' });
                    await new Promise((resolve) => setTimeout(resolve, 750));
                    await tx.execute(sql`select 1`);
                });
                assert.fail('시간 제한을 넘은 트랜잭션은 커밋하면 안 된다.');
            } catch (cause) {
                return new Response('', { status: actionFailure(cause).status });
            }
        },
        (line) => logs.push(line)
    );
    assert.equal(JSON.parse(logs[0]!).status, 503);
    assert.ok(['DB_TRANSACTION_TIMEOUT', 'DB_CONNECTION_LOST'].includes(JSON.parse(logs[0]!).code));
    assert.equal((await fixture.db.select().from(schema.users).where(eq(schema.users.id, userId))).length, 0);
    assert.equal((await pool.query('select 1 n')).rows[0].n, 1);
});

test('포화 풀의 반환 문맥이 달라도 연결 점유 제한은 대기한 요청에만 귀속한다', async (t) => {
    const fixture = await createTestDatabase(t);
    const pool = boundedDatabasePool(
        fixture.connectionString,
        { lockMs: 30, statementMs: 100, leaseMs: 200 },
        1
    );
    t.after(() => pool.end());
    const logs: string[] = [];
    let releaseFirst!: () => void;
    let firstAcquired!: () => void;
    const acquired = new Promise<void>((resolve) => {
        firstAcquired = resolve;
    });
    const gate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
    });
    const first = observeRequest(
        { requestId: 'releasing-request', routeId: '/first', method: 'GET' },
        async () => {
            const client = await pool.connect();
            firstAcquired();
            await gate;
            client.release();
            return new Response('');
        },
        (line) => logs.push(line)
    );
    await acquired;
    const second = observeRequest(
        { requestId: 'waiting-request', routeId: '/second', method: 'GET' },
        async () => {
            const client = await pool.connect();
            try {
                await new Promise((resolve) => setTimeout(resolve, 1350));
                await client.query('select 1');
                assert.fail('점유 시간이 지난 연결은 종료돼야 한다.');
            } catch (cause) {
                return new Response('', { status: actionFailure(cause).status });
            } finally {
                client.release();
            }
        },
        (line) => logs.push(line)
    );
    assert.equal(pool.waitingCount, 1);
    releaseFirst();
    await Promise.all([first, second]);
    const values = logs.map((line) => JSON.parse(line));
    assert.equal(values.find((value) => value.requestId === 'releasing-request').code, null);
    assert.equal(values.find((value) => value.requestId === 'waiting-request').code, 'DB_CONNECTION_TIMEOUT');
    assert.equal(values.find((value) => value.requestId === 'waiting-request').status, 503);
    assert.equal((await pool.query('select 1 n')).rows[0].n, 1);
});

test('포화 풀의 연결 대기 만료는 Promise·callback 모두 안전한 503이며 반환 뒤 회복한다', async (t) => {
    const fixture = await createTestDatabase(t);
    const pool = boundedDatabasePool(
        fixture.connectionString,
        { lockMs: 50, statementMs: 150, leaseMs: 1000 },
        1
    );
    t.after(() => pool.end());
    const held = await pool.connect();
    // 실제 풀의 대기 경로를 짧게 재현한다. 앱 기본 연결 대기 10초는 변경하지 않는다.
    pool.options.connectionTimeoutMillis = 35;
    const logs: string[] = [];
    try {
        for (const mode of ['promise', 'callback'])
            await observeRequest(
                { requestId: mode, routeId: '/waiting', method: 'GET' },
                async () => {
                    try {
                        if (mode === 'promise') await pool.connect();
                        else
                            await new Promise<void>((resolve, reject) => {
                                pool.connect((cause, client, done) => {
                                    if (cause) reject(cause);
                                    else {
                                        assert.ok(client);
                                        done();
                                        resolve();
                                    }
                                });
                            });
                        assert.fail('연결 대기는 제한 시간 안에 실패해야 한다.');
                    } catch (cause) {
                        assert.ok(cause instanceof OperationLimitError);
                        assert.equal(cause.code, 'DB_CONNECTION_TIMEOUT');
                        assert.equal(cause.retryAfterSeconds, 1);
                        assert.equal('cause' in cause, false);
                        return new Response('', { status: actionFailure(cause).status });
                    }
                },
                (line) => logs.push(line)
            );
    } finally {
        held.release();
    }
    assert.equal(pool.waitingCount, 0);
    assert.equal((await pool.query('select 1 n')).rows[0].n, 1);
    assert.equal(logs.length, 2);
    assert.ok(
        logs.every((line) => {
            const entry = JSON.parse(line);
            return entry.status === 503 && entry.code === 'DB_CONNECTION_TIMEOUT';
        })
    );
});

test('요청 관측은 실제 SQL 시간을 db 집계에 남기고 SQL 원문을 로그에 넣지 않는다', async (t) => {
    const fixture = await createTestDatabase(t);
    const pool = boundedDatabasePool(
        fixture.connectionString,
        { lockMs: 50, statementMs: 500, leaseMs: 1000 },
        1
    );
    t.after(() => pool.end());
    const logs: string[] = [];
    await observeRequest(
        { requestId: 'db-timing', routeId: '/fixture', method: 'GET' },
        async () => {
            await pool.query('select pg_sleep(0.02)');
            return new Response('');
        },
        (line) => logs.push(line)
    );
    const [value] = logs.map((line) => JSON.parse(line));
    assert.equal(value.db.count, 1);
    assert.ok(value.db.totalMs >= 1);
    assert.ok(value.db.maxMs >= 1);
    assert.ok(!logs.join('').includes('pg_sleep'));
});
