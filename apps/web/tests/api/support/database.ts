import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { TestContext } from 'node:test';
import { getTableName, sql, type Table } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client, Pool } from 'pg';
import * as schema from '../../../src/lib/server/db/schema.ts';
import type { Database } from '../../../src/lib/server/db/types.ts';

export interface TestDatabase {
    db: Database;
    pool: Pool;
    schemaName: string;
    /** 테스트가 소유한 schema로 연결이 제한된 주소다. 로그에 출력하지 않는다. */
    connectionString: string;
    migrationSql(tag: string): string;
    close(): Promise<void>;
}

async function loadMigrations() {
    const directory = new URL('../../../drizzle/', import.meta.url);
    const journal = JSON.parse(await readFile(new URL('meta/_journal.json', directory), 'utf8')) as {
        entries: { tag: string }[];
    };
    if (!journal.entries.length) throw new Error('테스트에 적용할 DB 초기 SQL이 없습니다.');
    return Promise.all(
        journal.entries.map(async ({ tag }) => {
            if (!/^\d+_[a-zA-Z0-9_]+$/.test(tag))
                throw new Error('DB journal의 SQL 파일 이름이 올바르지 않습니다.');
            return { tag, sql: await readFile(new URL(`${tag}.sql`, directory), 'utf8') };
        })
    );
}
let sources: Promise<{ tag: string; sql: string }[]> | undefined;

/** 호출자가 지정한 테스트 테이블의 모든 행을 한 SQL 스냅샷에서 비교한다. */
export async function snapshotTables(db: Database, tables: readonly Table[]) {
    const columns = tables.map(
        (table) => sql`
        ARRAY(SELECT row_to_json(r)::text COLLATE "C" FROM ${table} r ORDER BY 1)
        AS ${sql.identifier(getTableName(table))}`
    );
    const { rows } = await db.execute<Record<string, string[]>>(sql`SELECT ${sql.join(columns, sql`, `)}`);
    return rows[0]!;
}

export function testDatabaseUrl(): string {
    const value = process.env.TEST_DATABASE_URL?.trim();
    if (!value)
        throw new Error(
            'hard 테스트에는 TEST_DATABASE_URL이 필요합니다. apps/web/.env.test 또는 실행 환경에 설정해 주세요.'
        );
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error('TEST_DATABASE_URL은 PostgreSQL 연결 URL이어야 합니다.');
    }
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname.length < 2) {
        throw new Error('TEST_DATABASE_URL에는 PostgreSQL 프로토콜과 테스트 DB 이름이 필요합니다.');
    }
    return value;
}

/** 각 시나리오는 실제 커밋을 사용한다. 테스트 바깥 트랜잭션으로 서비스의 커밋을 대체하지 않는다. */
export async function createTestDatabase(
    t: TestContext,
    options: { maxConnections?: number; beforeClose?: () => Promise<void> } = {}
): Promise<TestDatabase> {
    const base = testDatabaseUrl();
    const schemaName = `msm2_api_test_${randomUUID().replaceAll('-', '')}`;
    const quoted = `"${schemaName}"`;
    const migrations = await (sources ??= loadMigrations());
    // 실제 배포 SQL을 재사용하며 public 한정 참조만 이번 테스트의 schema로 옮긴다.
    const scopedSql = (sql: string) =>
        sql.replaceAll('"public".', `${quoted}.`).replace(/\bpublic\./g, `${quoted}.`);
    function migrationSql(tag: string) {
        const migration = migrations.find((entry) => entry.tag === tag);
        if (!migration) throw new Error(`DB journal에 없는 마이그레이션: ${tag}`);
        return scopedSql(migration.sql);
    }
    const admin = new Client({ connectionString: base, connectionTimeoutMillis: 10_000 });
    let connected = false;
    let created = false;
    let pool: Pool | undefined;
    let closing: Promise<void> | undefined;
    function close(): Promise<void> {
        return (closing ??= (async () => {
            try {
                // 앱 프로세스를 사용하는 호출자는 먼저 앱을 종료한 뒤 이 함수를 호출한다.
                try {
                    await options.beforeClose?.();
                } finally {
                    if (pool) await pool.end();
                }
            } finally {
                try {
                    if (created) await admin.query(`DROP SCHEMA IF EXISTS ${quoted} CASCADE`);
                } finally {
                    if (connected) await admin.end();
                }
            }
        })());
    }
    t.after(close);
    try {
        await admin.connect();
        connected = true;
        await admin.query("SET statement_timeout = '15s'");
        await admin.query("SET lock_timeout = '5s'");
        await admin.query(`CREATE SCHEMA ${quoted}`);
        created = true;
        await admin.query('BEGIN');
        try {
            await admin.query(`SET LOCAL search_path TO ${quoted}`);
            await admin.query("SET LOCAL statement_timeout = '15s'");
            for (const { sql } of migrations) await admin.query(scopedSql(sql));
            await admin.query('COMMIT');
        } catch (cause) {
            await admin.query('ROLLBACK');
            throw cause;
        }
        const scoped = new URL(base);
        scoped.searchParams.set(
            'options',
            `-c search_path=${schemaName} -c statement_timeout=15000 -c lock_timeout=5000`
        );
        pool = new Pool({
            connectionString: scoped.href,
            max: options.maxConnections ?? 4,
            connectionTimeoutMillis: 10_000
        });
        const db = drizzle({ client: pool, schema });
        return { db, pool, schemaName, migrationSql, connectionString: scoped.href, close };
    } catch (cause) {
        try {
            await close();
        } catch (cleanup) {
            throw new AggregateError([cause, cleanup], '테스트 DB 준비와 정리에 실패했습니다.');
        }
        throw cause;
    }
}
