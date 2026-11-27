import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { chromium } from 'playwright';
import * as schema from '../../src/lib/server/db/schema.ts';
import { assertAction } from '../api/support/http.ts';
import { createHttpMatchResultFixture } from '../api/support/http-match-fixtures.ts';
import { appErrors, sessionContext } from './support/browser.ts';

type Fixture = Awaited<ReturnType<typeof createHttpMatchResultFixture>>;

async function completeSeries(f: Fixture) {
    for (const order of [1, 2]) assertAction(await f.record(order, f.file(1_800_125 + order * 100_000)), 200);
    const games = (await f.db.select().from(schema.games)).sort(
        (left, right) => left.gameNumber - right.gameNumber
    );
    assert.equal(games.length, 2);
    assert.equal((await f.matchRow()).status, 'completed');
    return games;
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
                const owner = f.identities[0]!;
                const snapshotName = '경기 당시 참가 이름';
                await f.db
                    .update(schema.scrimParticipants)
                    .set({ displayName: snapshotName })
                    .where(eq(schema.scrimParticipants.id, f.people[0]!.id));
                const games = await completeSeries(f);
                const latest = games[1]!;
                const [target] = await f.db
                    .select()
                    .from(schema.users)
                    .where(eq(schema.users.id, owner.userId));
                const context = await browser.newContext({
                    viewport: { width, height: width === 390 ? 844 : 1000 },
                    reducedMotion: 'reduce'
                });
                await sessionContext(context, f);
                await context.addInitScript((mode) => localStorage.setItem('theme-mode', mode), theme);
                const page = await context.newPage();
                page.setDefaultTimeout(10_000);
                const errors = appErrors(page);

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
                const publicLink = page.locator(`a[href$="/players/${owner.userId}"]`);
                // 한 포지션 행에 두 팀 선수가 함께 있으므로 해당 선수의 칸으로 좁힌다.
                const row = page.locator('td').filter({ has: publicLink });
                assert.equal(await publicLink.innerText(), snapshotName);
                await row.getByText(`${owner.gameName}#${owner.tagLine}`, { exact: true }).waitFor();
                await row.getByRole('button', { name: /^상세/ }).press('Enter');
                const dialog = page.getByRole('dialog', { name: '선수 상세', exact: true });
                await dialog.getByRole('heading', { name: snapshotName, level: 3, exact: true }).waitFor();
                const metrics = await dialog.locator('dl').innerText();

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
                const response = await reload;
                assert.equal(response.status(), 200);
                await page.waitForURL((url) => url.pathname === f.path && !url.searchParams.has('game'));
                await dialog.getByRole('heading', { name: '비공개 사용자', level: 3, exact: true }).waitFor();
                const pageText = await page.locator('body').innerText();
                const payload = await response.text();
                for (const privateValue of [snapshotName, owner.gameName, owner.userId]) {
                    assert.equal(pageText.includes(privateValue), false);
                    assert.equal(payload.includes(privateValue), false);
                }
                assert.equal(await publicLink.count(), 0);
                const privateLink = page.locator(`a[href$="/players/${target!.publicId}"]`);
                assert.equal(await privateLink.innerText(), '비공개 사용자');
                assert.equal(await dialog.locator('dl').innerText(), metrics);
                assert.equal(
                    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
                    false
                );

                // 열린 상세를 유지한 채 다른 세트의 history로 이동하면 이전 선택을 남기지 않는다.
                await page.goBack();
                await page.waitForURL((url) => url.searchParams.get('game') === games[0]!.id);
                await page.locator('#game-heading').getByText('1세트', { exact: true }).waitFor();
                await dialog.waitFor({ state: 'hidden' });
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
        await sessionContext(context, f);
        await context.addInitScript((mode) => localStorage.setItem('theme-mode', mode), theme);
        const page = await context.newPage();
        page.setDefaultTimeout(10_000);
        await page.goto(f.url + f.path);
        await page.locator('#game-heading').getByText('2세트', { exact: true }).waitFor();
        const target = page
            .locator('td')
            .filter({ has: page.locator(`a[href$="/players/${f.identities[0]!.userId}"]`) })
            .getByRole('button', { name: /^상세/ });
        await target.press('Enter');
        const dialog = page.getByRole('dialog', { name: '선수 상세', exact: true });
        const heading = dialog.getByRole('heading', {
            level: 3,
            name: f.people[0]!.displayName,
            exact: true
        });
        await heading.waitFor();
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        assert.equal(await target.evaluate((node) => node === document.activeElement), true);
        await page.keyboard.press('Enter');
        await heading.waitFor();
        assert.equal(await dialog.evaluate((node) => node.matches(':modal')), true);
        assert.equal(await dialog.getByRole('button', { name: '닫기', exact: true }).isVisible(), true);
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        assert.equal(await target.evaluate((node) => node === document.activeElement), true);
    });
