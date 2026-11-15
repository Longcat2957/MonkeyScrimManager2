import { AsyncLocalStorage } from 'node:async_hooks';

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

type Observation = {
    requestId: string;
    route: string;
    method: string;
    status: number;
    code: OperationCode | null;
};
const observations = new AsyncLocalStorage<Observation>();
const methods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

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

/** 라우트 ID는 manifest의 템플릿만 받는다. URL·헤더·본문·실행자 식별자는 받지 않는다. */
export function observeRequest(
    input: { requestId: string; routeId: string | null; method: string },
    run: () => Promise<Response>,
    write: (line: string) => void = (line) => console.info(line)
) {
    const state: Observation = {
        requestId: input.requestId,
        route: input.routeId ?? 'unmatched',
        method: methods.has(input.method) ? input.method : 'OTHER',
        status: 500,
        code: null
    };
    return observations.run(state, async () => {
        const started = performance.now();
        try {
            const response = await run();
            state.status = response.status;
            return response;
        } finally {
            try {
                write(
                    JSON.stringify({
                        event: 'request',
                        requestId: state.requestId,
                        route: state.route,
                        method: state.method,
                        status: state.status,
                        code:
                            state.code ??
                            (state.status >= 500
                                ? 'INTERNAL_ERROR'
                                : state.status >= 400
                                  ? 'HTTP_ERROR'
                                  : null),
                        durationMs: Math.round((performance.now() - started) * 100) / 100
                    })
                );
            } catch {}
        }
    });
}
