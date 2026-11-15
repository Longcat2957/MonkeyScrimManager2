import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { stringify } from 'devalue';
import { chromium, type BrowserContext, type Locator, type Page } from 'playwright';
import * as schema from '../../src/lib/server/db/schema.ts';
import { assertAction, HTTP_IDS } from '../api/support/http.ts';
import { createHttpMatchResultFixture } from '../api/support/http-match-fixtures.ts';

type Fixture = Awaited<ReturnType<typeof createHttpMatchResultFixture>>;
const saveError = '공개 설정을 저장하지 못했어요. 다시 시도해 주세요.';
const captures: Record<string, unknown>[] = [];

async function sessionContext(context: BrowserContext, fixture: Fixture, cookie: string) {
    const separator = cookie.indexOf('=');
    await context.addCookies([
        {
            name: cookie.slice(0, separator),
            value: cookie.slice(separator + 1),
            domain: '127.0.0.1',
            path: '/',
            secure: true,
            httpOnly: true,
            sameSite: 'Lax'
        }
    ]);
    const origin = new URL(fixture.url).origin;
    await context.route('**/*', async (route) => {
        const request = route.request();
        if (new URL(request.url()).origin !== origin) return route.abort();
        const headers: Record<string, string> = { ...request.headers(), 'x-forwarded-proto': 'https' };
        if (request.method() === 'POST') headers.origin = fixture.origin;
        await route.fulfill({ response: await route.fetch({ headers, maxRedirects: 0 }) });
    });
}

async function checked(control: Locator, value: boolean) {
    await control.waitFor();
    await control
        .page()
        .waitForFunction(({ node, expected }) => node?.getAttribute('aria-checked') === expected, {
            node: await control.elementHandle(),
            expected: String(value)
        });
    assert.equal(await control.getAttribute('type'), 'button');
    assert.equal(await control.getAttribute('aria-checked'), String(value));
}

async function capture(page: Page, f: Fixture, state: string) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const directory = process.env.MSM2_PRIVACY_CAPTURE_DIR;
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
    const fullPage = state !== 'withdraw-confirm';
    const bytes = await page.screenshot({ path: resolve(directory, file), fullPage, animations: 'disabled' });
    const url = new URL(page.url());
    const games = await f.db.select({ id: schema.games.id }).from(schema.games);
    captures.push({
        file,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        viewport,
        theme,
        state,
        url: page.url(),
        path: url.pathname + url.search,
        gameIds: games.map((game) => game.id),
        fullPage,
        source: '실제 SSR·격리 DB·본인 세션·정상 ROFL 결과와 MMR, 외부 요청은 fixture로 제한'
    });
    await writeFile(resolve(directory, 'captures.json'), JSON.stringify(captures, null, 4) + '\n');
}

async function retained(f: Fixture) {
    return Promise.all([
        f.db.select().from(schema.matches),
        f.db.select().from(schema.games),
        f.db.select().from(schema.gameParticipants),
        f.db.select().from(schema.matchLineups),
        f.db.select().from(schema.matchLineupPlayers),
        f.db.select().from(schema.gameMmrApplications),
        f.db.select().from(schema.mmrLedgerEntries),
        f.db.select().from(schema.userPositionMmr),
        f.db.select().from(schema.roflMetadata),
        f.db.select().from(schema.roflParticipantDataV1),
        f.db.select().from(schema.matchRoflImports)
    ]);
}

async function headerModeSwitch(page: Page, theme: string) {
    await page.getByRole('button', { name: '메뉴', exact: true }).press('Enter');
    const menu = page.getByRole('dialog', { name: '메뉴', exact: true });
    const mode = menu.getByRole('switch', { name: '다크 모드', exact: true });
    await checked(mode, theme === 'dark');
    await mode.press('Space');
    await checked(mode, theme !== 'dark');
    await page.waitForFunction(
        (expected) => document.documentElement.dataset.mode === expected,
        theme === 'dark' ? 'primary' : 'dark'
    );
    await mode.press('Space');
    await checked(mode, theme === 'dark');
    await page.waitForFunction((expected) => document.documentElement.dataset.mode === expected, theme);
    await page.keyboard.press('Escape');
    await mode.waitFor({ state: 'hidden' });
}

async function managerFearlessSwitch(page: Page, f: Fixture) {
    const [scrim] = await f.db
        .insert(schema.scrims)
        .values({
            guildId: HTTP_IDS.guild,
            mmrSeasonId: f.season.id,
            title: '공유 스위치 검증',
            status: 'preparing',
            isHardFearless: true
        })
        .returning();
    let posts = 0;
    page.on('request', (request) => {
        if (request.method() === 'POST') posts++;
    });
    await page.goto(f.url + '/g/' + HTTP_IDS.guild + '/scrims/' + scrim!.id);
    await page.getByRole('button', { name: '운영 메뉴', exact: true }).click();
    await page
        .getByRole('dialog', { name: '운영 메뉴', exact: true })
        .getByRole('button', { name: '내전 설정 수정', exact: true })
        .press('Enter');
    const settings = page.getByRole('dialog', { name: '내전 설정 수정', exact: true });
    const fearless = settings.getByRole('switch', { name: '하드 피어리스', exact: true });
    await checked(fearless, true);
    await fearless.press('Space');
    await checked(fearless, false);
    await fearless.press('Space');
    await checked(fearless, true);
    await settings.getByRole('button', { name: '취소', exact: true }).press('Enter');
    await fearless.waitFor({ state: 'hidden' });
    assert.equal(posts, 0);
    assert.equal(
        (await f.db.select().from(schema.scrims).where(eq(schema.scrims.id, scrim!.id)))[0]!.isHardFearless,
        true
    );
}

for (const width of [1440, 390])
    for (const theme of ['primary', 'dark'])
        test(
            `본인 공개 설정·실패 복구·탈퇴와 실제 경기·MMR 보존을 확인한다: ${width}px ${theme}`,
            { timeout: 90_000 },
            async (t) => {
                let releaseSave = () => {};
                t.after(() => releaseSave());
                const browser = await chromium.launch({ headless: true });
                t.after(() => browser.close());
                const f = await createHttpMatchResultFixture(t);
                const viewport = { width, height: width === 390 ? 844 : 1000 };
                const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
                await sessionContext(context, f, f.participant.cookie);
                await context.addInitScript((mode) => {
                    try {
                        localStorage.setItem('theme-mode', mode);
                    } catch {}
                }, theme);
                const page = await context.newPage();
                page.setDefaultTimeout(10_000);
                const errors: string[] = [];
                page.on('pageerror', (error) => errors.push(error.message));
                page.on('console', (message) => {
                    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
                        errors.push(message.text());
                });
                assertAction(
                    await f.action(
                        f.path,
                        'upload',
                        { ...(await f.confirm()), file: f.file() },
                        f.participant.cookie
                    ),
                    200
                );
                assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 10);

                await page.goto(f.url + '/me');
                const profile = page.getByRole('switch', { name: '프로필 정보 공개', exact: true });
                const riotIds = page.getByRole('switch', { name: 'Riot ID 공개', exact: true });
                const save = page.getByRole('button', { name: '공개 설정 저장', exact: true });
                const withdraw = page.getByRole('button', { name: '서비스 탈퇴', exact: true });
                await checked(profile, true);
                await checked(riotIds, true);
                assert.equal(await save.count(), 1);
                assert.equal(await withdraw.count(), 1);
                assert.equal(await withdraw.isDisabled(), true);
                await page
                    .getByText(
                        '참가 중인 내전이 있어요. 신청을 철회하거나 내전이 종료된 뒤 다시 시도해 주세요',
                        { exact: true }
                    )
                    .waitFor();
                if (width === 390) await headerModeSwitch(page, theme);
                if (theme === 'primary') {
                    const managerContext = await browser.newContext({ viewport, reducedMotion: 'reduce' });
                    await sessionContext(managerContext, f, f.manager.cookie);
                    const managerPage = await managerContext.newPage();
                    managerPage.setDefaultTimeout(10_000);
                    await managerFearlessSwitch(managerPage, f);
                    await managerContext.close();
                }
                await capture(page, f, 'active-profile');
                assertAction(
                    await f.action('/me', 'withdraw', { confirm: 'true' }, f.participant.cookie),
                    409
                );
                assert.equal(
                    (await f.db.select().from(schema.users).where(eq(schema.users.id, HTTP_IDS.member)))[0]!
                        .withdrawnAt,
                    null
                );

                let privacyPosts = 0;
                page.on('request', (request) => {
                    if (request.method() === 'POST' && request.url().endsWith('?/privacy')) privacyPosts++;
                });
                let failNext = true;
                let holdNext = true;
                let saveArrived!: () => void;
                const arrived = new Promise<void>((done) => {
                    saveArrived = done;
                });
                const held = new Promise<void>((done) => {
                    releaseSave = done;
                });
                await context.route('**/*', async (route) => {
                    if (!route.request().url().endsWith('?/privacy')) return route.fallback();
                    if (failNext) {
                        failNext = false;
                        return route.fulfill({
                            status: 503,
                            contentType: 'application/json',
                            body: JSON.stringify({
                                type: 'failure',
                                status: 503,
                                data: stringify({ message: saveError })
                            })
                        });
                    }
                    if (holdNext) {
                        holdNext = false;
                        saveArrived();
                        await held;
                    }
                    await route.fallback();
                });
                await profile.press('Space');
                await checked(profile, false);
                await checked(riotIds, true);
                await riotIds.press('Space');
                await checked(riotIds, false);
                assert.equal(privacyPosts, 0);
                const failed = page.waitForResponse((reply) => reply.url().endsWith('?/privacy'));
                await save.press('Enter');
                assert.equal((await failed).status(), 503);
                await page.getByRole('alert').getByText(saveError, { exact: true }).waitFor();
                await checked(profile, false);
                await checked(riotIds, false);
                assert.equal(await profile.isEnabled(), true);
                assert.equal(
                    (await f.db.select().from(schema.users).where(eq(schema.users.id, HTTP_IDS.member)))[0]!
                        .publicProfile,
                    true
                );
                await capture(page, f, 'save-error');

                const saved = page.waitForResponse((reply) => reply.url().endsWith('?/privacy'));
                await save.press('Enter');
                await arrived;
                assert.equal(await profile.isDisabled(), true);
                assert.equal(await riotIds.isDisabled(), true);
                await profile.press('Space');
                await checked(profile, false);
                await save.evaluate((node) => (node as HTMLButtonElement).form?.requestSubmit());
                releaseSave();
                assert.equal((await saved).status(), 200);
                await page
                    .getByRole('status')
                    .getByText('공개 설정을 저장했어요.', { exact: true })
                    .waitFor();
                assert.equal(privacyPosts, 2);
                assert.equal(await save.isDisabled(), true);
                const [privateUser] = await f.db
                    .select()
                    .from(schema.users)
                    .where(eq(schema.users.id, HTTP_IDS.member));
                assert.equal(privateUser!.publicProfile, false);
                assert.equal(privateUser!.publicRiotIds, false);
                await page.reload();
                await checked(profile, false);
                await checked(riotIds, false);
                assert.equal(await withdraw.isDisabled(), true);
                await capture(page, f, 'saved-private-active');

                // 공개를 꺼도 서버의 실제 출전자 연결로 같은 라인업의 다음 세트를 정상 처리한다.
                assertAction(
                    await f.action(
                        f.path,
                        'upload',
                        { ...(await f.confirm(2)), file: f.file(1_900_000) },
                        f.participant.cookie
                    ),
                    200
                );
                assert.equal((await f.matchRow()).status, 'completed');
                const before = await retained(f);
                assert.equal((await f.db.select().from(schema.games)).length, 2);
                assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 20);
                await f.session(HTTP_IDS.member);
                await page.reload();
                await withdraw.waitFor();
                assert.equal(await withdraw.isEnabled(), true);
                await withdraw.press('Enter');
                const confirmation = page.getByRole('dialog', { name: '서비스 탈퇴', exact: true });
                const cancel = confirmation.getByRole('button', { name: '취소', exact: true });
                await cancel.waitFor();
                await cancel.press('Enter');
                await page.waitForFunction(
                    (node) => node === document.activeElement,
                    await withdraw.elementHandle()
                );
                assert.equal(
                    (await f.db.select().from(schema.users).where(eq(schema.users.id, HTTP_IDS.member)))[0]!
                        .withdrawnAt,
                    null
                );
                await withdraw.press('Enter');
                const confirm = confirmation.getByRole('button', { name: '확인', exact: true });
                await confirm.waitFor();
                await capture(page, f, 'withdraw-confirm');
                const withdrawn = page.waitForResponse((reply) => reply.url().endsWith('?/withdraw'));
                await confirm.press('Enter');
                assert.equal((await withdrawn).status(), 200);
                await page.waitForURL((url) => url.pathname === '/');
                await page.getByRole('link', { name: '로그인', exact: true }).first().waitFor();
                assert.equal(
                    (await context.cookies()).some((cookie) => cookie.name === '__Host-monkeybot_session'),
                    false
                );
                assert.equal(
                    (
                        await f.db
                            .select()
                            .from(schema.sessions)
                            .where(eq(schema.sessions.userId, HTTP_IDS.member))
                    ).length,
                    0
                );
                assert.equal(
                    (
                        await f.db
                            .select()
                            .from(schema.guildRiotAccounts)
                            .where(eq(schema.guildRiotAccounts.userId, HTTP_IDS.member))
                    ).length,
                    0
                );
                assert.equal(
                    (
                        await f.db
                            .select()
                            .from(schema.guildMembers)
                            .where(eq(schema.guildMembers.userId, HTTP_IDS.member))
                    ).length,
                    0
                );
                const [gone] = await f.db
                    .select()
                    .from(schema.users)
                    .where(eq(schema.users.id, HTTP_IDS.member));
                assert.ok(gone!.withdrawnAt);
                assert.equal(gone!.username, '탈퇴한 사용자');
                assert.equal(gone!.globalName, null);
                assert.equal(gone!.avatarHash, null);
                const [identity] = await f.db
                    .select()
                    .from(schema.riotAccounts)
                    .where(eq(schema.riotAccounts.id, f.accounts[0]!.id));
                assert.equal(identity!.puuid, f.accounts[0]!.puuid);
                assert.equal(identity!.gameName, null);
                assert.equal(identity!.tagLine, null);
                assert.deepEqual(await retained(f), before);
                assert.equal(
                    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
                    false
                );
                assert.deepEqual(errors, []);
            }
        );
