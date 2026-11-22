import { RiotError } from './errors.ts';

interface Window {
    limit: number;
    used: number;
    charges: { time: number; count: number }[];
    first: number;
}

interface Scope {
    windows: Map<number, Window>;
    pausedUntil: number;
    pending: number;
}

function expire(window: Window, duration: number, time: number) {
    while (window.first < window.charges.length) {
        const charge = window.charges[window.first]!;
        if (charge.time + duration > time) break;
        window.used -= charge.count;
        window.first++;
    }
    if (window.first > 0 && window.first * 2 >= window.charges.length) {
        window.charges.splice(0, window.first);
        window.first = 0;
    }
}

function charge(window: Window, time: number, count: number) {
    if (count <= 0) return;
    const last = window.charges.at(-1);
    if (last?.time === time) last.count += count;
    else window.charges.push({ time, count });
    window.used += count;
}

function retryAt(scope: Scope, time: number, background: boolean) {
    let until = scope.pausedUntil;
    for (const [duration, window] of scope.windows) {
        expire(window, duration, time);
        // 한도가 두 건 이상이면 사용자 요청에 최소 한 건, 전체의 10%를 남긴다.
        const cap = background ? Math.max(1, window.limit - Math.ceil(window.limit / 10)) : window.limit;
        let needed = window.used - cap + 1;
        for (let i = window.first; needed > 0 && i < window.charges.length; i++) {
            const charge = window.charges[i]!;
            needed -= charge.count;
            if (needed <= 0) until = Math.max(until, charge.time + duration);
        }
    }
    return until;
}

function headerWindows(header: string | null) {
    const values = new Map<number, number>();
    for (const item of header?.split(',') ?? []) {
        const pair = /^(\d+)\s*:\s*(\d+)$/.exec(item.trim());
        if (!pair) continue;
        const value = Number(pair[1]);
        const duration = Number(pair[2]) * 1000;
        if (Number.isSafeInteger(value) && Number.isSafeInteger(duration) && duration > 0) {
            values.set(duration, value);
        }
    }
    return values;
}

function observe(scope: Scope, headers: Headers, prefix: string, time: number) {
    const limitHeader = headers.get(prefix);
    if (!limitHeader) return;
    const counts = headerWindows(headers.get(`${prefix}-Count`));
    for (const [duration, limit] of headerWindows(limitHeader)) {
        if (!limit) continue;
        let window = scope.windows.get(duration);
        if (!window) {
            window = { limit, used: 0, charges: [], first: 0 };
            scope.windows.set(duration, window);
        }
        window.limit = limit;
        expire(window, duration, time);
        // 응답 카운트에 동시 요청이 이미 포함될 수 있다. 서버 사용량과 로컬 예약의 큰 쪽만 반영한다.
        const used = Math.max(scope.pending, counts.get(duration) ?? 1);
        charge(window, time, used - window.used);
    }
}

function retrySeconds(header: string | null, time: number) {
    const value = header?.trim() ?? '';
    if (/^\d+(\.\d+)?$/.test(value)) {
        const seconds = Math.ceil(Number(value));
        if (Number.isSafeInteger(seconds * 1000)) return seconds;
    } else if (/^[A-Za-z]{3}, /.test(value)) {
        const date = Date.parse(value);
        if (Number.isFinite(date)) return Math.max(0, Math.ceil((date - time) / 1000));
    }
    return 60;
}

export function createRiotBudgets(now: () => number) {
    const scopes = new Map<string, Scope>();
    function scope(key: string) {
        let state = scopes.get(key);
        if (!state) {
            state = { windows: new Map(), pausedUntil: 0, pending: 0 };
            scopes.set(key, state);
        }
        return state;
    }
    return {
        reserve(region: string, serviceName: string, methodId: number, background: boolean) {
            const time = now();
            const app = scope(region);
            const method = scope(`${region}:${methodId}`);
            const service = scope(`${region}:${serviceName}`);
            const until = Math.max(
                retryAt(app, time, background),
                retryAt(method, time, background),
                service.pausedUntil
            );
            if (until > time) {
                throw new RiotError('RATE_LIMITED', 'Riot API requests are temporarily paused.', {
                    retryAfterSeconds: Math.ceil((until - time) / 1000)
                });
            }
            // await 전에 현재 요청 몫을 예약해 사용자 요청과 수집 작업의 경합을 막는다.
            for (const state of [app, method]) {
                state.pending++;
                for (const window of state.windows.values()) charge(window, time, 1);
            }
            return {
                observe(response: Response) {
                    const time = now();
                    observe(app, response.headers, 'X-App-Rate-Limit', time);
                    observe(method, response.headers, 'X-Method-Rate-Limit', time);
                    if (response.status !== 429) return;
                    const seconds = retrySeconds(response.headers.get('Retry-After'), time);
                    const type = response.headers.get('X-Rate-Limit-Type')?.trim().toLowerCase();
                    // 유형을 알 수 없는 제한은 보수적으로 호스트 전체를 멈춘다.
                    const target = type === 'method' ? method : type === 'service' ? service : app;
                    target.pausedUntil = Math.max(target.pausedUntil, time + seconds * 1000);
                    return seconds;
                },
                finish() {
                    app.pending--;
                    method.pending--;
                }
            };
        }
    };
}
