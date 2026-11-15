export type DatabaseLimits = { statementMs: number; lockMs: number; leaseMs: number };

/** 연결 주소와 독립된 제한만 읽는다. 잘못된 운영 값을 조용히 무제한으로 바꾸지 않는다. */
export function databaseLimits(values: Record<string, string | undefined>): DatabaseLimits {
    const read = (key: string, fallback: number) => {
        const text = values[key]?.trim();
        const value = text ? Number(text) : fallback;
        if (!Number.isSafeInteger(value) || value < 1 || value > 300_000)
            throw new Error(`${key}는 1~300000밀리초 정수여야 합니다.`);
        return value;
    };
    const limits = {
        statementMs: read('DB_STATEMENT_TIMEOUT_MS', 15_000),
        lockMs: read('DB_LOCK_TIMEOUT_MS', 5_000),
        leaseMs: read('DB_QUERY_TIMEOUT_MS', 30_000)
    };
    if (limits.lockMs >= limits.statementMs || limits.statementMs >= limits.leaseMs)
        throw new Error('DB 제한은 lock < statement < query 순서여야 합니다.');
    return limits;
}
