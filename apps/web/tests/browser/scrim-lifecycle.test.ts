import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { chromium, type Page } from 'playwright';
import * as schema from '../../src/lib/server/db/schema.ts';
import { assertAction, HTTP_IDS } from '../api/support/http.ts';
import { createHttpMatchResultFixture } from '../api/support/http-match-fixtures.ts';

const artifactDirectory = new URL(
    '../../../../artifacts/ui-review/operations/after/lifecycle/',
    import.meta.url
);
const captures: {
    file: string;
    sha256: string;
    width: number;
    height: number;
    theme: string;
    state: string;
    path: string;
}[] = [];

async function menu(page: Page, action: string) {
    const trigger = page.getByRole('button', { name: '운영 메뉴', exact: true });
    await trigger.focus();
    await trigger.press('Enter');
    await page.getByRole('button', { name: action, exact: true }).click();
    return page.getByRole('dialog', { name: action, exact: true });
}

async function confirm(page: Page, action: string, title: string) {
    const dialog = await menu(page, title);
    const response = page.waitForResponse((reply) => reply.url().endsWith('?/' + action));
    await dialog.getByRole('button', { name: '확인', exact: true }).press('Enter');
    assert.equal((await response).status(), 200);
    await dialog.waitFor({ state: 'hidden' });
}

for (const width of [1440, 390])
    for (const theme of ['primary', 'dark'])
        test(
            `실제 운영 세션 취소 복구·준비 중도 종료·ROFL 보존 재개: ${width}px ${theme}`,
            { timeout: 90_000 },
            async (t) => {
                const browser = await chromium.launch({ headless: true });
                t.after(() => browser.close());
                const f = await createHttpMatchResultFixture(t);
                const slot = await f.confirm();
                assertAction(
                    await f.action(f.path, 'upload', { ...slot, file: f.file() }, f.manager.cookie),
                    200
                );
                const before = await Promise.all([
                    f.db.select().from(schema.games),
                    f.db.select().from(schema.gameParticipants),
                    f.db.select().from(schema.gameMmrApplications),
                    f.db.select().from(schema.mmrLedgerEntries),
                    f.db.select().from(schema.userPositionMmr)
                ]);
                const [preparing] = await f.db
                    .insert(schema.scrims)
                    .values({
                        guildId: HTTP_IDS.guild,
                        mmrSeasonId: f.season.id,
                        title: '편성 전 운영 검증',
                        status: 'preparing'
                    })
                    .returning();
                const preparingPath = '/g/' + HTTP_IDS.guild + '/scrims/' + preparing!.id;
                const summaryPath = '/g/' + HTTP_IDS.guild + '/scrims/' + f.scrim.id;
                const context = await browser.newContext({
                    viewport: { width, height: width === 390 ? 844 : 1000 },
                    reducedMotion: 'reduce'
                });
                const separator = f.manager.cookie.indexOf('=');
                await context.addCookies([
                    {
                        name: f.manager.cookie.slice(0, separator),
                        value: f.manager.cookie.slice(separator + 1),
                        domain: '127.0.0.1',
                        path: '/',
                        secure: true,
                        httpOnly: true,
                        sameSite: 'Lax'
                    }
                ]);
                await context.addInitScript((mode) => localStorage.setItem('theme-mode', mode), theme);
                const origin = new URL(f.url).origin;
                await context.route('**/*', async (route) => {
                    const request = route.request();
                    if (new URL(request.url()).origin !== origin) return route.abort();
                    const headers: Record<string, string> = {
                        ...request.headers(),
                        'x-forwarded-proto': 'https'
                    };
                    if (request.method() === 'POST') headers.origin = f.origin;
                    await route.fulfill({ response: await route.fetch({ headers, maxRedirects: 0 }) });
                });
                const page = await context.newPage();
                page.setDefaultTimeout(10_000);
                const errors: string[] = [];
                page.on('pageerror', (error) => errors.push(error.message));
                const capture = async (state: string) => {
                    // STDF 진입 전환이 끝난 화면을 읽으며 전환 중 축소·투명 프레임을 증거로 남기지 않는다.
                    await page.waitForTimeout(500);
                    await page.evaluate(async () => {
                        await document.fonts.ready;
                        await new Promise<void>((resolve) =>
                            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
                        );
                    });
                    assert.equal(
                        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
                        false
                    );
                    assert.equal(await page.locator('html').getAttribute('data-mode'), theme);
                    const file = `${width}-${theme}-${state}.png`;
                    await mkdir(artifactDirectory, { recursive: true });
                    const png = await page.screenshot({ path: new URL(file, artifactDirectory).pathname });
                    captures.push({
                        file,
                        sha256: createHash('sha256').update(png).digest('hex'),
                        width,
                        height: width === 390 ? 844 : 1000,
                        theme,
                        state,
                        path: new URL(page.url()).pathname
                    });
                    await writeFile(
                        new URL('captures.json', artifactDirectory),
                        JSON.stringify(captures, null, 4) + '\n'
                    );
                };

                await page.goto(f.url + preparingPath);
                const cancelled = await menu(page, '내전 취소');
                await capture('cancel-confirm');
                await page.keyboard.press('Escape');
                await cancelled.waitFor({ state: 'hidden' });
                assert.equal(
                    (await f.db.select().from(schema.scrims).where(eq(schema.scrims.id, preparing!.id)))[0]!
                        .status,
                    'preparing'
                );
                await confirm(page, 'cancel', '내전 취소');
                await page.getByText('취소', { exact: true }).first().waitFor();
                await page.getByRole('button', { name: '운영 메뉴', exact: true }).click();
                await page.getByRole('button', { name: '내전 취소 복구', exact: true }).waitFor();
                await capture('cancelled-restore-menu');
                await page.keyboard.press('Escape');
                await confirm(page, 'restore', '내전 취소 복구');
                await page.getByText('편성 중', { exact: true }).first().waitFor();
                await confirm(page, 'endEarly', '중도 종료');
                await page.goto(f.url + preparingPath + '/result');
                await page.getByText('대진을 만들기 전에 내전이 중도 종료됐어요.', { exact: true }).waitFor();
                await capture('preparing-ended-result');
                await page.goto(f.url + preparingPath);
                await confirm(page, 'revert', '팀 편성으로 되돌리기');
                await page.getByText('편성 중', { exact: true }).first().waitFor();
                assert.equal(
                    (await f.db.select().from(schema.scrims).where(eq(schema.scrims.id, preparing!.id)))[0]!
                        .formationMethod,
                    null
                );

                await page.goto(f.url + summaryPath);
                await page.getByRole('button', { name: '운영 메뉴', exact: true }).click();
                assert.equal(await page.getByRole('button', { name: '내전 취소', exact: true }).count(), 0);
                await page.keyboard.press('Escape');
                await confirm(page, 'endEarly', '중도 종료');
                assert.equal((await f.matchRow()).winnerTeamId, f.match.teamAId);
                await page.goto(f.url + summaryPath + '/result');
                await page.getByRole('heading', { name: '중도 종료 결과', exact: true }).waitFor();
                assert.equal(await page.getByText('승', { exact: true }).count(), 1);
                await capture('leading-ended-result');
                await page.goto(f.url + summaryPath);
                await confirm(page, 'revert', '진행 중으로 되돌리기');
                await page.getByText('진행 중', { exact: true }).first().waitFor();
                assert.equal((await f.matchRow()).winnerTeamId, null);
                assert.deepEqual(
                    await Promise.all([
                        f.db.select().from(schema.games),
                        f.db.select().from(schema.gameParticipants),
                        f.db.select().from(schema.gameMmrApplications),
                        f.db.select().from(schema.mmrLedgerEntries),
                        f.db.select().from(schema.userPositionMmr)
                    ]),
                    before
                );
                assert.deepEqual(errors, []);
            }
        );
