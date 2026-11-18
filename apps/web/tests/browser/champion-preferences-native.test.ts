import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import * as schema from '../../src/lib/server/db/schema.ts';
import { createHttpChampionPreferencesFixture } from '../api/support/http-champion-preferences-fixtures.ts';
import { HTTP_IDS } from '../api/support/http.ts';
import { appErrors, sessionContext } from './support/browser.ts';

test('native400 중복 챔피언 입력은 한 행으로 복구되고 저장된 선호를 유지한다', async (t) => {
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    const f = await createHttpChampionPreferencesFixture(t);
    const saved = await f.champions('top', [266], f.participant.cookie);
    assert.equal(saved.response.status, 200);
    const stored = async () =>
        (await f.db.select().from(schema.userChampionPreferences))
            .filter((row) => row.userId === HTTP_IDS.member)
            .map(({ position, championId, ordinal, createdAt }) => ({
                position,
                championId,
                ordinal,
                createdAt
            }));
    const before = await stored();
    assert.deepEqual(
        before.map(({ championId, ordinal }) => ({ championId, ordinal })),
        [{ championId: 266, ordinal: 1 }]
    );

    const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: 'reduce'
    });
    await sessionContext(context, f, f.participant.cookie);
    await context.addInitScript(() => localStorage.setItem('theme-mode', 'primary'));
    const page = await context.newPage();
    const errors = appErrors(page);
    await page.goto(f.url + '/me');
    const form = page.getByRole('form', { name: '선호 챔피언 저장', exact: true });
    const selected = page.getByRole('list', { name: '탑 선택한 챔피언', exact: true });
    await form.getByRole('button', { name: '아리 추가', exact: true }).click();
    await page.waitForFunction(
        () => document.querySelectorAll('ol[aria-label="탑 선택한 챔피언"] li[data-champion-id]').length === 2
    );
    assert.deepEqual(errors, []);

    const navigation = page.waitForNavigation({ waitUntil: 'load' });
    await form.evaluate((node) => {
        // 잘못된 반복 필드를 브라우저가 실제 native POST로 전송해 비향상 폼의 오류 복구를 검증한다.
        node.querySelectorAll('input[name="championIds"]').forEach((input) => input.remove());
        for (let count = 0; count < 2; count++) {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'championIds';
            input.value = '103';
            node.append(input);
        }
        HTMLFormElement.prototype.submit.call(node);
    });
    const response = await navigation;
    assert.ok(response);
    assert.equal(response.status(), 400);
    const html = await response.text();
    assert.equal((html.match(/data-champion-id="103"/g) ?? []).length, 1);
    await selected.getByRole('button', { name: '아리 제거', exact: true }).waitFor();
    assert.equal(await selected.locator('li[data-champion-id="103"]').count(), 1);
    assert.equal(await selected.getByRole('button', { name: '아리 제거', exact: true }).count(), 1);
    assert.deepEqual(await stored(), before);
    // 서버가 거절한 뒤에도 실제 클라이언트 조작을 완료할 수 있어야 한다.
    await selected.getByRole('button', { name: '아리 제거', exact: true }).click();
    await page.waitForFunction(
        () => document.querySelectorAll('ol[aria-label="탑 선택한 챔피언"] li[data-champion-id]').length === 0
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(await stored(), before);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await context.close();
});
