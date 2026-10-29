import { dev } from '$app/env';
import { DATABASE_URL } from '$app/env/private';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

const developmentState = globalThis as typeof globalThis & {
	__msm2PostgresPool?: Pool;
};

function createDatabase() {
	const connectionString = DATABASE_URL.trim();
	if (!connectionString) {
		throw new Error('DATABASE_URL을 apps/web/.env 또는 서버 환경 변수에 설정해 주세요.');
	}

	let pool = dev ? developmentState.__msm2PostgresPool : undefined;
	if (!pool) {
		pool = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 10_000 });
		pool.on('error', () => {
			console.error('[database] PostgreSQL 유휴 연결에서 오류가 발생했습니다.');
		});
		if (dev) developmentState.__msm2PostgresPool = pool;
	}

	// 개발 중 HMR에서는 연결 풀을 재사용하고, Drizzle은 현재 스키마로 새로 구성한다.
	return drizzle({ client: pool, schema });
}

let database: ReturnType<typeof createDatabase> | undefined;

/** DB 설정 전에도 모듈 로딩과 빌드가 가능하도록 처음 사용할 때 초기화한다. */
export function getDb() {
	return database ??= createDatabase();
}
