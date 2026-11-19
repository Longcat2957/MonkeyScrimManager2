import type { Pool } from 'pg';

// 메트릭 모듈이 DB 모듈을 순환 참조하지 않도록 풀 참조만 따로 보관한다.
let activePool: Pool | null = null;

export function setDatabasePool(pool: Pool) {
    activePool = pool;
}

export function databasePoolStatus() {
    if (!activePool) return null;
    return {
        total: activePool.totalCount,
        idle: activePool.idleCount,
        waiting: activePool.waitingCount
    };
}
