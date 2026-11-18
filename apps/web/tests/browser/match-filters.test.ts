import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, type Page } from 'playwright';
import { createHttpMatchFiltersFixture } from '../api/support/http-match-filter-fixtures.ts';
import { assertNoOverflow, sessionContext } from './support/browser.ts';

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

test('경기 기록의 검색·쪽 이동·복구', { timeout: 360_000 }, async (t) => {
    // 익명 GET만 쓰는 네 가지 화면 조건은 같은 경기 자료를 읽고 새 브라우저 문맥에서 시작한다.
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const f = await createHttpMatchFiltersFixture(t);
    for (const [width, theme] of [
        [1440, 'primary'],
        [1440, 'dark'],
        [390, 'primary'],
        [390, 'dark']
    ] as const)
        await t.test(`${width}px ${theme}`, { timeout: 90_000 }, async (scenario) => {
            const context = await browser.newContext({
                viewport: { width, height: width === 390 ? 844 : 1000 },
                reducedMotion: 'reduce',
                javaScriptEnabled: width !== 390 || theme !== 'primary'
            });
            scenario.after(() => context.close());
            await context.addInitScript((mode) => localStorage.setItem('theme-mode', mode), theme);
            await sessionContext(context, f);
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
            await assertNoOverflow(page, 'filtered-page-two');

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
            await assertNoOverflow(page, 'empty-filter-results');
            await page.goBack();
            await expectRows(page, [f.match.id]);
            await page.goto(base + '?from=2026-02-30&to=' + day);
            await page.getByRole('alert').waitFor();
            await expectRows(page, []);
            await assertNoOverflow(page, 'invalid-date-correction');
            await openFilters();
            await from.fill(day);
            await search('from', day);
            await expectRows(page, dayResults.slice(0, 20));
            await page.getByRole('link', { name: '초기화', exact: true }).press('Enter');
            await page.waitForURL(base);
            assert.equal(await query.inputValue(), '');
            assert.equal(await recordLinks(page).count(), 20);
            await assertNoOverflow(page, 'archive');
            assert.deepEqual(errors, []);
        });
});
