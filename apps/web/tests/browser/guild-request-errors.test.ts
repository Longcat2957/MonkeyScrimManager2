import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { webRequestErrors } from '../../src/lib/server/db/schema.ts';
import { HTTP_IDS } from '../api/support/http.ts';
import { assertNoOverflow, createBrowserFixture } from './support/browser.ts';

test('오류 로그는 실제 요청 ID를 복사하고 페이지 이동과 조회 실패 복구를 지원한다', async (t) => {
    const f = await createBrowserFixture(t, { width: 1360, userId: HTTP_IDS.manager });
    const { page } = f;
    const path = '/g/' + HTTP_IDS.guild + '/admin';
    const member = await f.session(HTTP_IDS.member);
    const base = new URL(f.url).origin;
    await f.context.grantPermissions(['clipboard-write', 'clipboard-read'], { origin: base });
    await page.goto(base + path + '?tab=audit');
    await page.getByRole('button', { name: '오류 로그', exact: true }).click();
    const panel = page.getByRole('region', { name: '오류 로그', exact: true });
    await panel.getByText('최근 30일간 기록된 요청 오류가 없어요').waitFor();

    const forbidden = await f.request(path + '?tab=errors', { headers: { cookie: member.cookie } });
    assert.equal(forbidden.status, 403);
    const id = forbidden.headers.get('x-request-id')!;
    const older = new Date(Date.now() - 60_000);
    await f.db.insert(webRequestErrors).values(
        Array.from({ length: 20 }, () => ({
            requestId: randomUUID(),
            occurredAt: older,
            guildId: HTTP_IDS.guild,
            method: 'POST',
            status: 503,
            route: '/g/[guildId]/scrims/[scrimId]/auction/live'
        }))
    );

    for (const [width, theme] of [
        [1360, 'dark'],
        [390, 'primary']
    ] as const) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate((mode) => localStorage.setItem('theme-mode', mode), theme);
        await page.goto(base + path + '?tab=errors');
        assert.equal(await page.locator('html').getAttribute('data-mode'), theme);
        const first = panel.locator('summary').first();
        await first.waitFor();
        assert.equal(await panel.locator('summary').count(), 20);
        assert.match(await first.innerText(), /HTTP 403/);
        await first.press('Enter');
        await panel.getByText(id, { exact: true }).waitFor();
        const copy = panel.getByRole('button', { name: '요청 ID 복사' });
        await copy.press('Enter');
        await page.getByText('요청 ID를 복사했어요', { exact: true }).waitFor();
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), id);
        await assertNoOverflow(page, '오류 로그 상세 ' + width);
        await panel.getByRole('button', { name: '다음 쪽' }).click();
        await page.waitForURL((url) => url.searchParams.get('page') === '2');
        assert.equal(await panel.locator('summary').count(), 1);
        assert.equal(await panel.getByText(id, { exact: true }).count(), 0);
    }

    await f.pool.query('alter table web_request_errors rename to unavailable_errors');
    try {
        await page.reload();
        await panel.getByText('오류 로그를 불러오지 못했어요').waitFor();
    } finally {
        await f.pool.query('alter table unavailable_errors rename to web_request_errors');
    }
    await panel.getByRole('button', { name: '다시 시도' }).click();
    await panel.locator('summary').waitFor();
    assert.deepEqual(f.errors, []);
});
