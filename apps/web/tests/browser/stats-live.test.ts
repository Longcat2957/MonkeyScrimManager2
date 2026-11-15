import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { stringify, unflatten } from 'devalue';
import { chromium, type BrowserContext, type Page } from 'playwright';
import type { StatsSnapshot } from '../../src/lib/features/stats/types.ts';
import * as schema from '../../src/lib/server/db/schema.ts';
import { assertAction } from '../api/support/http.ts';
import { createHttpRecordSeasonsFixture } from '../api/support/http-record-seasons-fixtures.ts';

type Fixture = Awaited<ReturnType<typeof createHttpRecordSeasonsFixture>>;
const fetchError = '통계를 새로 불러오지 못했어요. 다시 시도해 주세요.';
const timeoutError = '통계를 불러오는 시간이 길어지고 있어요. 다시 시도해 주세요.';
const captures: Record<string, unknown>[] = [];

async function localOnly(context: BrowserContext, f: Fixture) {
    const origin = new URL(f.url).origin;
    await context.route('**/*', async (route) => {
        const request = route.request();
        if (new URL(request.url()).origin !== origin) return route.abort();
        await route.fulfill({
            response: await route.fetch({
                headers: { ...request.headers(), 'x-forwarded-proto': 'https' },
                maxRedirects: 0
            })
        });
    });
}

async function ready(page: Page) {
    await page.getByRole('heading', { name: '통계', level: 1, exact: true }).waitFor();
    await page.getByRole('button', { name: '자동 갱신', exact: true }).waitFor();
    await page.getByRole('button', { name: '최소 게임 늘리기', exact: true }).waitFor();
    await page.clock.runFor(40);
}

function games(page: Page) {
    return page.getByText('총 게임', { exact: true }).locator('xpath=../..').locator(':scope > p');
}

async function capture(page: Page, f: Fixture, state: string, injected = false) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const directory = process.env.MSM2_STATS_LIVE_CAPTURE_DIR;
    if (!directory) return;
    await page.evaluate(async () => {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        await document.fonts.ready;
    });
    await page.clock.runFor(40);
    await mkdir(directory, { recursive: true });
    const viewport = page.viewportSize()!;
    const theme = await page.locator('html').getAttribute('data-mode');
    const file = `${viewport.width}-${theme}-${state}.png`;
    const fullPage = !injected;
    const bytes = await page.screenshot({ path: resolve(directory, file), fullPage, animations: 'disabled' });
    const url = new URL(page.url());
    const rows = await f.db.select({ id: schema.games.id }).from(schema.games);
    captures.push({
        file,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        url: page.url(),
        path: url.pathname + url.search,
        viewport,
        theme,
        state,
        fullPage,
        uiInjection: injected,
        gameIds: rows.map((game) => game.id),
        selectedSeasonId: f.previousSeason.id,
        source: injected
            ? '실제 격리 SSR/live 응답에 명시적으로 추가한 UI 표본:30행·20챔피언·업적2개로 쪽/정렬/열린업적 보존만 검증. 실제 서비스 업적 제공을 주장하지 않는다.'
            : '실제 SSR·익명 공개 통계·실제 ROFL1→2게임과 MMR 갱신. Playwright clock으로30초/시간제한/재시도 시간을 진행하며 외부 장식 에셋 요청은 차단'
    });
    await writeFile(resolve(directory, 'captures.json'), JSON.stringify(captures, null, 4) + '\n');
}

/** 계산 정확도가 아니라 기존 UI의 쪽·정렬·열린 항목 수명만 검증하는 명시적 화면 표본이다. */
function uiSnapshot(snapshot: StatsSnapshot, version: number): StatsSnapshot {
    assert.equal(snapshot.empty, false);
    if (snapshot.empty) throw new Error('UI 보존 표본은 실제 기록이 있는 응답을 사용한다.');
    if (version === 4) {
        const { guildId, requestKey, seasons, selectedSeasonId, position, recent, minGames } = snapshot;
        return { guildId, requestKey, seasons, selectedSeasonId, position, recent, minGames, empty: true };
    }
    const base = snapshot.leaderboard[0]!;
    const row = (index: number) => ({
        ...base,
        userId: String(980000000000000000n + BigInt(index)),
        identityKey: '00000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'),
        displayName: 'UI 주입 사용자 ' + (index + 1),
        iconUrl: null,
        games: 10,
        wins: 5,
        kda: 3 + index / 10,
        badges: []
    });
    const entries = [
        {
            userId: row(0).userId,
            displayName: row(0).displayName,
            iconUrl: null,
            value: '주입 갱신 ' + version,
            games: 10
        }
    ];
    return {
        ...snapshot,
        showAchievements: true,
        achievements: ['A', 'B'].map((key) => ({
            id: 'ui-fixture-' + key,
            emoji: '🧪',
            title: 'UI 주입 업적 ' + key,
            description: '테스트에서 명시 주입한 업적 ' + key,
            splashUrl: null,
            entries
        })),
        leaderboard: version === 3 ? [] : Array.from({ length: 30 }, (_, index) => row(index)),
        playerCount: 30,
        champions: Array.from({ length: version === 3 ? 0 : 20 }, (_, index) => ({
            champion: { id: 'ui-fixture-' + index, name: 'UI 주입 챔피언 ' + (index + 1), iconUrl: null },
            games: 10 + version,
            wins: 5,
            kda: 3
        }))
    };
}

async function injectedState(
    browser: Awaited<ReturnType<typeof chromium.launch>>,
    f: Fixture,
    width: number,
    theme: string
) {
    const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 1000 },
        reducedMotion: 'reduce'
    });
    try {
        await localOnly(context, f);
        await context.addInitScript((mode) => localStorage.setItem('theme-mode', mode), theme);
        const page = await context.newPage();
        page.setDefaultTimeout(10_000);
        await page.clock.install();
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (entry) => {
            if (entry.type() === 'error' && !entry.text().startsWith('Failed to load resource:'))
                errors.push(entry.text());
        });
        let liveVersion = 2;
        await context.route('**/*', async (route) => {
            const request = route.request();
            const url = new URL(request.url());
            if (url.origin !== new URL(f.url).origin) return route.fallback();
            if (url.pathname !== f.paths.stats + '/__data.json' && url.pathname !== f.paths.stats + '/live')
                return route.fallback();
            const response = await route.fetch({
                headers: { ...request.headers(), 'x-forwarded-proto': 'https' },
                maxRedirects: 0
            });
            if (url.pathname.endsWith('/live')) {
                const snapshot = (await response.json()) as StatsSnapshot;
                await route.fulfill({ response, json: uiSnapshot(snapshot, liveVersion) });
            } else {
                const payload = (await response.json()) as {
                    nodes: ({ type: string; data?: unknown[] } | null)[];
                };
                for (const node of payload.nodes) {
                    if (node?.type !== 'data' || !node.data) continue;
                    const snapshot = unflatten(node.data) as StatsSnapshot;
                    if (
                        snapshot &&
                        typeof snapshot === 'object' &&
                        'requestKey' in snapshot &&
                        'kpis' in snapshot
                    )
                        node.data = JSON.parse(stringify(uiSnapshot(snapshot, 1)));
                }
                await route.fulfill({ response, json: payload });
            }
        });
        await page.goto(f.url + f.paths.stats + '?season=' + f.previousSeason.id + '&min=1&position=top');
        await ready(page);
        await page
            .getByRole('group', { name: '포지션 필터', exact: true })
            .getByRole('button', { name: '전체', exact: true })
            .press('Enter');
        await page.waitForURL((url) => !url.searchParams.has('position'));
        const leaderboard = page.getByRole('region', { name: '사용자별 지표', exact: true });
        await leaderboard.locator('tbody tr').nth(19).waitFor();
        const sort = leaderboard.getByRole('button', { name: '승률', exact: true });
        await sort.press('Enter');
        await sort.press('Enter');
        assert.equal(await sort.locator('..').getAttribute('aria-sort'), 'ascending');
        await page
            .getByRole('navigation', { name: '리더보드 쪽 이동', exact: true })
            .getByRole('button', { name: '2', exact: true })
            .press('Enter');
        await page
            .getByRole('navigation', { name: '챔피언 쪽 이동', exact: true })
            .getByRole('button', { name: '2', exact: true })
            .press('Enter');
        await page.getByRole('button', { name: '업적별 순위', exact: true }).press('Enter');
        const dialog = page.getByRole('dialog', { name: '업적별 순위', exact: true });
        const selected = dialog.getByRole('button', { name: 'UI 주입 업적 B', exact: true });
        await selected.press('Enter');
        await dialog.getByText('테스트에서 명시 주입한 업적 B', { exact: true }).waitFor();
        await capture(page, f, 'injected-open-achievement', true);
        const live = page.waitForResponse(
            (response) => new URL(response.url()).pathname === f.paths.stats + '/live'
        );
        await page.clock.fastForward(30_100);
        assert.equal((await live).status(), 200);
        await dialog.getByText('주입 갱신 2', { exact: true }).waitFor();
        assert.equal(await selected.getAttribute('aria-pressed'), 'true');
        assert.equal(await sort.locator('..').getAttribute('aria-sort'), 'ascending');
        for (const label of ['리더보드 쪽 이동', '챔피언 쪽 이동'])
            assert.equal(
                await page.locator(`nav[aria-label="${label}"] button[aria-current="page"]`).innerText(),
                '2'
            );
        await capture(page, f, 'injected-preserved-after-refresh', true);
        const nextVersion = async (version: number) => {
            liveVersion = version;
            const response = page.waitForResponse(
                (reply) => new URL(reply.url()).pathname === f.paths.stats + '/live'
            );
            await page.clock.fastForward(30_100);
            assert.equal((await response).status(), 200);
            await page.clock.runFor(40);
        };
        // 같은 조건의 표본이 사라졌다 돌아오면 쪽은 안전한 첫 쪽으로 줄이고 정렬 선택은 보존한다.
        await nextVersion(3);
        await dialog.getByText('주입 갱신 3', { exact: true }).waitFor();
        await page.getByText('이 조건에는 챔피언 기록이 없어요', { exact: true }).waitFor();
        await nextVersion(4);
        await selected.waitFor({ state: 'hidden' });
        await page.getByText('이 시즌에는 기록된 게임이 없어요', { exact: true }).waitFor();
        await nextVersion(5);
        await leaderboard.locator('tbody tr').nth(19).waitFor();
        assert.equal(await sort.locator('..').getAttribute('aria-sort'), 'ascending');
        for (const label of ['리더보드 쪽 이동', '챔피언 쪽 이동'])
            assert.equal(
                await page.locator(`nav[aria-label="${label}"] button[aria-current="page"]`).innerText(),
                '1'
            );
        assert.equal(await page.getByRole('dialog', { name: '업적별 순위', exact: true }).count(), 0);
        assert.deepEqual(errors, []);
    } finally {
        await context.close();
    }
}

for (const width of [1440, 390])
    for (const theme of ['primary', 'dark'])
        test(
            `통계 자동 갱신은 실제 결과·실패 복구·필터와 요청 수명을 유지한다: ${width}px ${theme}`,
            { timeout: 120_000 },
            async (t) => {
                let release = () => {};
                t.after(() => release());
                const browser = await chromium.launch({ headless: true });
                t.after(() => browser.close());
                const f = await createHttpRecordSeasonsFixture(t);
                const context = await browser.newContext({
                    viewport: { width, height: width === 390 ? 844 : 1000 },
                    reducedMotion: 'reduce'
                });
                await localOnly(context, f);
                await context.addInitScript((mode) => localStorage.setItem('theme-mode', mode), theme);
                const page = await context.newPage();
                page.setDefaultTimeout(10_000);
                await page.clock.install();
                const errors: string[] = [];
                const requests: URL[] = [];
                let posts = 0;
                page.on('pageerror', (error) => errors.push(error.message));
                page.on('console', (entry) => {
                    if (entry.type() === 'error' && !entry.text().startsWith('Failed to load resource:'))
                        errors.push(entry.text());
                });
                const isLive = (url: string) => {
                    const target = new URL(url);
                    return (
                        target.origin === new URL(f.url).origin && target.pathname === f.paths.stats + '/live'
                    );
                };
                page.on('request', (request) => {
                    if (request.method() === 'POST') posts++;
                    if (isLive(request.url())) requests.push(new URL(request.url()));
                });
                let fault: 'failure' | 'hold' | null = null;
                let arrived = () => {};
                let held = Promise.resolve();
                const hold = () => {
                    const pending = new Promise<void>((done) => {
                        arrived = done;
                    });
                    held = new Promise<void>((done) => {
                        release = done;
                    });
                    fault = 'hold';
                    return pending;
                };
                await context.route('**/*', async (route) => {
                    if (!isLive(route.request().url())) return route.fallback();
                    if (fault === 'failure') {
                        fault = null;
                        return route.fulfill({
                            status: 503,
                            contentType: 'application/json',
                            json: { message: '격리 통계 조회 실패' }
                        });
                    }
                    if (fault !== 'hold') return route.fallback();
                    fault = null;
                    const response = await route.fetch({
                        headers: { ...route.request().headers(), 'x-forwarded-proto': 'https' },
                        maxRedirects: 0
                    });
                    arrived();
                    await held;
                    await route.fulfill({ response }).catch(() => {});
                });
                const responseAfter = async (run: () => Promise<unknown>, status = 200) => {
                    const pending = page.waitForResponse((response) => isLive(response.url()));
                    await run();
                    const response = await pending;
                    assert.equal(response.status(), status);
                    if (status === 200) assert.match(response.headers()['cache-control'] ?? '', /no-store/);
                    await page.clock.runFor(40);
                    return response;
                };
                await page.goto(f.url + f.paths.stats + '?season=' + f.previousSeason.id + '&min=1&keep=1');
                await ready(page);
                assert.equal(await games(page).innerText(), '1');
                const automatic = page.getByRole('button', { name: '자동 갱신', exact: true });
                const manual = page.getByRole('button', { name: '새로고침', exact: true });
                assert.equal(await automatic.count(), 1);
                assert.equal(await manual.count(), 1);
                assert.equal(await automatic.getAttribute('aria-pressed'), 'true');
                assert.equal(requests.length, 0);
                assert.equal(await page.getByRole('heading', { name: '업적', exact: true }).count(), 0);
                await page
                    .getByRole('group', { name: '포지션 필터', exact: true })
                    .getByRole('button', { name: '탑', exact: true })
                    .press('Enter');
                await page.waitForURL((url) => url.searchParams.get('position') === 'top');
                await page.getByRole('button', { name: '최소 게임 늘리기', exact: true }).press('Enter');
                await page.waitForURL((url) => url.searchParams.get('min') === '2');
                await page.getByText('2게임 이상 뛴 사람이 없어요', { exact: true }).waitFor();
                assert.equal(requests.length, 0);

                // 활성 시즌이 이미 바뀌어도 기존 출전 라인업의 다음 실제 ROFL은 고정한 시즌에 반영한다.
                assertAction(
                    await f.action(
                        f.path,
                        'upload',
                        { ...(await f.confirm(2)), file: f.file(1_900_000) },
                        f.participant.cookie
                    ),
                    200
                );
                assert.equal((await f.db.select().from(schema.games)).length, 2);
                assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 20);
                assert.ok(
                    (await f.db.select().from(schema.userPositionMmr)).every(
                        (row) => row.seasonId === f.previousSeason.id
                    )
                );
                assert.equal(await games(page).innerText(), '1');
                const refreshed = await responseAfter(() => page.clock.fastForward(30_100));
                const realSnapshot = (await refreshed.json()) as StatsSnapshot;
                assert.equal(realSnapshot.empty, false);
                if (!realSnapshot.empty) {
                    assert.equal(realSnapshot.showAchievements, false);
                    assert.deepEqual(realSnapshot.achievements, []);
                }
                await page.waitForFunction(() => {
                    const label = [...document.querySelectorAll('p')].find(
                        (node) => node.textContent?.trim() === '총 게임'
                    );
                    return (
                        label?.parentElement?.parentElement
                            ?.querySelector(':scope > p')
                            ?.textContent?.trim() === '2'
                    );
                });
                assert.equal(await games(page).innerText(), '2');
                await page.evaluate(() => {
                    location.hash = 'stats-same-view';
                });
                await page.waitForURL((url) => url.hash === '#stats-same-view');
                await page.clock.runFor(40);
                assert.equal(await games(page).innerText(), '2');
                // 무관 쿼리의 실제 클라이언트 탐색만 재현하고 제품 화면에는 없는 임시 링크를 바로 제거한다.
                const sameView = new URL(page.url());
                sameView.searchParams.set('keep', '2');
                await page.evaluate((href) => {
                    Reflect.set(window, '__statsNavigationProbe', true);
                    const link = document.createElement('a');
                    link.href = href;
                    link.id = 'stats-navigation-probe';
                    link.textContent = 'UI 탐색 표본';
                    document.body.append(link);
                }, sameView.href);
                await page.locator('#stats-navigation-probe').press('Enter');
                await page.waitForURL((url) => url.searchParams.get('keep') === '2');
                await page.clock.runFor(40);
                assert.equal(await page.evaluate(() => Reflect.get(window, '__statsNavigationProbe')), true);
                await page.evaluate(() => {
                    document.getElementById('stats-navigation-probe')?.remove();
                    Reflect.deleteProperty(window, '__statsNavigationProbe');
                });
                assert.equal(await games(page).innerText(), '2');
                const leaderboard = page.getByRole('region', { name: '사용자별 지표', exact: true });
                await leaderboard.locator('tbody tr').nth(1).waitFor();
                assert.equal(await leaderboard.locator('tbody tr').count(), 2);
                const sort = leaderboard.getByRole('button', { name: '승률', exact: true });
                await sort.press('Enter');
                await sort.press('Enter');
                const selected = page
                    .getByRole('group', { name: '포지션 필터', exact: true })
                    .getByRole('button', { name: '탑', exact: true });
                assert.equal(await selected.getAttribute('aria-pressed'), 'true');
                assert.equal(new URL(page.url()).searchParams.get('min'), '2');
                assert.equal(new URL(page.url()).searchParams.get('season'), f.previousSeason.id);
                assert.equal(new URL(page.url()).searchParams.get('keep'), '2');
                assert.equal(requests.at(-1)!.searchParams.get('season'), f.previousSeason.id);
                assert.equal(requests.at(-1)!.searchParams.get('position'), 'top');
                assert.equal(requests.at(-1)!.searchParams.get('min'), '2');
                await capture(page, f, 'auto-refreshed-real-stats');
                const preserved = await leaderboard.innerText();
                fault = 'failure';
                await responseAfter(() => page.clock.fastForward(30_100), 503);
                await page.getByText(fetchError, { exact: true }).waitFor();
                assert.equal(await games(page).innerText(), '2');
                assert.equal(await leaderboard.innerText(), preserved);
                await capture(page, f, 'refresh-error-retains-stats');
                const failedCount = requests.length;
                await page.clock.fastForward(50_000);
                assert.equal(requests.length, failedCount);
                await responseAfter(() => manual.press('Enter'));
                await page.getByText(fetchError, { exact: true }).waitFor({ state: 'hidden' });
                assert.equal(await sort.locator('..').getAttribute('aria-sort'), 'ascending');

                const timedOut = hold();
                await page.clock.fastForward(30_100);
                await timedOut;
                const pendingCount = requests.length;
                assert.equal(await manual.isDisabled(), true);
                await manual.press('Enter');
                await page.clock.fastForward(10_000);
                assert.equal(requests.length, pendingCount);
                await page.clock.fastForward(5_100);
                await page.getByText(timeoutError, { exact: true }).waitFor();
                assert.equal(await manual.isEnabled(), true);
                release();
                await page.clock.runFor(40);
                assert.equal(await games(page).innerText(), '2');
                await page.getByText(timeoutError, { exact: true }).waitFor();
                await responseAfter(() => manual.press('Enter'));
                await page.getByText(timeoutError, { exact: true }).waitFor({ state: 'hidden' });

                const pausing = hold();
                await page.clock.fastForward(30_100);
                await pausing;
                const beforePause = requests.length;
                assert.equal(await automatic.isEnabled(), true);
                await automatic.press('Space');
                assert.equal(await automatic.getAttribute('aria-pressed'), 'false');
                assert.equal(await manual.isEnabled(), true);
                release();
                await page.clock.fastForward(90_000);
                assert.equal(requests.length, beforePause);
                await responseAfter(() => manual.press('Enter'));
                assert.equal(await automatic.getAttribute('aria-pressed'), 'false');
                const pausedCount = requests.length;
                await page.clock.fastForward(60_000);
                assert.equal(requests.length, pausedCount);
                await responseAfter(() => automatic.press('Space'));
                assert.equal(await automatic.getAttribute('aria-pressed'), 'true');

                await page.evaluate(() => {
                    Object.defineProperty(document, 'visibilityState', {
                        configurable: true,
                        value: 'hidden'
                    });
                    document.dispatchEvent(new Event('visibilitychange'));
                });
                const hiddenCount = requests.length;
                await page.clock.fastForward(60_000);
                assert.equal(requests.length, hiddenCount);
                await responseAfter(() =>
                    page.evaluate(() => {
                        Reflect.deleteProperty(document, 'visibilityState');
                        document.dispatchEvent(new Event('visibilitychange'));
                    })
                );
                await context.setOffline(true);
                const offlineCount = requests.length;
                await page.clock.fastForward(60_000);
                assert.equal(requests.length, offlineCount);
                await responseAfter(() => context.setOffline(false));

                const leaving = hold();
                await page.clock.fastForward(30_100);
                await leaving;
                const beforeLeave = requests.length;
                await page.getByRole('link', { name: '문서', exact: true }).press('Enter');
                await page.waitForURL((url) => url.pathname === '/docs');
                release();
                await page.clock.fastForward(120_000);
                assert.equal(requests.length, beforeLeave);
                assert.equal(new URL(page.url()).pathname, '/docs');
                assert.deepEqual(errors, []);
                assert.equal(posts, 0);
                assert.equal(
                    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
                    false
                );
                await context.close();
                if ((width === 1440 && theme === 'primary') || (width === 390 && theme === 'dark'))
                    await injectedState(browser, f, width, theme);
            }
        );
