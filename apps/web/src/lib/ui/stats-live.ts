import { isStatsSnapshot, type StatsSnapshot } from '../features/stats/types.ts';

export type StatsLiveContext = { url: string; guildId: string; requestKey: string };
export type StatsLiveState = {
    busy: boolean;
    error: string | null;
    lastSuccessAt: number | null;
    nextRunAt: number | null;
};
export type StatsLiveClock = {
    now: () => number;
    setTimeout: (callback: () => void, delay: number) => unknown;
    clearTimeout: (handle: unknown) => void;
};
type Options = {
    ondata: (snapshot: StatsSnapshot) => void;
    onstate: (state: StatsLiveState) => void;
    fetch?: typeof globalThis.fetch;
    clock?: StatsLiveClock;
};
type Flight = {
    context: StatsLiveContext;
    generation: number;
    controller: AbortController;
    timeout: unknown;
    promise: Promise<void>;
    resolve: () => void;
};

const NORMAL_DELAY = 30_000;
const TIMEOUT = 15_000;
const FETCH_ERROR = '통계를 새로 불러오지 못했어요. 다시 시도해 주세요.';
const DATA_ERROR = '통계 정보를 확인하지 못했어요. 다시 시도해 주세요.';
const TIMEOUT_ERROR = '통계를 불러오는 시간이 길어지고 있어요. 다시 시도해 주세요.';

/** 한 화면의 자동·수동 갱신을 같은 요청 수명으로 관리하며 DOM과 Svelte 상태는 호출자가 연결한다. */
export function createStatsLiveController(options: Options) {
    const clock: StatsLiveClock = options.clock ?? {
        now: Date.now,
        setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
        clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>)
    };
    const fetcher = options.fetch ?? globalThis.fetch;
    let context: StatsLiveContext | null = null;
    let started = false;
    let disposed = false;
    let enabled = true;
    let available = true;
    let generation = 0;
    let failures = 0;
    let timer: unknown = null;
    let flight: Flight | null = null;
    let state: StatsLiveState = { busy: false, error: null, lastSuccessAt: null, nextRunAt: null };

    const emit = () => options.onstate({ ...state });
    const canRequest = () => started && !disposed && available && context !== null;
    const owns = (request: Flight) =>
        flight === request &&
        generation === request.generation &&
        context?.url === request.context.url &&
        context.guildId === request.context.guildId &&
        context.requestKey === request.context.requestKey;

    function clearTimer() {
        if (timer !== null) clock.clearTimeout(timer);
        timer = null;
        state.nextRunAt = null;
    }

    function schedule(delay: number) {
        clearTimer();
        if (!canRequest() || !enabled || flight) return;
        state.nextRunAt = clock.now() + delay;
        timer = clock.setTimeout(() => {
            timer = null;
            state.nextRunAt = null;
            void request('auto');
        }, delay);
    }

    function interrupt() {
        generation++;
        clearTimer();
        const previous = flight;
        flight = null;
        if (previous) {
            clock.clearTimeout(previous.timeout);
            previous.controller.abort();
            previous.resolve();
        }
        state.busy = false;
    }

    function finish(current: Flight, error: string | null) {
        if (!owns(current)) return;
        clock.clearTimeout(current.timeout);
        flight = null;
        state.busy = false;
        state.error = error;
        if (error) failures++;
        else {
            failures = 0;
            state.lastSuccessAt = clock.now();
        }
        // 처리 시간만큼 다음 요청이 겹치지 않도록 완료 뒤부터 간격을 센다.
        schedule(error ? (failures === 1 ? 60_000 : 120_000) : NORMAL_DELAY);
        emit();
        current.resolve();
    }

    function request(kind: 'auto' | 'manual'): Promise<void> {
        if (!canRequest() || (kind === 'auto' && !enabled)) return Promise.resolve();
        if (flight) return flight.promise;
        clearTimer();
        let resolve!: () => void;
        const promise = new Promise<void>((done) => {
            resolve = done;
        });
        const current: Flight = {
            context: { ...context! },
            generation,
            controller: new AbortController(),
            timeout: null,
            promise,
            resolve
        };
        flight = current;
        state.busy = true;
        emit();
        current.timeout = clock.setTimeout(() => {
            if (!owns(current)) return;
            // 중단을 무시하는 응답도 현재 화면을 덮거나 대기 상태를 고정하지 못하게 한다.
            current.controller.abort();
            finish(current, TIMEOUT_ERROR);
        }, TIMEOUT);
        void (async () => {
            try {
                const response = await fetcher(current.context.url, {
                    headers: { accept: 'application/json' },
                    credentials: 'same-origin',
                    cache: 'no-store',
                    redirect: 'error',
                    signal: current.controller.signal,
                    ...(kind === 'auto' ? { priority: 'low' as const } : {})
                });
                if (!owns(current) || current.controller.signal.aborted) return;
                if (!response.ok) {
                    finish(current, FETCH_ERROR);
                    return;
                }
                const value: unknown = await response.json();
                if (!owns(current) || current.controller.signal.aborted) return;
                if (
                    !isStatsSnapshot(value) ||
                    value.guildId !== current.context.guildId ||
                    value.requestKey !== current.context.requestKey
                ) {
                    finish(current, DATA_ERROR);
                    return;
                }
                options.ondata(value);
                finish(current, null);
            } catch {
                if (owns(current)) finish(current, FETCH_ERROR);
            }
        })();
        return promise;
    }

    // 같은 URL의 새 SSR 자료도 이전 요청과 구별하는 명시적 reset이다.
    function setContext(next: StatsLiveContext | null) {
        if (disposed) return;
        interrupt();
        context = next ? { ...next } : null;
        failures = 0;
        state = { busy: false, error: null, lastSuccessAt: null, nextRunAt: null };
        schedule(NORMAL_DELAY);
        emit();
    }

    return {
        start(next: StatsLiveContext) {
            if (disposed) return;
            started = true;
            setContext(next);
        },
        setContext,
        setEnabled(next: boolean) {
            if (disposed || enabled === next) return;
            enabled = next;
            if (!next) {
                interrupt();
                emit();
            } else void request('auto');
        },
        setAvailable(next: boolean) {
            if (disposed || available === next) return;
            available = next;
            if (!next) {
                interrupt();
                emit();
            } else if (enabled) void request('auto');
        },
        refresh() {
            return request('manual');
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            interrupt();
        }
    };
}

export type StatsLiveController = ReturnType<typeof createStatsLiveController>;
