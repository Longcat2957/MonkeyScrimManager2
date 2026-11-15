import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, type Page } from 'playwright';
import { stringify, unflatten } from 'devalue';
import type { GuildRanking } from '../../src/lib/features/guild/types.ts';
import type { SectionResult } from '../../src/lib/features/section.ts';
import { createHttpRecordSeasonsFixture } from '../api/support/http-record-seasons-fixtures.ts';

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
async function settled(page: Page) {
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    // SSR 뒤 모바일/데스크톱 메뉴의 초기 교체 전환이 끝난 상태에서 조작한다.
    await page.waitForTimeout(700);
}

async function selectSeason(page: Page, name: string, id: string) {
    await page.getByRole('button', { name: /^시즌:/ }).press('Enter');
    const dialog = page.getByRole('dialog', { name: '조회할 시즌', exact: true });
    await dialog.getByRole('button', { name: new RegExp('^' + escape(name)) }).press('Enter');
    await page.waitForURL((url) => url.searchParams.get('season') === id);
    await page.getByRole('button', { name: '시즌: ' + name, exact: true }).waitFor();
}

for (const [width, theme] of [
    [1440, 'primary'],
    [390, 'dark']
] as const)
    test(
        `실제 과거 시즌을 세 공개 화면에서 선택하고 필터·링크·추가 조회 문맥을 유지한다: ${width}px ${theme}`,
        { timeout: 90_000 },
        async (t) => {
            const browser = await chromium.launch({ headless: true });
            t.after(() => browser.close());
            const f = await createHttpRecordSeasonsFixture(t, { games: 3 });
            const context = await browser.newContext({
                viewport: { width, height: width === 390 ? 844 : 1000 }
            });
            await context.addInitScript((mode) => {
                try {
                    localStorage.setItem('theme-mode', mode);
                } catch {}
            }, theme);
            const origin = new URL(f.url).origin;
            const rankingRequests: URL[] = [];
            let boundaryHint = true;
            await context.route('**/*', async (route) => {
                const request = route.request();
                const url = new URL(request.url());
                if (url.origin !== origin) return route.abort();
                const response = await route.fetch({
                    headers: { ...request.headers(), 'x-forwarded-proto': 'https' },
                    maxRedirects: 0
                });
                if (url.pathname === f.paths.ranking) rankingRequests.push(url);
                if (
                    boundaryHint &&
                    url.pathname === f.paths.home + '/__data.json' &&
                    url.searchParams.get('season') === f.previousSeason.id
                ) {
                    const payload = (await response.json()) as {
                        nodes: ({ type: string; data?: unknown[] } | null)[];
                    };
                    for (const node of payload.nodes) {
                        if (node?.type !== 'data' || !node.data) continue;
                        const data = unflatten(node.data) as Record<string, unknown>;
                        const ranking = data.ranking as SectionResult<GuildRanking | null> | undefined;
                        if (!ranking?.ok || !ranking.value) continue;
                        // 실제 두 순위 행은 유지하고 추가 조회 경로를 실행할 힌트만 테스트에서 한 번 켠다.
                        ranking.value.positions.top.hasMore = true;
                        node.data = JSON.parse(stringify(data));
                        boundaryHint = false;
                    }
                    await route.fulfill({ response, json: payload });
                } else await route.fulfill({ response });
            });
            const page = await context.newPage();
            page.setDefaultTimeout(10_000);
            const errors: string[] = [];
            let posts = 0;
            page.on('request', (request) => {
                if (request.method() === 'POST') posts++;
            });
            page.on('pageerror', (error) => errors.push(error.message));
            page.on('console', (message) => {
                if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
                    errors.push(message.text());
            });
            for (const [name, path] of Object.entries({
                home: f.paths.home,
                player: f.paths.player,
                stats: f.paths.stats
            })) {
                const query = new URLSearchParams({
                    position: 'top',
                    min: '1',
                    recent: '1',
                    q: '유지할 검색',
                    page: '3',
                    offset: '20'
                });
                await page.goto(f.url + path + '?' + query);
                await settled(page);
                assert.equal(await page.evaluate(() => document.documentElement.dataset.mode), theme);
                const trigger = page.getByRole('button', {
                    name: '시즌: ' + f.currentSeason.name,
                    exact: true
                });
                assert.equal(await trigger.getAttribute('aria-haspopup'), 'dialog');
                assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
                await trigger.focus();
                await trigger.press('Enter');
                const menu = page.getByRole('dialog', { name: '조회할 시즌', exact: true });
                const oldOption = menu.getByRole('button', {
                    name: new RegExp('^' + escape(f.previousSeason.name))
                });
                await oldOption.waitFor();
                assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
                const currentOption = menu.getByRole('button', {
                    name: new RegExp('^' + escape(f.currentSeason.name))
                });
                assert.equal(
                    await currentOption.evaluate((button) => {
                        const bounds = button.getBoundingClientRect();
                        const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
                        while (walker.nextNode()) {
                            if (!walker.currentNode.textContent?.trim()) continue;
                            const range = document.createRange();
                            range.selectNodeContents(walker.currentNode);
                            for (const rect of range.getClientRects())
                                if (
                                    rect.left < bounds.left - 1 ||
                                    rect.right > bounds.right + 1 ||
                                    rect.top < bounds.top - 1 ||
                                    rect.bottom > bounds.bottom + 1
                                )
                                    return false;
                        }
                        return true;
                    }),
                    true,
                    '긴 시즌 이름과 상태 설명을 옵션 안에서 모두 읽을 수 있어야 한다.'
                );
                assert.equal(
                    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
                    false
                );
                await page.keyboard.press('Escape');
                await oldOption.waitFor({ state: 'hidden' });
                assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
                assert.match(await page.evaluate(() => document.activeElement?.textContent ?? ''), /시즌:/);
                const more =
                    name === 'home'
                        ? page.waitForRequest((request) => {
                              const url = new URL(request.url());
                              return (
                                  url.pathname === f.paths.ranking &&
                                  url.searchParams.get('season') === f.previousSeason.id
                              );
                          })
                        : null;
                await selectSeason(page, f.previousSeason.name, f.previousSeason.id);
                const selectedUrl = new URL(page.url());
                for (const [key, value] of [
                    ['position', 'top'],
                    ['min', '1'],
                    ['recent', '1'],
                    ['q', '유지할 검색']
                ])
                    assert.equal(selectedUrl.searchParams.get(key), value);
                assert.equal(selectedUrl.searchParams.has('page'), false);
                assert.equal(selectedUrl.searchParams.has('offset'), false);
                if (name === 'home') {
                    const list = page.getByRole('list', { name: '탑 순위', exact: true });
                    await list.waitFor();
                    await list.evaluate((node) => {
                        const scroller = node.parentElement!;
                        scroller.scrollTop = scroller.scrollHeight;
                        scroller.dispatchEvent(new Event('scroll'));
                    });
                    await more;
                    await page.getByText('마지막 순위예요', { exact: true }).waitFor();
                    assert.ok(
                        rankingRequests.some(
                            (url) =>
                                url.searchParams.get('offset') === '2' &&
                                url.searchParams.get('season') === f.previousSeason.id
                        )
                    );
                    assert.equal(await list.getByRole('link').count(), 2);
                    assert.equal(await page.locator(`a[href$="/scrims/${f.currentRecruit.id}"]`).count(), 1);
                }
                const profileLinks = page.locator('a[href*="/players/"]');
                await profileLinks.first().waitFor();
                const hrefs = await profileLinks.evaluateAll((links) =>
                    links.map((link) => (link as HTMLAnchorElement).href)
                );
                assert.ok(hrefs.length > 0);
                assert.ok(
                    hrefs.every((href) => new URL(href).searchParams.get('season') === f.previousSeason.id)
                );
                if (name === 'home') {
                    const previousUrl = page.url();
                    await profileLinks.first().click();
                    await page.waitForURL(
                        (url) =>
                            url.pathname.includes('/players/') &&
                            url.searchParams.get('season') === f.previousSeason.id
                    );
                    await page.goto(previousUrl);
                    await settled(page);
                }
                assert.equal(
                    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
                    false
                );
                await selectSeason(page, f.currentSeason.name, f.currentSeason.id);
                assert.equal(
                    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
                    false
                );
            }
            assert.equal(posts, 0);
            assert.deepEqual(errors, []);
        }
    );
