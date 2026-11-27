import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import {
    recordDatabasePoolWait,
    recordDatabaseQuery,
    recordHttpRequest,
    recordUpstreamRequest
} from './metrics.ts';

export type OperationCode =
    | 'INVALID_INPUT'
    | 'UNAUTHENTICATED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'SERVICE_UNAVAILABLE'
    | 'DB_QUERY_CANCELLED'
    | 'DB_LOCK_UNAVAILABLE'
    | 'DB_CONNECTION_TIMEOUT'
    | 'DB_CONNECTION_LOST'
    | 'DB_TRANSACTION_TIMEOUT'
    | 'ROFL_OVERLOADED'
    | 'ROFL_RATE_LIMITED'
    | 'ROFL_BODY_TIMEOUT'
    | 'ROFL_BODY_TOO_LARGE'
    | 'ROFL_PROCESSING_TIMEOUT'
    | 'ROFL_PROCESSING_FAILED'
    | 'ROFL_ABORTED'
    | 'DISCORD_UNAVAILABLE'
    | 'RIOT_UNAVAILABLE'
    | 'HTTP_ERROR'
    | 'INTERNAL_ERROR';

type Duration = { count: number; totalMs: number; maxMs: number };
type Observation = {
    requestId: string;
    onGuildVerified?: (guildId: string) => void;
    route: string;
    kind: string;
    method: string;
    status: number;
    code: OperationCode | null;
    sessionMs: number;
    accessMs: number;
    db: Duration & { waitMs: number; slow: number };
    upstream: Record<string, Duration>;
    write: (line: string) => void;
};
const observations = new AsyncLocalStorage<Observation>();
const methods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
// statement timeout보다 훨씬 짧은 값으로 실제 병목 후보만 남긴다.
const SLOW_DATABASE_MS = 200;

export function requestMethod(method: string) {
    return methods.has(method) ? method : 'OTHER';
}

function round(milliseconds: number) {
    return Math.round(milliseconds * 100) / 100;
}

function addDuration(target: Duration, durationMs: number) {
    target.count += 1;
    target.totalMs += durationMs;
    target.maxMs = Math.max(target.maxMs, durationMs);
}

/** 요청에서 실제로 확인한 길드만 서버 훅에 전달한다. */
export function noteVerifiedGuild(guildId: string) {
    observations.getStore()?.onGuildVerified?.(guildId);
}

export function currentOperationCode() {
    return observations.getStore()?.code ?? null;
}

/** 타이머·풀 콜백이 다른 비동기 문맥에서 실행돼도 원래 요청에만 기록한다. */
export function captureOperationIssue() {
    const current = observations.getStore();
    return (code: OperationCode) => {
        if (current) current.code = code;
    };
}

export function noteOperationIssue(code: OperationCode) {
    captureOperationIssue()(code);
}

export function noteResponseStatus(status: number) {
    const current = observations.getStore();
    if (current) current.status = status;
}

export function notePhase(name: 'sessionMs' | 'accessMs', durationMs: number) {
    const current = observations.getStore();
    if (current) current[name] = durationMs;
}

export function noteDatabaseQuery(durationMs: number, ok: boolean, sql?: string) {
    recordDatabaseQuery(durationMs, ok);
    const current = observations.getStore();
    if (!current) return;
    addDuration(current.db, durationMs);
    if (durationMs < SLOW_DATABASE_MS) return;
    current.db.slow += 1;
    try {
        current.write(
            JSON.stringify({
                event: 'db_slow',
                requestId: current.requestId,
                route: current.route,
                durationMs: round(durationMs),
                fingerprint: sql ? createHash('sha256').update(sql).digest('hex').slice(0, 12) : null
            })
        );
    } catch {}
}

export function noteDatabaseWait(durationMs: number) {
    recordDatabasePoolWait(durationMs);
    const current = observations.getStore();
    if (current) current.db.waitMs += durationMs;
}

export function noteUpstreamRequest(target: string, durationMs: number, ok: boolean) {
    recordUpstreamRequest(target, durationMs, ok);
    const current = observations.getStore();
    if (!current) return;
    const entry = (current.upstream[target] ??= { count: 0, totalMs: 0, maxMs: 0 });
    addDuration(entry, durationMs);
}

function requestKind(routeId: string | null, method: string, isDataRequest: boolean) {
    if (isDataRequest) return 'data';
    if (!routeId) return 'unmatched';
    if (routeId === '/metrics' || routeId.startsWith('/internal/')) return 'internal';
    if (routeId.startsWith('/api/')) return 'api';
    return method === 'GET' || method === 'HEAD' ? 'page' : 'action';
}

/** 라우트 ID는 manifest의 템플릿만 받는다. URL·헤더·본문·실행자 식별자는 받지 않는다. */
export function observeRequest(
    input: {
        requestId: string;
        routeId: string | null;
        method: string;
        isDataRequest?: boolean;
        onGuildVerified?: (guildId: string) => void;
    },
    run: () => Promise<Response>,
    write: (line: string) => void = (line) => console.info(line)
) {
    const method = requestMethod(input.method);
    const state: Observation = {
        requestId: input.requestId,
        onGuildVerified: input.onGuildVerified,
        route: input.routeId ?? 'unmatched',
        kind: requestKind(input.routeId, method, input.isDataRequest ?? false),
        method,
        status: 500,
        code: null,
        sessionMs: 0,
        accessMs: 0,
        db: { count: 0, totalMs: 0, maxMs: 0, waitMs: 0, slow: 0 },
        upstream: {},
        write
    };
    return observations.run(state, async () => {
        const started = performance.now();
        try {
            const response = await run();
            state.status = response.status;
            return response;
        } finally {
            const durationMs = performance.now() - started;
            const code =
                state.code ??
                (state.status >= 500 ? 'INTERNAL_ERROR' : state.status >= 400 ? 'HTTP_ERROR' : null);
            try {
                recordHttpRequest({
                    route: state.route,
                    method: state.method,
                    kind: state.kind,
                    status: state.status,
                    code,
                    durationMs
                });
            } catch {}
            try {
                write(
                    JSON.stringify({
                        event: 'request',
                        requestId: state.requestId,
                        route: state.route,
                        kind: state.kind,
                        method: state.method,
                        status: state.status,
                        code,
                        durationMs: round(durationMs),
                        phases: {
                            sessionMs: round(state.sessionMs),
                            accessMs: round(state.accessMs)
                        },
                        db: {
                            count: state.db.count,
                            totalMs: round(state.db.totalMs),
                            maxMs: round(state.db.maxMs),
                            waitMs: round(state.db.waitMs),
                            slow: state.db.slow
                        },
                        upstream: Object.fromEntries(
                            Object.entries(state.upstream).map(([target, value]) => [
                                target,
                                {
                                    count: value.count,
                                    totalMs: round(value.totalMs),
                                    maxMs: round(value.maxMs)
                                }
                            ])
                        )
                    })
                );
            } catch {}
        }
    });
}
