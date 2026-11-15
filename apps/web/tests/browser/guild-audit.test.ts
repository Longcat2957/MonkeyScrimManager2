import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import type { Locator, Page } from 'playwright';
import * as schema from '../../src/lib/server/db/schema.ts';
import { HTTP_IDS } from '../api/support/http.ts';
import { createBrowserFixture } from './support/browser.ts';

const adminPath = '/g/' + HTTP_IDS.guild + '/admin';
const managerName = '브라우저 관리자';
const memberName = '브라우저 대상자';
const longName = '줄바꿈없이이어지는아주긴관리담당자이름'.repeat(4);
const captures: Record<string, unknown>[] = [];

async function capture(page: Page, state: string) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const directory = process.env.MSM2_AUDIT_CAPTURE_DIR;
    if (!directory) return;
    await page.evaluate(async () => {
        // 전체 화면 캡처에서도 고정 헤더·건너뛰기 링크가 실제 화면 위치를 유지하게 한다.
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
        fullPage: true,
        animations: 'disabled'
    });
    const url = new URL(page.url());
    captures.push({
        file,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        viewport,
        theme,
        state,
        path: url.pathname + url.search,
        source: '실제 SSR·격리 DB·관리자 세션, 외부 요청은 fixture로 제한'
    });
    await writeFile(resolve(directory, 'captures.json'), JSON.stringify(captures, null, 4) + '\n');
}

async function actionResponse(page: Page, action: string, run: () => Promise<unknown>) {
    const response = page.waitForResponse((reply) => reply.url().endsWith('?/' + action));
    await run();
    assert.equal((await response).status(), 200);
}

async function checkAdminNavigation(page: Page, mobile: boolean) {
    // SSR 버튼이 보이더라도 클라이언트 조작을 연결하기 전에는 키 입력을 보내지 않는다.
    await page
        .getByRole('group', { name: '관리 항목', exact: true })
        .locator('button[aria-pressed="true"]')
        .waitFor();
    const menu = page.getByRole('dialog', { name: '메뉴', exact: true });
    if (mobile) {
        await page.getByRole('button', { name: '메뉴', exact: true }).press('Enter');
    }
    const navigation = (mobile ? menu : page).getByRole('navigation', { name: '서버 메뉴', exact: true });
    await navigation.waitFor();
    assert.equal(await navigation.getByRole('link', { name: '관리', exact: true }).count(), 0);
    const current = navigation.locator('[aria-current="page"]');
    assert.equal((await current.innerText()).trim(), '관리');
    assert.equal(await current.evaluate((element) => element.matches('a, button, [tabindex]')), false);
    if (mobile) {
        await page.keyboard.press('Escape');
        await menu.waitFor({ state: 'hidden' });
    }
}

async function selectView(page: Page, label: string, key: string) {
    const group = page.getByRole('group', { name: '관리 항목', exact: true });
    const button = group.getByRole('button', { name: label, exact: true });
    await button.focus();
    await button.press(key);
    const expectedTab = label === '멤버' ? null : label === 'Discord 연동' ? 'discord' : 'audit';
    await page.waitForURL((url) => url.searchParams.get('tab') === expectedTab);
    await page.waitForFunction(
        (element) => element?.getAttribute('aria-pressed') === 'true',
        await button.elementHandle()
    );
    assert.equal(await group.locator('button[aria-pressed="true"]').count(), 1);
    for (const name of ['멤버', 'Discord 연동', '변경 이력'])
        assert.equal(await page.getByRole('button', { name, exact: true }).count(), 1);
    assert.equal(await page.getByRole('link', { name: '관리', exact: true }).count(), 0);
    assert.equal(await page.getByRole('tab').count(), 0);
    assert.equal(await page.getByRole('heading', { level: 1, name: '서버 관리', exact: true }).count(), 1);
}

async function linkAccount(page: Page, accounts: Locator, riotId: string) {
    await accounts.getByRole('textbox', { name: '연결할 Riot ID', exact: true }).fill(riotId);
    await actionResponse(page, 'lookup', () =>
        accounts.getByRole('button', { name: '조회', exact: true }).press('Enter')
    );
    const link = accounts.getByRole('button', { name: '연결', exact: true });
    await link.waitFor();
    await actionResponse(page, 'link', () => link.press('Enter'));
    await accounts.getByRole('button', { name: '해제 ' + riotId, exact: true }).waitFor();
    await accounts.getByRole('button', { name: '조회', exact: true }).waitFor();
}

async function auditEntries(page: Page, count: number) {
    const section = page.getByRole('region', { name: '변경 이력', exact: true });
    const entries = section.locator('ol > li');
    await page.waitForFunction(
        (expected) =>
            document.querySelectorAll('section[aria-labelledby="audit"] ol > li').length === expected,
        count
    );
    assert.equal(await section.getByRole('list').count(), 1);
    assert.equal(await entries.count(), count);
    assert.equal(await entries.getByRole('button').count(), 0);
    assert.equal(await entries.getByRole('link').count(), 0);
    const times = await entries
        .locator('time')
        .evaluateAll((nodes) => nodes.map((node) => Date.parse(node.getAttribute('datetime') ?? '')));
    assert.equal(times.length, count);
    assert.ok(times.every(Number.isFinite));
    assert.deepEqual(
        times,
        [...times].sort((left, right) => right - left)
    );
    return { section, entries, times };
}

for (const width of [1440, 390])
    for (const theme of ['primary', 'dark'])
        test(
            `관리 변경을 실제로 저장하고 이력·쪽 이동·빈 쪽을 키보드로 확인한다: ${width}px ${theme}`,
            { timeout: 90_000 },
            async (t) => {
                const f = await createBrowserFixture(t, { width, userId: HTTP_IDS.manager });
                const { page } = f;
                await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
                await page.emulateMedia({ reducedMotion: 'reduce' });
                await f.context.addInitScript((mode) => {
                    try {
                        localStorage.setItem('theme-mode', mode);
                    } catch {}
                }, theme);
                await f.db
                    .update(schema.users)
                    .set({ username: managerName })
                    .where(eq(schema.users.id, HTTP_IDS.manager));
                await f.db
                    .update(schema.users)
                    .set({ username: memberName })
                    .where(eq(schema.users.id, HTTP_IDS.member));

                await page.goto(f.url + adminPath + '?tab=audit');
                await page.getByText('아직 기록된 관리 변경이 없어요', { exact: true }).waitFor();
                assert.equal(await page.locator('html').getAttribute('data-mode'), theme);
                await checkAdminNavigation(page, width === 390);
                assert.equal(
                    await page.getByRole('navigation', { name: '변경 이력 쪽 이동', exact: true }).count(),
                    0
                );
                await capture(page, 'empty');

                await selectView(page, '멤버', 'Space');
                await page
                    .getByRole('button', { name: 'Riot 계정 관리, ' + memberName, exact: true })
                    .press('Enter');
                const accounts = page.getByRole('dialog', { name: 'Riot 계정 관리', exact: true });
                await linkAccount(page, accounts, 'HttpPlayer#KR1');
                await linkAccount(page, accounts, 'SecondPlayer#KR1');
                await actionResponse(page, 'primary', () =>
                    accounts
                        .getByRole('button', { name: '대표로 SecondPlayer#KR1', exact: true })
                        .press('Enter')
                );
                await accounts.getByRole('button', { name: '대표로 HttpPlayer#KR1', exact: true }).waitFor();
                await accounts
                    .getByRole('button', { name: '해제 SecondPlayer#KR1', exact: true })
                    .press('Enter');
                const unlink = page.getByRole('dialog', { name: '연결 해제', exact: true });
                await actionResponse(page, 'unlink', () =>
                    unlink.getByRole('button', { name: '확인', exact: true }).press('Enter')
                );
                await accounts
                    .getByRole('button', { name: '해제 SecondPlayer#KR1', exact: true })
                    .waitFor({ state: 'hidden' });
                await accounts.getByRole('button', { name: '닫기', exact: true }).press('Enter');
                await accounts.waitFor({ state: 'hidden' });

                await selectView(page, 'Discord 연동', 'Enter');
                await page
                    .getByRole('button', { name: '모집 채널 바꾸기, 현재 설정 안 함', exact: true })
                    .press('Enter');
                const channels = page.getByRole('dialog', { name: '모집 채널', exact: true });
                await actionResponse(page, 'discord', () =>
                    channels.getByRole('button', { name: '#모집', exact: true }).press('Enter')
                );
                await page
                    .getByRole('button', { name: '모집 채널 바꾸기, 현재 #모집', exact: true })
                    .waitFor();

                let auditPosts = 0;
                page.on('request', (request) => {
                    if (request.method() === 'POST') auditPosts++;
                });
                await selectView(page, '변경 이력', 'Space');
                const recent = await auditEntries(page, 5);
                // Discord 연동 조회가 사용자 이름을 upstream의 현재 이름으로 갱신한다.
                const currentName = 'HTTP 사용자';
                assert.deepEqual(
                    await recent.entries
                        .getByRole('heading', { level: 3 })
                        .allTextContents()
                        .then((items) => items.map((item) => item.trim())),
                    [
                        'Discord 연동 변경',
                        currentName + ' · Riot 계정 연결 해제',
                        currentName + ' · 대표 계정 변경',
                        currentName + ' · Riot 계정 연결',
                        currentName + ' · Riot 계정 연결'
                    ]
                );
                assert.match(
                    await recent.entries.nth(0).innerText(),
                    /모집 채널[\s\S]*설정 안 함[\s\S]*모집/
                );
                assert.match(
                    await recent.entries.nth(1).innerText(),
                    /SecondPlayer#KR1[\s\S]*새 대표 계정: HttpPlayer#KR1/
                );
                assert.match(
                    await recent.entries.nth(2).innerText(),
                    /변경 전[\s\S]*HttpPlayer#KR1[\s\S]*변경 후[\s\S]*SecondPlayer#KR1/
                );
                assert.match(await recent.entries.nth(3).innerText(), /SecondPlayer#KR1/);
                assert.match(await recent.entries.nth(4).innerText(), /HttpPlayer#KR1/);
                assert.equal(
                    await recent.entries.getByText('담당: ' + currentName, { exact: true }).count(),
                    5
                );
                await capture(page, 'saved-changes');

                // 반복 조작 대신 과거 기록만 추가해 20건 경계와 현재 사용자 이름의 긴 표시를 검증한다.
                await f.db
                    .update(schema.users)
                    .set({ username: longName })
                    .where(eq(schema.users.id, HTTP_IDS.outsider));
                const older = Date.now() - 86_400_000;
                await f.db.insert(schema.guildAuditEntries).values(
                    Array.from({ length: 20 }, (_, index) => ({
                        guildId: HTTP_IDS.guild,
                        kind: 'discord_setting_changed' as const,
                        actorUserId: index === 19 ? HTTP_IDS.outsider : HTTP_IDS.manager,
                        settingKey: 'entryChannelId' as const,
                        nextSettingId: HTTP_IDS.channel,
                        nextSettingName: `과거 엔트리 채널 ${index + 1}`,
                        createdAt: new Date(older + index * 60_000)
                    }))
                );
                await page.reload();
                const first = await auditEntries(page, 20);
                await first.entries.getByText('담당: ' + longName, { exact: true }).waitFor();
                const firstTimes = first.times;
                const navigation = page.getByRole('navigation', { name: '변경 이력 쪽 이동', exact: true });
                assert.equal(await navigation.count(), 1);
                assert.equal(
                    await navigation
                        .getByRole('button', { name: '1', exact: true })
                        .getAttribute('aria-current'),
                    'page'
                );
                assert.equal(await navigation.getByRole('button', { name: '2', exact: true }).count(), 1);
                await capture(page, 'long-name-first-page');

                await navigation.getByRole('button', { name: '2', exact: true }).press('Enter');
                await page.waitForURL(
                    (url) => url.searchParams.get('tab') === 'audit' && url.searchParams.get('page') === '2'
                );
                const second = await auditEntries(page, 5);
                assert.ok(second.times.every((time) => time < firstTimes.at(-1)!));
                assert.equal(
                    await navigation
                        .getByRole('button', { name: '2', exact: true })
                        .getAttribute('aria-current'),
                    'page'
                );
                await capture(page, 'second-page');

                await page.goto(f.url + adminPath + '?tab=audit&page=99');
                await page.getByText('이 쪽에는 변경 이력이 없어요', { exact: true }).waitFor();
                assert.equal(
                    await page.getByText('아직 기록된 관리 변경이 없어요', { exact: true }).count(),
                    0
                );
                await capture(page, 'empty-page');
                await navigation.getByRole('button', { name: '1', exact: true }).press('Enter');
                await page.waitForURL(
                    (url) => url.searchParams.get('tab') === 'audit' && !url.searchParams.has('page')
                );
                await auditEntries(page, 20);
                assert.equal(auditPosts, 0);
                assert.deepEqual(f.errors, []);
                await capture(page, 'recovered-first-page');
                await page.goto(f.url + adminPath + '?tab=audit&page=2&q=HTTP');
                await selectView(page, '멤버', 'Enter');
                assert.equal(new URL(page.url()).search, '');
                assert.equal(auditPosts, 0);
                assert.deepEqual(f.errors, []);
            }
        );
