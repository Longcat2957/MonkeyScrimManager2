import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { chromium, type Page } from 'playwright';
import * as schema from '../../src/lib/server/db/schema.ts';
import { assertAction, HTTP_IDS } from '../api/support/http.ts';
import { createHttpMatchResultFixture } from '../api/support/http-match-fixtures.ts';
import { assertNoOverflow, sessionContext } from './support/browser.ts';

async function menu(page: Page, action: string) {
    const trigger = page.getByRole('button', { name: '운영 메뉴', exact: true });
    await trigger.focus();
    await trigger.press('Enter');
    await page.getByRole('menuitem', { name: action, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: action, exact: true });
    const safeAction = dialog.getByRole('button', { name: '취소', exact: true });
    await safeAction.waitFor();
    await page.waitForFunction(
        (button) => button === document.activeElement,
        await safeAction.elementHandle()
    );
    return dialog;
}

async function confirm(page: Page, action: string, title: string) {
    const dialog = await menu(page, title);
    const response = page.waitForResponse((reply) => reply.url().endsWith('?/' + action));
    await dialog.getByRole('button', { name: '확인', exact: true }).press('Enter');
    assert.equal((await response).status(), 200);
    await dialog.waitFor({ state: 'detached' });
}

for (const width of [1440, 390])
    for (const theme of ['primary', 'dark'])
        test(
            `실제 운영 세션 취소 복구·중도 종료 재개·전체 결과 역분개: ${width}px ${theme}`,
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
                await sessionContext(context, f, f.manager.cookie);
                await context.addInitScript((mode) => localStorage.setItem('theme-mode', mode), theme);
                const page = await context.newPage();
                page.setDefaultTimeout(10_000);
                const errors: string[] = [];
                page.on('pageerror', (error) => errors.push(error.message));
                const assertLayout = async (state: string) => {
                    await page.evaluate(async () => {
                        await document.fonts.ready;
                        const transitions = document
                            .getAnimations()
                            .filter(
                                (animation) =>
                                    animation.playState === 'running' &&
                                    animation.effect?.getComputedTiming().endTime !== Infinity
                            );
                        await Promise.allSettled(transitions.map((animation) => animation.finished));
                    });
                    await assertNoOverflow(page, state);
                    assert.equal(await page.locator('html').getAttribute('data-mode'), theme, state);
                };

                await page.goto(f.url + preparingPath);
                await page.getByRole('heading', { level: 1 }).waitFor();
                await page.waitForTimeout(700);
                const cancelled = await menu(page, '내전 취소');
                await assertLayout('cancel-confirm');
                await page.keyboard.press('Escape');
                await cancelled.waitFor({ state: 'detached' });
                assert.equal(
                    (await f.db.select().from(schema.scrims).where(eq(schema.scrims.id, preparing!.id)))[0]!
                        .status,
                    'preparing'
                );
                await confirm(page, 'cancel', '내전 취소');
                await page.getByText('취소', { exact: true }).first().waitFor();
                await page.getByRole('button', { name: '운영 메뉴', exact: true }).click();
                await page.getByRole('menuitem', { name: '내전 취소 복구', exact: true }).waitFor();
                await assertLayout('cancelled-restore-menu');
                await page.keyboard.press('Escape');
                await confirm(page, 'restore', '내전 취소 복구');
                await page.getByText('편성 중', { exact: true }).first().waitFor();
                await confirm(page, 'endEarly', '중도 종료');
                await page.goto(f.url + preparingPath + '/result');
                await page.getByText('대진을 만들기 전에 내전이 중도 종료됐어요.', { exact: true }).waitFor();
                await assertLayout('preparing-ended-result');
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
                await page.getByRole('menuitem', { name: '내전 취소', exact: true }).waitFor();
                await page.keyboard.press('Escape');
                await confirm(page, 'endEarly', '중도 종료');
                assert.equal((await f.matchRow()).winnerTeamId, f.match.teamAId);
                await page.goto(f.url + summaryPath + '/result');
                await page.getByRole('heading', { name: '중도 종료 결과', exact: true }).waitFor();
                assert.equal(await page.getByText('승', { exact: true }).count(), 1);
                await assertLayout('leading-ended-result');
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

                const fullCancellation = await menu(page, '내전 취소');
                assert.match(await fullCancellation.innerText(), /세트 결과 1개/);
                assert.match(await fullCancellation.innerText(), /편성 준비로 돌아가며/);
                const explanation = await fullCancellation.locator('#confirmation-content').boundingBox();
                assert.ok(
                    explanation && explanation.width <= 600,
                    '취소 결과 설명은 읽을 수 있는 폭으로 묶는다'
                );
                await assertLayout('full-cancel-confirm');
                await page.keyboard.press('Escape');
                await fullCancellation.waitFor({ state: 'detached' });
                assert.equal((await f.matchRow()).status, 'in_progress');

                await confirm(page, 'cancel', '내전 취소');
                await page.getByText('취소', { exact: true }).first().waitFor();
                const cancelledGames = await f.db.select().from(schema.games);
                assert.equal(cancelledGames.length, before[0].length);
                assert.equal(cancelledGames[0]!.id, before[0][0]!.id);
                assert.equal(cancelledGames[0]!.status, 'cancelled');
                assert.deepEqual(await f.db.select().from(schema.gameParticipants), before[1]);
                assert.ok((await f.db.select().from(schema.gameMmrApplications))[0]!.reversedAt);
                assert.ok(
                    (await f.db.select().from(schema.userPositionMmr)).every((rating) => rating.mmr === 1500)
                );
                await assertLayout('full-cancelled');

                await page.goto(f.url + summaryPath + '/result');
                await page.waitForURL(f.url + summaryPath + '/bracket');
                await page.getByText('내전이 취소되어 표시할 대진이 없어요.', { exact: true }).waitFor();
                assert.equal(await page.getByRole('button', { name: '대진 확정', exact: true }).count(), 0);
                await page.goto(f.url + summaryPath);

                const restore = await menu(page, '내전 취소 복구');
                assert.match(await restore.innerText(), /편성 준비/);
                const restored = page.waitForResponse((reply) => reply.url().endsWith('?/restore'));
                await restore.getByRole('button', { name: '확인', exact: true }).press('Enter');
                assert.equal((await restored).status(), 200);
                await page.getByText('편성 중', { exact: true }).first().waitFor();
                assert.equal((await f.matchRow()).status, 'cancelled');
                assert.ok((await f.db.select().from(schema.gameMmrApplications))[0]!.reversedAt);
                assert.equal((await f.db.select().from(schema.games)).length, before[0].length);
                await assertLayout('full-restored-preparing');
                assert.deepEqual(errors, []);
            }
        );
