import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { chromium, type Locator, type Page } from 'playwright';
import { createHttpMatchFiltersFixture } from '../api/support/http-match-filter-fixtures.ts';

type Fixture = Awaited<ReturnType<typeof createHttpMatchFiltersFixture>>;
const captures: Record<string, unknown>[] = [];
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function capture(page: Page, fixture: Fixture, state: string) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const directory = process.env.MSM2_MATCH_FILTER_CAPTURE_DIR;
    if (!directory) return;
    await page.evaluate(async () => {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        await document.fonts.ready;
        await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
    });
    await mkdir(directory, { recursive: true });
    const viewport = page.viewportSize()!;
    const theme = await page.locator('html').getAttribute('data-mode');
    const file = `${viewport.width}-${theme}-${state}.png`;
    const bytes = await page.screenshot({
        path: resolve(directory, file),
        fullPage: true,
        animations: 'disabled'
    });
    const url = new URL(page.url());
    captures.push({
        file,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        url: page.url(),
        path: url.pathname + url.search,
        viewport,
        theme,
        state,
        seasonIds: [fixture.previousSeason.id, fixture.currentSeason.id, fixture.emptySeason.id],
        fixtureMatchIds: Object.values(fixture.cases).map((match) => match.id),
        source: '실제 SSR·익명 기록 목록·정상 ROFL과 두 시즌. 기간 경계의 games.startedAt은 격리 DB에 명시한 테스트 시각이며 ROFL 제공 시각이 아니다.'
    });
    await writeFile(resolve(directory, 'captures.json'), JSON.stringify(captures, null, 4) + '\n');
}

async function ready(page: Page) {
    await page.getByRole('heading', { name: '경기 기록', exact: true }).waitFor();
    await page.getByLabel('내전·팀 이름 검색', { exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
}

async function season(page: Page, name: string) {
    const trigger = page.getByRole('button', { name: /^시즌:/ });
    await trigger.press('Enter');
    const dialog = page.getByRole('dialog', { name: '조회할 시즌', exact: true });
    // 오버레이의 최초 포커스가 완료된 뒤 선택 대상을 누르면 초기 rAF와 키 입력이 경합하지 않는다.
    await page.waitForFunction(
        (node) => {
            const first = node
                ? [
                      ...node.querySelectorAll<HTMLButtonElement>(
                          'button:not(:disabled):not([aria-hidden="true"]):not([tabindex="-1"])'
                      )
                  ].find(
                      (button) =>
                          button.getClientRects().length > 0 &&
                          getComputedStyle(button).visibility !== 'hidden'
                  )
                : undefined;
            return Boolean(first && first === document.activeElement);
        },
        await dialog.elementHandle()
    );
    await dialog.getByRole('button', { name: new RegExp('^' + escape(name)) }).press('Enter');
    await dialog.getByRole('button', { name: new RegExp('^' + escape(name)) }).waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: '시즌: ' + name, exact: true }).waitFor();
    await focused(trigger);
}

async function rows(page: Page) {
    return page
        .locator('section[aria-labelledby="done-matches"] a')
        .evaluateAll((links) =>
            links.map((link) => new URL((link as HTMLAnchorElement).href).pathname.split('/').at(-1))
        );
}

async function focused(control: Locator) {
    assert.equal(await control.evaluate((node) => node === document.activeElement), true);
}

async function expectRows(page: Page, expected: string[]) {
    await page.waitForFunction((ids) => {
        const links = document.querySelectorAll<HTMLAnchorElement>(
            'section[aria-labelledby="done-matches"] a'
        );
        return (
            JSON.stringify([...links].map((link) => new URL(link.href).pathname.split('/').at(-1))) ===
            JSON.stringify(ids)
        );
    }, expected);
    assert.deepEqual(await rows(page), expected);
}

for (const width of [1440, 390])
    for (const theme of ['primary', 'dark'])
        test(
            `경기 검색·한국 시각 기간·시즌을 한 번에 조회하고 오류와 탐색을 복구한다: ${width}px ${theme}`,
            { timeout: 90_000 },
            async (t) => {
                let release = () => {};
                t.after(() => release());
                const browser = await chromium.launch({ headless: true });
                t.after(() => browser.close());
                const f = await createHttpMatchFiltersFixture(t);
                const context = await browser.newContext({
                    viewport: { width, height: width === 390 ? 844 : 1000 },
                    reducedMotion: 'reduce'
                });
                await context.addInitScript((mode) => localStorage.setItem('theme-mode', mode), theme);
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
                const page = await context.newPage();
                page.setDefaultTimeout(10_000);
                const errors: string[] = [];
                const loads: URL[] = [];
                let posts = 0;
                page.on('pageerror', (error) => errors.push(error.message));
                page.on('console', (entry) => {
                    if (entry.type() === 'error' && !entry.text().startsWith('Failed to load resource:'))
                        errors.push(entry.text());
                });
                page.on('request', (request) => {
                    if (request.method() === 'POST') posts++;
                    const url = new URL(request.url());
                    if (url.pathname === f.matchListPath + '/__data.json') loads.push(url);
                });
                const query = page.getByLabel('내전·팀 이름 검색', { exact: true });
                const from = page.getByLabel('시작일', { exact: true });
                const to = page.getByLabel('종료일', { exact: true });
                const submit = page.getByRole('button', { name: '조회', exact: true });
                const reset = page.getByRole('button', { name: '초기화', exact: true });
                const day = '2026-10-24';
                const text = '%_';
                const sameTime = Array.from(
                    { length: 21 },
                    (_, index) => f.cases['sameTime' + index]!.id
                ).sort();
                const dayResults = [f.cases.atUpper!.id, ...sameTime, f.cases.atLower!.id];
                const doneSection = page.locator('section[aria-labelledby="done-matches"]');
                const liveSection = page.locator('section[aria-labelledby="live-matches"]');
                const keep = (url: URL) => assert.equal(url.searchParams.get('keep'), '유지');
                const applied = async (expected: Record<string, string | null>) => {
                    await page.waitForURL((url) =>
                        Object.entries(expected).every(([key, value]) => url.searchParams.get(key) === value)
                    );
                    keep(new URL(page.url()));
                };

                await page.goto(f.url + f.matchListPath + '?page=2&keep=' + encodeURIComponent('유지'));
                await ready(page);
                assert.equal(await query.count(), 1);
                assert.equal(await from.count(), 1);
                assert.equal(await to.count(), 1);
                assert.equal(await submit.count(), 1);
                assert.equal(await reset.count(), 0);
                await page.getByRole('button', { name: '시즌: 전체 시즌', exact: true }).waitFor();
                assert.equal((await rows(page)).length, 8);
                for (const id of [f.match.id, f.cases.unknown!.id, f.cases.cancelled!.id])
                    assert.ok((await rows(page)).includes(id));
                assert.equal(await liveSection.locator('a').count(), 2);

                // 네 조건을 편집하는 동안 조회하지 않고 제출한 한 번의 GET에 함께 반영한다.
                const initialUrl = page.url();
                const initialLoads = loads.length;
                await query.fill(text);
                await from.fill(day);
                await to.fill(day);
                await season(page, f.currentSeason.name);
                assert.equal(await reset.count(), 1);
                assert.equal(page.url(), initialUrl);
                assert.equal(loads.length, initialLoads);
                await submit.press('Enter');
                await applied({ q: text, from: day, to: day, season: f.currentSeason.id, page: null });
                await expectRows(page, dayResults.slice(0, 20));
                assert.equal(loads.length - initialLoads, 1);
                assert.equal(await liveSection.locator('a').count(), 1);
                assert.ok(
                    (await liveSection.locator('a').getAttribute('href'))?.endsWith(f.cases.liveKnown!.id)
                );
                for (const id of [
                    f.cases.beforeLower!.id,
                    f.cases.afterUpper!.id,
                    f.cases.unknown!.id,
                    f.match.id
                ])
                    assert.equal(await page.locator(`a[href$="/matches/${id}"]`).count(), 0);
                const navigation = page.getByRole('navigation', { name: '쪽 이동', exact: true });
                await navigation.getByRole('button', { name: '2', exact: true }).press('Enter');
                await applied({ q: text, from: day, to: day, season: f.currentSeason.id, page: '2' });
                await expectRows(page, dayResults.slice(20));
                await navigation.locator('button[aria-current="page"]').waitFor();
                assert.equal(await navigation.locator('button[aria-current="page"]').innerText(), '2');
                await capture(page, f, 'filtered-page-two');

                // 쪽 이동은 적용된 URL 조건만 바꾸고 아직 제출하지 않은 입력은 보존한다.
                await query.fill('미제출 초안');
                await navigation.getByRole('button', { name: '1', exact: true }).press('Enter');
                await applied({ q: text, from: day, to: day, season: f.currentSeason.id, page: null });
                await expectRows(page, dayResults.slice(0, 20));
                assert.equal(await query.inputValue(), '미제출 초안');

                await query.fill('없는 경기 검색');
                await submit.press('Enter');
                await applied({
                    q: '없는 경기 검색',
                    from: day,
                    to: day,
                    season: f.currentSeason.id,
                    page: null
                });
                await page.getByText('조건에 맞는 경기가 없어요', { exact: true }).waitFor();
                assert.equal(await page.getByText('조건에 맞는 경기가 없어요', { exact: true }).count(), 1);
                assert.deepEqual(await rows(page), []);
                assert.equal(await from.inputValue(), day);
                assert.equal(await to.inputValue(), day);
                await capture(page, f, 'empty-filter-results');
                await query.fill(text);
                await submit.press('Enter');
                await applied({ q: text });
                await expectRows(page, dayResults.slice(0, 20));

                const invalidUrl = new URL(f.url + f.matchListPath);
                invalidUrl.search = new URLSearchParams({
                    q: text,
                    from: '2026-02-30',
                    to: day,
                    season: f.currentSeason.id,
                    page: '2',
                    keep: '유지'
                }).toString();
                assert.equal((await page.goto(invalidUrl.href))!.status(), 200);
                await ready(page);
                await page
                    .getByRole('alert')
                    .getByText('시작일을 올바른 날짜(YYYY-MM-DD)로 입력해 주세요', { exact: true })
                    .waitFor();
                assert.equal(await doneSection.count(), 0);
                assert.equal(await page.getByText('조건에 맞는 경기가 없어요', { exact: true }).count(), 0);
                assert.equal(await query.inputValue(), text);
                assert.equal(await to.inputValue(), day);
                await capture(page, f, 'invalid-date-correction');
                const beforeInvalid = loads.length;
                await from.fill('2026-10-25');
                await submit.press('Enter');
                await page
                    .getByRole('alert')
                    .getByText('종료일을 시작일과 같거나 이후로 선택해 주세요', { exact: true })
                    .waitFor();
                assert.equal(loads.length, beforeInvalid);
                await focused(to);
                assert.equal(await from.inputValue(), '2026-10-25');
                assert.equal(await to.inputValue(), day);
                await from.fill(day);
                await submit.press('Enter');
                await applied({ q: text, from: day, to: day, season: f.currentSeason.id, page: null });
                await expectRows(page, dayResults.slice(0, 20));

                await reset.press('Enter');
                await applied({ q: null, from: null, to: null, season: null, page: null });
                assert.equal(await query.inputValue(), '');
                assert.equal(await from.inputValue(), '');
                assert.equal(await to.inputValue(), '');
                await page.getByRole('button', { name: '시즌: 전체 시즌', exact: true }).waitFor();
                await season(page, f.previousSeason.name);
                await submit.press('Enter');
                await applied({ season: f.previousSeason.id });
                await expectRows(page, [f.match.id]);
                assert.ok((await doneSection.innerText()).includes('날짜 미확인'));

                await season(page, '전체 시즌');
                await query.fill(text);
                await from.fill(day);
                await to.fill(day);
                let arrived!: () => void;
                let held: Promise<void>;
                const arm = () => {
                    const pending = new Promise<void>((done) => {
                        arrived = done;
                    });
                    held = new Promise<void>((done) => {
                        release = done;
                    });
                    return pending;
                };
                let holding = false;
                await context.route('**/*', async (route) => {
                    const request = route.request();
                    if (!holding || new URL(request.url()).pathname !== f.matchListPath + '/__data.json')
                        return route.fallback();
                    holding = false;
                    const response = await route.fetch({
                        headers: { ...request.headers(), 'x-forwarded-proto': 'https' },
                        maxRedirects: 0
                    });
                    arrived();
                    await held;
                    await route.fulfill({ response }).catch(() => {});
                });
                const pending = arm();
                const beforeBusy = loads.length;
                holding = true;
                await submit.press('Enter');
                await pending;
                assert.equal(await submit.isDisabled(), true);
                assert.deepEqual(await rows(page), [f.match.id]);
                assert.ok(await page.locator('[aria-busy="true"]').count());
                await submit.evaluate((node) => (node as HTMLButtonElement).form?.requestSubmit());
                await submit.press('Enter');
                assert.equal(loads.length - beforeBusy, 1);
                release();
                await applied({ q: text, from: day, to: day, season: null, page: null });
                await expectRows(page, dayResults.slice(0, 20));

                if (width === 1440 && theme === 'primary') {
                    const leaving = arm();
                    holding = true;
                    await query.fill('늦게 끝난 검색');
                    await submit.press('Enter');
                    await leaving;
                    await page.getByRole('link', { name: '문서', exact: true }).press('Enter');
                    await page.waitForURL((url) => url.pathname === '/docs');
                    release();
                    await page.evaluate(
                        () =>
                            new Promise<void>((done) =>
                                requestAnimationFrame(() => requestAnimationFrame(() => done()))
                            )
                    );
                    assert.equal(new URL(page.url()).pathname, '/docs');
                    await page.getByRole('heading', { level: 1 }).waitFor();
                }
                assert.equal(posts, 0);
                assert.deepEqual(errors, []);
                assert.equal(
                    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
                    false
                );
            }
        );
