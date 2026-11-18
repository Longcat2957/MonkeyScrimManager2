import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { chromium, type Page } from 'playwright';
import { createHttpMatchFiltersFixture } from '../api/support/http-match-filter-fixtures.ts';

type Fixture = Awaited<ReturnType<typeof createHttpMatchFiltersFixture>>;
const captures: Record<string, unknown>[] = [];

async function capture(page: Page, fixture: Fixture, state: string) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const directory = process.env.MSM2_MATCH_FILTER_CAPTURE_DIR;
    if (!directory) return;
    await page.evaluate(async () => {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        await document.fonts.ready;
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

function recordLinks(page: Page) {
    return page.locator('main li a[href*="/matches/"]');
}

async function expectRows(page: Page, expected: string[]) {
    if (expected.length) {
        await page.locator(`main li a[href*="/matches/${expected[0]}"]`).waitFor();
    } else {
        await recordLinks(page).first().waitFor({ state: 'detached' });
    }
    assert.deepEqual(
        await recordLinks(page).evaluateAll((links) =>
            links.map((link) => new URL((link as HTMLAnchorElement).href).pathname.split('/').at(-1))
        ),
        expected
    );
}

for (const width of [1440, 390])
    for (const theme of ['primary', 'dark'])
        test(`경기 기록의 검색·쪽 이동·복구: ${width}px ${theme}`, { timeout: 90_000 }, async (t) => {
            const browser = await chromium.launch();
            t.after(() => browser.close());
            const f = await createHttpMatchFiltersFixture(t);
            const context = await browser.newContext({
                viewport: { width, height: width === 390 ? 844 : 1000 },
                reducedMotion: 'reduce',
                javaScriptEnabled: width !== 390 || theme !== 'primary'
            });
            await context.addInitScript((mode) => localStorage.setItem('theme-mode', mode), theme);
            const origin = new URL(f.url).origin;
            await context.route('**/*', async (route) => {
                if (new URL(route.request().url()).origin !== origin) return route.abort();
                await route.fulfill({
                    response: await route.fetch({
                        headers: { ...route.request().headers(), 'x-forwarded-proto': 'https' },
                        maxRedirects: 0
                    })
                });
            });
            const page = await context.newPage();
            page.setDefaultTimeout(10_000);
            const errors: string[] = [];
            page.on('pageerror', (error) => errors.push(error.message));
            const base = f.url + f.matchListPath;
            const query = page.getByLabel('내전명', { exact: true });
            const player = page.getByLabel('출전 선수', { exact: true });
            const champion = page.getByLabel('픽한 챔피언', { exact: true });
            const submit = page.getByRole('button', { name: '조회', exact: true });
            const from = page.getByLabel('시작일', { exact: true });
            const to = page.getByLabel('종료일', { exact: true });
            const season = page.getByLabel('조회할 시즌');
            const bo = page.getByLabel('경기 형식');
            const filter = page.locator('details').filter({ has: bo });
            const openFilters = async () => {
                if (!(await bo.isVisible())) await filter.locator('summary').press('Enter');
            };
            const search = async (key: string, value: string) => {
                await Promise.all([
                    page.waitForURL((url) => url.searchParams.get(key) === value),
                    submit.press('Enter')
                ]);
            };
            const day = '2026-10-24';
            const text = '기간 %_';
            const sameTime = Array.from({ length: 21 }, (_, i) => f.cases['sameTime' + i]!.id).sort();
            const dayResults = [f.cases.atUpper!.id, ...sameTime, f.cases.atLower!.id];

            await page.goto(base + '?page=2');
            await page.getByRole('heading', { name: '경기 기록', exact: true }).waitFor();
            assert.equal(await recordLinks(page).count(), 7);
            for (const key of ['cancelled', 'liveKnown', 'liveUnknown'])
                assert.equal(await page.locator(`main a[href$="/matches/${f.cases[key]!.id}"]`).count(), 0);
            await openFilters();
            await query.fill(text);
            await from.fill(day);
            await to.fill(day);
            await season.selectOption(f.currentSeason.id);
            await search('q', text);
            assert.ok(!new URL(page.url()).searchParams.has('page'));
            await expectRows(page, dayResults.slice(0, 20));
            const navigation = page.getByRole('navigation', { name: '쪽 이동' });
            await navigation.getByRole('link', { name: '2', exact: true }).press('Enter');
            await page.waitForURL((url) => url.searchParams.get('page') === '2');
            await expectRows(page, dayResults.slice(20));
            assert.equal(new URL(page.url()).searchParams.get('season'), f.currentSeason.id);
            await capture(page, f, 'filtered-page-two');

            await openFilters();
            await bo.selectOption('3');
            await search('bo', '3');
            await expectRows(page, [f.cases.sameTime0!.id]);
            await page.goto(base);
            await player.fill('ReplayPlayer1');
            await champion.fill('Garen');
            await search('champion', 'Garen');
            await expectRows(page, [f.match.id]);
            await champion.fill('Lux');
            await search('champion', 'Lux');
            await expectRows(page, []);
            await capture(page, f, 'empty-filter-results');
            await page.goBack();
            await expectRows(page, [f.match.id]);
            await page.goto(base + '?from=2026-02-30&to=' + day);
            await page.getByRole('alert').waitFor();
            await expectRows(page, []);
            await capture(page, f, 'invalid-date-correction');
            await openFilters();
            await from.fill(day);
            await search('from', day);
            await expectRows(page, dayResults.slice(0, 20));
            await page.getByRole('link', { name: '초기화', exact: true }).press('Enter');
            await page.waitForURL(base);
            assert.equal(await query.inputValue(), '');
            assert.equal(await recordLinks(page).count(), 20);
            await capture(page, f, 'archive');
            assert.deepEqual(errors, []);
        });
