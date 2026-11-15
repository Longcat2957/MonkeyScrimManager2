import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { and, eq } from 'drizzle-orm';
import { chromium, type BrowserContext, type Page } from 'playwright';
import * as schema from '../../src/lib/server/db/schema.ts';
import { assertAction } from '../api/support/http.ts';
import { createHttpMatchResultFixture } from '../api/support/http-match-fixtures.ts';

type Fixture = Awaited<ReturnType<typeof createHttpMatchResultFixture>>;
const captures: Record<string, unknown>[] = [];

async function completeSeries(f: Fixture) {
    for (const order of [1, 2])
        assertAction(
            await f.action(
                f.path,
                'upload',
                { ...(await f.confirm(order)), file: f.file(1_800_125 + order * 100_000) },
                f.participant.cookie
            ),
            200
        );
    const games = (await f.db.select().from(schema.games)).sort(
        (left, right) => left.gameNumber - right.gameNumber
    );
    assert.equal(games.length, 2);
    assert.equal((await f.matchRow()).status, 'completed');
    return games;
}

async function publicContext(context: BrowserContext, fixture: Fixture) {
    const origin = new URL(fixture.url).origin;
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

async function capture(page: Page, state: string) {
    const directory = process.env.MSM2_PRIVACY_DETAIL_CAPTURE_DIR;
    if (!directory) return;
    await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
    });
    await mkdir(directory, { recursive: true });
    const viewport = page.viewportSize()!;
    const theme = await page.locator('html').getAttribute('data-mode');
    const file = `${viewport.width}-${theme}-${state}.png`;
    const bytes = await page.screenshot({ path: resolve(directory, file), animations: 'disabled' });
    const url = new URL(page.url());
    captures.push({
        file,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        viewport,
        theme,
        state,
        url: page.url(),
        path: url.pathname + url.search,
        source: '실제 두 세트 ROFL·익명 경기 화면·별도 본인 세션 공개 설정 action·history 재조회'
    });
    await writeFile(resolve(directory, 'captures.json'), JSON.stringify(captures, null, 4) + '\n');
}

for (const width of [1440, 390])
    for (const theme of ['primary', 'dark'])
        test(
            `열린 선수 상세는 같은 경기 재조회에서 공개 설정을 갱신하고 다른 세트에서는 닫힌다: ${width}px ${theme}`,
            { timeout: 60_000 },
            async (t) => {
                const browser = await chromium.launch({ headless: true });
                t.after(() => browser.close());
                const f = await createHttpMatchResultFixture(t);
                const games = await completeSeries(f);
                const latest = games[1]!;
                const [target] = await f.db
                    .select()
                    .from(schema.users)
                    .where(eq(schema.users.id, f.identities[0]!.userId));
                const [snapshot] = await f.db
                    .select()
                    .from(schema.gameParticipants)
                    .where(
                        and(
                            eq(schema.gameParticipants.gameId, latest.id),
                            eq(schema.gameParticipants.scrimParticipantId, f.people[0]!.id)
                        )
                    );
                const context = await browser.newContext({
                    viewport: { width, height: width === 390 ? 844 : 1000 },
                    reducedMotion: 'reduce'
                });
                await publicContext(context, f);
                await context.addInitScript((mode) => localStorage.setItem('theme-mode', mode), theme);
                const page = await context.newPage();
                page.setDefaultTimeout(10_000);
                const errors: string[] = [];
                page.on('pageerror', (error) => errors.push(error.message));
                page.on('console', (message) => {
                    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
                        errors.push(message.text());
                });

                // 뒤로 가기 대상은 실제 다른 세트 방문으로 준비하고, 상세를 열기 전에 최신 경기에 진입한다.
                await page.goto(f.url + f.path + '?game=' + games[0]!.id);
                await page.locator('#game-heading').getByText('1세트', { exact: true }).waitFor();
                await page.goto(f.url + f.path);
                await page.locator('#game-heading').getByText('2세트', { exact: true }).waitFor();
                await page
                    .getByRole('group', { name: '세트 선택', exact: true })
                    .getByRole('button', {
                        name: '2세트',
                        exact: true
                    })
                    .click();
                await page.waitForURL((url) => url.searchParams.get('game') === latest.id);
                const originalName = snapshot!.displayName;
                await page
                    .locator('tr')
                    .filter({ has: page.locator(`a[href$="/players/${target!.id}"]`) })
                    .getByRole('button', { name: /^상세/ })
                    .press('Enter');
                const original = page.getByRole('dialog', { name: originalName + ' 상세', exact: true });
                await original.getByRole('heading', { name: originalName, level: 2, exact: true }).waitFor();
                const metrics = await original.locator('dl').innerText();
                await capture(page, 'open-public-detail');

                // 현재 브라우저의 열린 객체를 유지한 채 다른 세션에서 실제 설정을 저장한다.
                assertAction(
                    await f.action(
                        '/me',
                        'privacy',
                        { publicProfile: 'false', publicRiotIds: 'false' },
                        f.participant.cookie
                    ),
                    200
                );
                const reload = page.waitForResponse((response) => {
                    const url = new URL(response.url());
                    return url.pathname === f.path + '/__data.json' && !url.searchParams.has('game');
                });
                await page.goBack();
                assert.equal((await reload).status(), 200);
                await page.waitForURL((url) => url.pathname === f.path && !url.searchParams.has('game'));
                const hidden = page.getByRole('dialog', { name: '비공개 사용자 상세', exact: true });
                await hidden.getByRole('heading', { name: '비공개 사용자', level: 2, exact: true }).waitFor();
                assert.equal(await original.count(), 0);
                assert.equal((await hidden.innerText()).includes(originalName), false);
                assert.equal((await page.locator('body').innerText()).includes(originalName), false);
                assert.equal(await hidden.locator('dl').innerText(), metrics);
                assert.equal(
                    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
                    false
                );
                await capture(page, 'open-private-detail-refreshed');

                // 열린 상세를 유지한 채 다른 세트의 history로 이동하면 이전 선택을 남기지 않는다.
                await page.goBack();
                await page.waitForURL((url) => url.searchParams.get('game') === games[0]!.id);
                await page.locator('#game-heading').getByText('1세트', { exact: true }).waitFor();
                await hidden.waitFor({ state: 'hidden' });
                assert.equal(await page.getByRole('dialog').count(), 0);
                assert.deepEqual(errors, []);
            }
        );

for (const width of [1440, 390])
    test(`선수 상세를 Escape 직후 같은 대상으로 다시 열어도 패널이 유지된다: ${width}px`, async (t) => {
        const browser = await chromium.launch({ headless: true });
        t.after(() => browser.close());
        const f = await createHttpMatchResultFixture(t);
        await completeSeries(f);
        const theme = width === 390 ? 'dark' : 'primary';
        const context = await browser.newContext({
            viewport: { width, height: width === 390 ? 844 : 1000 },
            reducedMotion: 'reduce'
        });
        await publicContext(context, f);
        await context.addInitScript((mode) => localStorage.setItem('theme-mode', mode), theme);
        const page = await context.newPage();
        page.setDefaultTimeout(10_000);
        await page.goto(f.url + f.path);
        await page.locator('#game-heading').getByText('2세트', { exact: true }).waitFor();
        const target = page
            .locator('tr')
            .filter({ has: page.locator(`a[href$="/players/${f.identities[0]!.userId}"]`) })
            .getByRole('button', { name: /^상세/ });
        await target.press('Enter');
        const dialog = page.getByRole('dialog', { includeHidden: true });
        await dialog.getByRole('heading', { level: 2 }).waitFor();
        const originalName = await dialog.getByRole('heading', { level: 2 }).innerText();
        // 설치된 Popup의 기본 진입 450ms가 끝난 뒤 종료 240ms 안에 같은 조작을 반복한다.
        await page.waitForTimeout(500);
        const beforeClose = await page.evaluate(() => performance.now());
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        await target.press('Enter');
        const elapsedMs = (await page.evaluate(() => performance.now())) - beforeClose;
        const immediateOpen = (await dialog.count()) === 1;
        await page.waitForTimeout(300);
        const headingVisible = await dialog.getByRole('heading', { level: 2 }).isVisible();
        const closeVisible = await dialog.getByRole('button', { name: '닫기', exact: true }).isVisible();
        const final = await dialog.evaluate((node) => {
            const box = node.getBoundingClientRect();
            const heading = node.querySelector('h2')?.getBoundingClientRect();
            return {
                overlayOpen: node.getAttribute('aria-modal') === 'true',
                label: node.getAttribute('aria-label'),
                childCount: node.childElementCount,
                width: box.width,
                height: box.height,
                heading: heading ? { width: heading.width, height: heading.height } : null
            };
        });
        t.diagnostic(
            JSON.stringify({
                width,
                theme,
                targetParticipantId: f.people[0]!.id,
                originalName,
                introWaitMs: 500,
                escapeToReopenMs: elapsedMs,
                afterReopenWaitMs: 300,
                immediateOpen,
                headingVisible,
                closeVisible,
                final
            })
        );
        assert.equal(immediateOpen, true);
        assert.equal(final.overlayOpen, true);
        assert.equal(headingVisible, true);
        assert.equal(closeVisible, true);
        assert.equal(await dialog.getByRole('heading', { level: 2 }).innerText(), originalName);
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        assert.equal(await target.evaluate((node) => node === document.activeElement), true);
    });
