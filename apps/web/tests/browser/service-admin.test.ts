import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import type { Locator, Page } from 'playwright';
import * as schema from '../../src/lib/server/db/schema.ts';
import { assertAction, HTTP_IDS } from '../api/support/http.ts';
import { createBrowserFixture } from './support/browser.ts';

type Fixture = Awaited<ReturnType<typeof createBrowserFixture>>;
// 동명이인도 사용자 ID로 회수 대상을 구분하고 긴 현재 이름을 모두 읽을 수 있어야 한다.
const operatorName = 'W'.repeat(32);
const targetName = operatorName;
const unknownUserId = '970000000000000099';
const captures: Record<string, unknown>[] = [];

async function capture(f: Fixture, state: string) {
    const { page } = f;
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const directory = process.env.MSM2_SERVICE_ADMIN_CAPTURE_DIR;
    if (!directory) return;
    await page.evaluate(async () => {
        // 전체 페이지에서도 고정 헤더와 건너뛰기 링크가 실제 화면 위치를 유지하게 한다.
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
        fullPage: state !== 'self-revoke-confirm',
        animations: 'disabled'
    });
    const url = new URL(page.url());
    const audit = await f.db.select({ id: schema.serviceAdminEvents.id }).from(schema.serviceAdminEvents);
    captures.push({
        file,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        viewport,
        theme,
        state,
        url: page.url(),
        path: url.pathname + url.search,
        auditIds: audit.map((entry) => entry.id),
        source: '실제 SSR·격리 DB·서비스 운영자 세션, 외부 요청은 fixture로 제한'
    });
    await writeFile(resolve(directory, 'captures.json'), JSON.stringify(captures, null, 4) + '\n');
}

async function confirmation(page: Page, title: string, run: () => Promise<unknown>) {
    await run();
    const dialog = page.getByRole('dialog', { name: title, exact: true });
    // STDF의 고정 팝업은 바깥 래퍼의 크기가 0일 수 있어 실제 버튼을 기다린다.
    const confirm = dialog.getByRole('button', { name: '확인', exact: true });
    await confirm.waitFor();
    assert.equal(await confirm.count(), 1);
    assert.equal(await dialog.getByRole('button', { name: '취소', exact: true }).count(), 1);
    return { dialog, confirm };
}

async function save(page: Page, confirm: Locator, status = 200) {
    const response = page.waitForResponse((reply) => reply.url().endsWith('?/setServiceAdmin'));
    await confirm.press('Enter');
    assert.equal((await response).status(), status);
}

async function confirmationTextFits(page: Page, dialog: Locator, width: number, theme: string) {
    const bounds = await dialog.locator('#confirmation-content').evaluate((node) => {
        const box = node.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(node);
        const overflowing = [...range.getClientRects()]
            .filter((rect) => rect.left < box.left - 1 || rect.right > box.right + 1)
            .map((rect) => ({ left: rect.left, right: rect.right }));
        return { left: box.left, right: box.right, overflowing };
    });
    if (bounds.overflowing.length) {
        await page.screenshot({
            path: `/tmp/msm2-service-admin-confirm-overflow-${width}-${theme}.png`,
            animations: 'disabled'
        });
    }
    assert.equal(
        bounds.overflowing.length,
        0,
        `긴 이름과 Discord ID가 확인창 안에서 보여야 한다: ${JSON.stringify(bounds)}`
    );
}

async function grant(page: Page, input: Locator, userId: string) {
    await input.fill(userId);
    return confirmation(page, '서비스 운영자 지정', () =>
        page.getByRole('button', { name: '운영자 지정', exact: true }).press('Enter')
    );
}

async function history(page: Page, expected: number) {
    const section = page.getByRole('region', { name: '운영자 변경 이력', exact: true });
    const entries = section.getByRole('listitem');
    await page.waitForFunction(
        ({ label, count }) => {
            const heading = [...document.querySelectorAll('h2')].find(
                (node) => node.textContent?.trim() === label
            );
            return heading?.closest('section')?.querySelectorAll('ol > li').length === count;
        },
        { label: '운영자 변경 이력', count: expected }
    );
    assert.equal(await entries.count(), expected);
    const times = await entries
        .locator('time')
        .evaluateAll((nodes) => nodes.map((node) => Date.parse(node.getAttribute('datetime') ?? '')));
    assert.equal(times.length, expected);
    assert.ok(times.every(Number.isFinite));
    assert.deepEqual(
        times,
        [...times].sort((left, right) => right - left)
    );
    assert.equal(await entries.getByRole('button').count(), 0);
    return { section, entries };
}

for (const width of [1440, 390])
    for (const theme of ['primary', 'dark'])
        test(
            `서비스 운영자 지정·회수·입력 복구와 마지막 운영자 보호를 확인한다: ${width}px ${theme}`,
            { timeout: 90_000 },
            async (t) => {
                let releaseGrant = () => {};
                t.after(() => releaseGrant());
                const f = await createBrowserFixture(t, { width, userId: HTTP_IDS.serviceAdmin });
                const { page } = f;
                await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
                await page.emulateMedia({ reducedMotion: 'reduce' });
                await f.context.addInitScript((mode) => {
                    try {
                        localStorage.setItem('theme-mode', mode);
                    } catch {}
                }, theme);
                // 첫 SSR의 헤더 동기화가 끝난 뒤 현재 전역 표시 이름을 설정한다.
                await page.goto(f.url + '/backoffice');
                await f.db
                    .update(schema.users)
                    .set({ globalName: operatorName })
                    .where(eq(schema.users.id, HTTP_IDS.serviceAdmin));
                await f.db
                    .update(schema.users)
                    .set({ globalName: targetName })
                    .where(eq(schema.users.id, HTTP_IDS.member));
                await page.reload();
                const operators = page.getByRole('region', { name: '서비스 운영자', exact: true });
                const input = page.getByRole('textbox', { name: 'Discord 사용자 ID', exact: true });
                await input.waitFor();
                await page.locator('section[aria-labelledby="service-status"] time').waitFor();
                await page.waitForFunction((mode) => document.documentElement.dataset.mode === mode, theme);
                // 명시적으로 포커스를 받아 라벨 연결과 초기 클라이언트 동작 준비를 확인한다.
                await input.focus();
                assert.equal(await input.evaluate((node) => node === document.activeElement), true);
                assert.equal(await page.getByRole('button', { name: '다시 확인', exact: true }).count(), 1);
                assert.equal(await page.getByRole('button', { name: '운영자 지정', exact: true }).count(), 1);
                assert.equal(await page.getByRole('tab').count(), 0);
                const selfRevoke = operators.getByRole('button', {
                    name: `권한 해제 ${operatorName} (${HTTP_IDS.serviceAdmin})`,
                    exact: true
                });
                assert.equal(await selfRevoke.isDisabled(), true);
                assert.match(await operators.innerText(), /마지막/);
                await capture(f, 'single-admin');

                // 비활성 조작을 우회한 요청도 마지막 운영자를 잃거나 이력을 만들지 않아야 한다.
                const manager = await f.session(HTTP_IDS.serviceAdmin);
                assertAction(
                    await f.action(
                        '/backoffice',
                        'setServiceAdmin',
                        {
                            userId: HTTP_IDS.serviceAdmin,
                            enabled: 'false'
                        },
                        manager.cookie
                    ),
                    409
                );
                assert.equal((await f.db.select().from(schema.serviceAdminEvents)).length, 0);

                const missing = await grant(page, input, unknownUserId);
                await save(page, missing.confirm, 404);
                const error = page
                    .getByRole('alert')
                    .filter({ hasText: '서비스에 연결된 사용자를 찾을 수 없어요' });
                await error.waitFor();
                assert.equal(await input.inputValue(), unknownUserId);
                assert.equal(await input.isEnabled(), true);
                assert.equal(
                    await page.getByRole('button', { name: '운영자 지정', exact: true }).isEnabled(),
                    true
                );
                await capture(f, 'unknown-user-error');

                let posts = 0;
                page.on('request', (request) => {
                    if (request.method() === 'POST' && request.url().endsWith('?/setServiceAdmin')) posts++;
                });
                let arrivedGrant!: () => void;
                const arrived = new Promise<void>((done) => {
                    arrivedGrant = done;
                });
                const held = new Promise<void>((done) => {
                    releaseGrant = done;
                });
                let hold = true;
                await f.context.route('**/*', async (route) => {
                    if (hold && route.request().url().endsWith('?/setServiceAdmin')) {
                        hold = false;
                        arrivedGrant();
                        await held;
                    }
                    await route.fallback();
                });
                const adding = await grant(page, input, HTTP_IDS.member);
                const added = page.waitForResponse((reply) => reply.url().endsWith('?/setServiceAdmin'));
                await adding.confirm.press('Enter');
                await arrived;
                assert.equal(await input.isDisabled(), true);
                assert.equal(
                    await page.getByRole('button', { name: '운영자 지정', exact: true }).isDisabled(),
                    true
                );
                await input.evaluate((node) => (node as HTMLInputElement).form?.requestSubmit());
                releaseGrant();
                assert.equal((await added).status(), 200);
                const revokeTarget = operators.getByRole('button', {
                    name: `권한 해제 ${targetName} (${HTTP_IDS.member})`,
                    exact: true
                });
                await revokeTarget.waitFor();
                assert.equal(posts, 1);
                assert.equal(await input.inputValue(), '');
                assert.equal(await selfRevoke.isEnabled(), true);
                assert.equal(await operators.getByRole('button', { name: /^권한 해제 / }).count(), 2);
                assert.equal(await selfRevoke.count(), 1);
                assert.equal(await revokeTarget.count(), 1);
                assert.equal(
                    await operators
                        .getByRole('form', {
                            name: `${operatorName} (${HTTP_IDS.serviceAdmin}) 권한 관리`,
                            exact: true
                        })
                        .count(),
                    1
                );
                assert.equal(
                    await operators
                        .getByRole('form', {
                            name: `${targetName} (${HTTP_IDS.member}) 권한 관리`,
                            exact: true
                        })
                        .count(),
                    1
                );
                await history(page, 1);

                const cancelled = await confirmation(page, '서비스 운영자 권한 해제', () =>
                    revokeTarget.press('Enter')
                );
                assert.match(await cancelled.dialog.innerText(), new RegExp(HTTP_IDS.member));
                await confirmationTextFits(page, cancelled.dialog, width, theme);
                await cancelled.dialog.getByRole('button', { name: '취소', exact: true }).press('Enter');
                await revokeTarget.waitFor();
                assert.equal((await f.db.select().from(schema.serviceAdminEvents)).length, 1);
                const removing = await confirmation(page, '서비스 운영자 권한 해제', () =>
                    revokeTarget.press('Enter')
                );
                await save(page, removing.confirm);
                await revokeTarget.waitFor({ state: 'hidden' });
                await page.waitForFunction(
                    (node) => node === document.activeElement,
                    await input.elementHandle()
                );
                assert.equal(await selfRevoke.isDisabled(), true);
                const revoked = await history(page, 2);
                assert.match(await revoked.entries.first().innerText(), /해제/);
                const readding = await grant(page, input, HTTP_IDS.member);
                await save(page, readding.confirm);
                await revokeTarget.waitFor();
                const changed = await history(page, 3);
                assert.match(await changed.entries.nth(0).innerText(), /지정/);
                assert.match(await changed.entries.nth(1).innerText(), /해제/);
                assert.match(await changed.entries.nth(2).innerText(), /지정/);
                assert.ok(
                    (await changed.entries.getByRole('heading', { level: 3 }).allTextContents()).every(
                        (heading) => heading.includes(`(${HTTP_IDS.member})`)
                    )
                );
                assert.equal(
                    await changed.entries
                        .getByText(`담당: ${operatorName} (${HTTP_IDS.serviceAdmin})`, { exact: true })
                        .count(),
                    3
                );
                assert.equal(
                    await operators
                        .getByRole('button', {
                            name: `권한 해제 ${targetName} (${HTTP_IDS.member})`,
                            exact: true
                        })
                        .count(),
                    1
                );
                await capture(f, 'grant-revoke-history');

                const self = await confirmation(page, '서비스 운영자 권한 해제', () =>
                    selfRevoke.press('Enter')
                );
                assert.match(await self.dialog.innerText(), /내 서비스 운영 권한/);
                await capture(f, 'self-revoke-confirm');
                await save(page, self.confirm);
                await page.waitForURL((url) => url.pathname === '/me');
                await page.getByRole('heading', { level: 1, name: '내 정보', exact: true }).waitFor();
                const people = await f.db.select().from(schema.users);
                assert.equal(people.find((user) => user.id === HTTP_IDS.serviceAdmin)!.isServiceAdmin, false);
                assert.equal(people.find((user) => user.id === HTTP_IDS.member)!.isServiceAdmin, true);
                const events = await f.db.select().from(schema.serviceAdminEvents);
                assert.equal(events.length, 4);
                assert.ok(
                    events.every(
                        (event) => event.source === 'web' && event.actorUserId === HTTP_IDS.serviceAdmin
                    )
                );
                assert.equal(posts, 4);
                assert.equal(
                    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
                    false
                );
                assert.deepEqual(f.errors, []);
            }
        );
