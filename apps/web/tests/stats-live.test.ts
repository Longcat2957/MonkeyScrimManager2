import assert from 'node:assert/strict';
import test from 'node:test';
import {
    isStatsSnapshot,
    normalizeStatsFilters,
    statsRequestKey,
    type StatsSnapshot
} from '../src/lib/features/stats/types.ts';
import {
    createStatsLiveController,
    type StatsLiveClock,
    type StatsLiveContext,
    type StatsLiveState
} from '../src/lib/ui/stats-live.ts';

const flush = () => new Promise<void>((done) => setImmediate(done));

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((done, fail) => {
        resolve = done;
        reject = fail;
    });
    return { promise, resolve, reject };
}

function context(query = 'min=1'): StatsLiveContext {
    const guildId = '970000000000000001';
    const filters = normalizeStatsFilters(new URLSearchParams(query));
    return {
        guildId,
        url: '/g/' + guildId + '/stats/live?' + query,
        requestKey: statsRequestKey(guildId, filters)
    };
}

function snapshot(current = context()): StatsSnapshot {
    return {
        guildId: current.guildId,
        requestKey: current.requestKey,
        ...normalizeStatsFilters(new URL(current.url, 'https://fixture.invalid').searchParams),
        seasons: [],
        selectedSeasonId: null,
        empty: true
    };
}

function setup() {
    let now = 0;
    let timerId = 0;
    const timers = new Map<number, { at: number; callback: () => void }>();
    const clock: StatsLiveClock = {
        now: () => now,
        setTimeout: (callback, delay) => {
            const id = ++timerId;
            timers.set(id, { at: now + delay, callback });
            return id;
        },
        clearTimeout: (id) => {
            timers.delete(id as number);
        }
    };
    const calls: ({ url: string; init: RequestInit } & ReturnType<typeof deferred<Response>>)[] = [];
    const states: StatsLiveState[] = [];
    const received: StatsSnapshot[] = [];
    const controller = createStatsLiveController({
        clock,
        fetch: (url, init) => {
            const request = deferred<Response>();
            calls.push({ url: String(url), init: init!, ...request });
            return request.promise;
        },
        ondata: (value) => {
            received.push(value);
        },
        onstate: (value) => {
            states.push(value);
        }
    });
    const advance = async (duration: number) => {
        const until = now + duration;
        while (true) {
            const next = [...timers]
                .filter(([, timer]) => timer.at <= until)
                .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
            if (!next) break;
            now = next[1].at;
            timers.delete(next[0]);
            next[1].callback();
            await flush();
        }
        now = until;
        await flush();
    };
    const respond = async (index: number, value: unknown = snapshot(), status = 200) => {
        calls[index]!.resolve(
            new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
        );
        await flush();
    };
    return { controller, calls, states, received, timers, advance, respond, state: () => states.at(-1)! };
}

test('초기 SSR 뒤 30초에만 시작하고 완료 시각부터 다음 주기를 세며 자동 요청만 낮은 우선순위를 쓴다', async (t) => {
    const f = setup();
    t.after(() => f.controller.dispose());
    f.controller.start(context());
    await f.advance(29_999);
    assert.equal(f.calls.length, 0);
    await f.advance(1);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0]!.init.priority, 'low');
    assert.equal(f.calls[0]!.init.cache, 'no-store');
    assert.equal(f.state().busy, true);
    await f.advance(5_000);
    await f.respond(0);
    assert.equal(f.received.length, 1);
    assert.equal(f.state().lastSuccessAt, 35_000);
    assert.equal(f.state().nextRunAt, 65_000);
    await f.advance(29_999);
    assert.equal(f.calls.length, 1);
    await f.advance(1);
    assert.equal(f.calls.length, 2);
});

test('자동 일시중지 중 수동 갱신은 허용하고 연속 조작과 자동 재개는 같은 단일 요청을 공유한다', async (t) => {
    const f = setup();
    t.after(() => f.controller.dispose());
    f.controller.start(context());
    f.controller.setEnabled(false);
    const one = f.controller.refresh();
    assert.equal(f.controller.refresh(), one);
    f.controller.setEnabled(true);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0]!.init.priority, undefined);
    f.controller.setEnabled(false);
    await one;
    assert.equal(f.calls[0]!.init.signal!.aborted, true);
    assert.equal(f.state().busy, false);
    await f.respond(0);
    assert.equal(f.received.length, 0);
    const two = f.controller.refresh();
    assert.equal(f.calls.length, 2);
    await f.respond(1);
    await two;
    assert.equal(f.received.length, 1);
    assert.equal(f.state().nextRunAt, null);
    await f.advance(300_000);
    assert.equal(f.calls.length, 2);
});

test('숨김·오프라인·이동 gate는 진행 요청을 중단하고 재개 즉시 한 번만 읽으며 중지 중 재개는 자동 요청하지 않는다', async (t) => {
    const f = setup();
    t.after(() => f.controller.dispose());
    f.controller.start(context());
    await f.advance(30_000);
    f.controller.setAvailable(false);
    assert.equal(f.calls[0]!.init.signal!.aborted, true);
    assert.equal(f.state().busy, false);
    await f.controller.refresh();
    await f.advance(300_000);
    assert.equal(f.calls.length, 1);
    f.controller.setAvailable(true);
    f.controller.setAvailable(true);
    assert.equal(f.calls.length, 2);
    f.controller.setAvailable(false);
    f.controller.setEnabled(false);
    f.controller.setAvailable(true);
    assert.equal(f.calls.length, 2);
    const manual = f.controller.refresh();
    await f.respond(2);
    await manual;
    assert.equal(f.state().nextRunAt, null);
    assert.equal(f.received.length, 1);
});

test('URL·문맥 교체와 같은 문맥의 SSR reset은 중단을 무시한 이전 응답까지 폐기한다', async (t) => {
    const f = setup();
    t.after(() => f.controller.dispose());
    const first = context();
    const second = context('position=top&min=1');
    f.controller.start(first);
    const a = f.controller.refresh();
    f.controller.setContext(second);
    await a;
    const b = f.controller.refresh();
    await f.respond(0, snapshot(first));
    assert.equal(f.received.length, 0);
    await f.respond(1, snapshot(second));
    await b;
    assert.equal(f.received.length, 1);
    const old = f.controller.refresh();
    f.controller.setContext(second);
    await old;
    const current = f.controller.refresh();
    await f.respond(2, snapshot(second));
    assert.equal(f.received.length, 1);
    await f.respond(3, snapshot(second));
    await current;
    assert.equal(f.received.length, 2);
    assert.equal(f.calls[2]!.init.signal!.aborted, true);
});

test('15초 시간 초과는 중단을 무시한 fetch에서도 대기를 풀고 실패60초·120초 상한 뒤 성공30초로 복구한다', async (t) => {
    const f = setup();
    t.after(() => f.controller.dispose());
    f.controller.start(context());
    const pending = f.controller.refresh();
    await f.advance(15_000);
    await pending;
    assert.equal(f.calls[0]!.init.signal!.aborted, true);
    assert.equal(f.state().busy, false);
    assert.match(f.state().error!, /시간/);
    assert.equal(f.state().nextRunAt, 75_000);
    await f.respond(0);
    assert.equal(f.received.length, 0);
    await f.advance(59_999);
    assert.equal(f.calls.length, 1);
    await f.advance(1);
    f.calls[1]!.reject(new Error('네트워크 실패 fixture'));
    await flush();
    assert.equal(f.state().nextRunAt, 195_000);
    await f.advance(120_000);
    await f.respond(2, {}, 503);
    assert.equal(f.state().nextRunAt, 315_000);
    await f.advance(120_000);
    await f.respond(3);
    assert.equal(f.state().error, null);
    assert.equal(f.state().nextRunAt, 345_000);
});

test('형식이 깨지거나 다른 서버·조건인 JSON은 마지막 정상 snapshot을 대체하지 않는다', async (t) => {
    const f = setup();
    t.after(() => f.controller.dispose());
    f.controller.start(context());
    f.controller.setEnabled(false);
    const baseline = f.controller.refresh();
    await f.respond(0);
    await baseline;
    const champion = { champion: { id: 'Ahri', name: '아리', iconUrl: null }, games: 1, wins: 1, kda: null };
    const complete = {
        ...snapshot(),
        empty: false,
        kpis: {
            games: 1,
            players: 0,
            averageDurationSec: null,
            killsPerMinute: null,
            kda: null,
            champions: 1
        },
        achievements: [],
        leaderboard: [],
        playerCount: 0,
        champions: [champion]
    };
    assert.ok(isStatsSnapshot(complete));
    for (const value of [
        {},
        { ...snapshot(), guildId: '다른 서버' },
        { ...snapshot(), requestKey: '이전 조건' },
        { ...snapshot(), empty: false, kpis: null },
        { ...complete, champions: [champion, champion] },
        { ...complete, achievements: [{ id: 'unknown', entries: [] }] }
    ]) {
        const pending = f.controller.refresh();
        await f.respond(f.calls.length - 1, value);
        await pending;
        assert.equal(f.received.length, 1);
        assert.equal(f.state().lastSuccessAt, 0);
        assert.ok(f.state().error);
    }
    const malformed = f.controller.refresh();
    f.calls.at(-1)!.resolve(new Response('{잘못된 JSON'));
    await malformed;
    assert.equal(f.received.length, 1);
    assert.ok(f.state().error);
});

test('본문 읽기 도중 reset·dispose해도 늦은 JSON을 적용하거나 타이머·추가 요청을 남기지 않는다', async () => {
    const f = setup();
    f.controller.start(context());
    const first = f.controller.refresh();
    const body = deferred<unknown>();
    f.calls[0]!.resolve({ ok: true, json: () => body.promise } as Response);
    await flush();
    f.controller.setContext(null);
    await first;
    body.resolve(snapshot());
    await flush();
    assert.equal(f.received.length, 0);
    await f.controller.refresh();
    assert.equal(f.calls.length, 1);
    f.controller.setContext(context());
    const last = f.controller.refresh();
    const states = f.states.length;
    f.controller.dispose();
    await last;
    assert.equal(f.calls[1]!.init.signal!.aborted, true);
    assert.equal(f.timers.size, 0);
    await f.respond(1);
    await f.advance(600_000);
    f.controller.start(context());
    f.controller.setAvailable(true);
    f.controller.setEnabled(true);
    await f.controller.refresh();
    assert.equal(f.calls.length, 2);
    assert.equal(f.received.length, 0);
    assert.equal(f.states.length, states);
});
