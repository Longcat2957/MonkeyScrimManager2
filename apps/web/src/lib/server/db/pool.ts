import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import type { DatabaseLimits } from './config.ts';
import { captureOperationIssue, type OperationCode } from '../operations/context.ts';
import { OperationLimitError } from '../operations/errors.ts';

/** statement는 서버에서 취소하고 연결 점유 상한은 실제 연결 종료로 해제한다. */
export function boundedDatabasePool(connectionString: string, limits: DatabaseLimits, max = 10) {
    const url = new URL(connectionString);
    const options = url.searchParams.get('options') ?? '';
    url.searchParams.set(
        'options',
        `${options} -c statement_timeout=${limits.statementMs} -c lock_timeout=${limits.lockMs} -c transaction_timeout=${limits.leaseMs} -c idle_in_transaction_session_timeout=${limits.leaseMs}`.trim()
    );
    // URL의 별도 시작 매개변수가 위 제한을 덮어쓰지 않게 한다.
    for (const key of [
        'statement_timeout',
        'lock_timeout',
        'query_timeout',
        'transaction_timeout',
        'idle_in_transaction_session_timeout'
    ])
        url.searchParams.delete(key);
    const pool = new Pool({
        connectionString: url.href,
        max,
        connectionTimeoutMillis: 10_000,
        query_timeout: 0
    });
    type Lease = {
        timer: ReturnType<typeof setTimeout>;
        note: (code: OperationCode) => void;
        reason?: OperationCode;
    };
    const leases = new Map<PoolClient, Lease>();
    const clear = (client: PoolClient) => {
        clearTimeout(leases.get(client)?.timer);
        leases.delete(client);
    };
    const databaseCode = (cause: unknown): OperationCode | null => {
        const code = cause instanceof Error && 'code' in cause ? cause.code : null;
        return code === '57014'
            ? 'DB_QUERY_CANCELLED'
            : code === '55P03'
              ? 'DB_LOCK_UNAVAILABLE'
              : code === '25P04' || code === '25P03'
                ? 'DB_TRANSACTION_TIMEOUT'
                : null;
    };
    pool.on('connect', (client) => {
        client.on('error', (cause) => {
            const lease = leases.get(client);
            const code = databaseCode(cause);
            if (lease && code) {
                lease.reason = code;
                lease.note(code);
            }
        });
        client.once('end', () => {
            const lease = leases.get(client);
            if (lease) lease.note(lease.reason ?? 'DB_CONNECTION_LOST');
            clear(client);
        });
    });
    const startLease = (client: PoolClient, note: (code: OperationCode) => void) => {
        clear(client);
        const timer = setTimeout(() => {
            const lease = leases.get(client);
            if (!lease) return;
            lease.reason = 'DB_CONNECTION_TIMEOUT';
            note('DB_CONNECTION_TIMEOUT');
            // 서버의 statement/transaction 종료 뒤 응답 유예 1초도 지났으면 실제 연결을 닫는다.
            void client.end().catch(() => {});
        }, limits.leaseMs + 1000);
        timer.unref();
        leases.set(client, { timer, note });
    };
    const connect = pool.connect.bind(pool);
    type ConnectCallback = Parameters<Pool['connect']>[0];
    // acquire는 이전 요청의 release 문맥일 수 있으므로 요청자가 connect할 때 recorder를 캡처한다.
    pool.connect = ((callback?: ConnectCallback) => {
        const note = captureOperationIssue();
        const failure = (cause: Error) => {
            const timeout = [
                'timeout exceeded when trying to connect',
                'Connection terminated due to connection timeout'
            ].includes(cause.message);
            const code = timeout ? 'DB_CONNECTION_TIMEOUT' : 'DB_CONNECTION_LOST';
            note(code);
            return new OperationLimitError(
                code,
                503,
                '데이터베이스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',
                1
            );
        };
        if (callback)
            return connect((error, client, done) => {
                if (error && !client) return callback(failure(error), client, done);
                if (client) startLease(client, note);
                callback(error, client, done);
            });
        return connect().then(
            (client) => {
                startLease(client, note);
                return client;
            },
            (cause: Error) => {
                throw failure(cause);
            }
        );
    }) as Pool['connect'];
    pool.on('release', (cause, client) => {
        const code = databaseCode(cause);
        if (code) leases.get(client)?.note(code);
        clear(client);
    });
    pool.on('error', () => console.error(JSON.stringify({ event: 'database', code: 'CONNECTION_ERROR' })));
    return pool;
}
