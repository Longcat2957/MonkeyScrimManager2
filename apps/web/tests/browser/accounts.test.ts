import assert from 'node:assert/strict';
import test from 'node:test';
import * as schema from '../../src/lib/server/db/schema.ts';
import { HTTP_IDS } from '../api/support/http.ts';
import { createBrowserFixture } from './support/browser.ts';

for (const width of [1440, 360]) {
    test(`계정 조회 결과와 실제 연결 대상이 일치한다: ${width}px`, { timeout: 60_000 }, async (t) => {
        let releaseLookup!: () => void;
        let lookupArrived!: () => void;
        const arrived = new Promise<void>((resolve) => {
            lookupArrived = resolve;
        });
        const held = new Promise<void>((resolve) => {
            releaseLookup = resolve;
        });
        t.after(releaseLookup);
        const fixture = await createBrowserFixture(t, {
            width,
            userId: HTTP_IDS.manager
        });
        const { context, page, errors } = fixture;
        let lookupCount = 0;
        let linkCount = 0;
        page.on('request', (request) => {
            if (request.url().endsWith('?/lookup')) lookupCount++;
            if (request.url().endsWith('?/link')) linkCount++;
        });
        // 조회가 끝나기 전 추가 제출과 입력 변경을 명시적인 장벽으로 재현한다.
        await context.route('**/*', async (route) => {
            if (route.request().url().endsWith('?/lookup')) {
                lookupArrived();
                await held;
            }
            await route.fallback();
        });
        await page.goto(fixture.url + '/g/' + HTTP_IDS.guild + '/admin');
        await page.getByRole('button', { name: 'Riot 계정 관리, HTTP 사용자' }).first().click();
        const accounts = page.getByRole('dialog', { name: 'Riot 계정 관리' });
        const input = accounts.getByPlaceholder('이름#태그');
        await input.fill('HttpPlayer#KR1');
        await accounts.getByRole('button', { name: '조회', exact: true }).click();
        await arrived;
        assert.equal(await input.isDisabled(), true);
        await accounts.locator('form').evaluate((form) => (form as HTMLFormElement).requestSubmit());
        // 비활성 입력을 스크립트가 바꾸더라도 연결은 확인 화면의 조회 결과로 고정되어야 한다.
        await input.evaluate((node) => {
            (node as HTMLInputElement).value = 'SecondPlayer#KR1';
            node.dispatchEvent(new Event('input', { bubbles: true }));
        });
        releaseLookup();
        await accounts.getByRole('button', { name: '연결', exact: true }).waitFor();
        assert.match(await accounts.innerText(), /HttpPlayer/);
        assert.doesNotMatch(await accounts.innerText(), /SecondPlayer/);
        await accounts.getByRole('button', { name: '연결', exact: true }).click();
        await accounts.getByRole('button', { name: '조회', exact: true }).waitFor();
        const identities = await fixture.db.select().from(schema.riotAccounts);
        const links = await fixture.db.select().from(schema.guildRiotAccounts);
        assert.deepEqual(
            identities.map((account) => account.gameName),
            ['HttpPlayer']
        );
        assert.equal(links.length, 1);
        assert.equal(links[0]!.riotAccountId, identities[0]!.id);
        assert.equal(links[0]!.guildId, HTTP_IDS.guild);
        assert.equal(lookupCount, 1);
        assert.equal(linkCount, 1);
        assert.deepEqual(errors, []);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    });
}
