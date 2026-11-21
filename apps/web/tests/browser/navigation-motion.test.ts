import assert from 'node:assert/strict';
import test from 'node:test';
import { HTTP_IDS } from '../api/support/http.ts';
import { prepareHttpAuctionFixture } from '../api/support/http-auction-fixtures.ts';
import { assertNoOverflow, createBrowserFixture } from './support/browser.ts';

for (const width of [1440, 390]) {
    test(
        `느린 단계 이동과 뒤로 가기에서 작업판·서버 메뉴를 조작할 수 있다: ${width}px`,
        { timeout: 30_000 },
        async (t) => {
            const { page, context, ...fixture } = await createBrowserFixture(t, {
                width,
                userId: HTTP_IDS.manager
            });
            const { path, scrim } = await prepareHttpAuctionFixture(fixture);
            const overview = path.slice(0, path.lastIndexOf('/'));
            const home = `/g/${HTTP_IDS.guild}`;
            await context.addInitScript(
                (mode) => localStorage.setItem('theme-mode', mode),
                width === 390 ? 'primary' : 'dark'
            );
            await page.goto(fixture.url + overview, { waitUntil: 'networkidle' });
            const phase = page.getByRole('navigation', { name: '내전 단계' });
            const heading = page.getByRole('heading', { name: scrim.title, exact: true });
            const before = await heading.boundingBox();
            const requested = Promise.withResolvers<void>();
            const release = Promise.withResolvers<void>();
            await context.route(
                (url) => url.pathname === path + '/__data.json',
                async (route) => {
                    requested.resolve();
                    await release.promise;
                    await route.fallback();
                },
                { times: 1 }
            );
            const loading = phase.getByRole('link', { name: /팀 편성/ }).press('Enter');
            try {
                await requested.promise;
                assert.equal(await phase.locator('[aria-current="page"] strong').innerText(), '모집·참가자');
                assert.equal(
                    await page.getByRole('table', { name: '참가자', exact: true }).isVisible(),
                    true
                );
            } finally {
                release.resolve();
            }
            await loading;
            await page.waitForURL(fixture.url + path);
            await phase.locator('[aria-current="page"]').getByText('팀 편성', { exact: true }).waitFor();
            assert.equal(await phase.locator('[aria-current="page"] strong').innerText(), '팀 편성');
            assert.equal((await heading.boundingBox())?.y, before?.y);
            await page.goBack();
            await page.waitForURL(fixture.url + overview);
            await assertNoOverflow(page, '이전 단계');

            const navigate = async (label: string) => {
                if (width === 390)
                    await page.getByRole('button', { name: '메뉴', exact: true }).press('Enter');
                await page
                    .getByRole('navigation', { name: '서버 메뉴' })
                    .getByRole('link', { name: label, exact: true })
                    .press('Enter');
            };
            await navigate('서버 홈');
            await page.waitForURL(fixture.url + home);
            await page.emulateMedia({ reducedMotion: 'reduce' });
            await navigate('내전');
            await page.waitForURL(fixture.url + home + '/scrims');
            assert.equal(await page.getByRole('dialog', { name: '메뉴' }).count(), 0);
            await page.goBack();
            await page.waitForURL(fixture.url + home);
            await page.getByRole('heading', { level: 1, name: 'HTTP 검증 서버' }).waitFor();
            await page.waitForLoadState('networkidle');
            await assertNoOverflow(page, '서버 메뉴 뒤로 가기');
            assert.deepEqual(fixture.errors, []);
        }
    );
}
