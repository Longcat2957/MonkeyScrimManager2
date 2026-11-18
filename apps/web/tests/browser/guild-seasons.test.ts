import assert from 'node:assert/strict';
import test from 'node:test';
import { and, eq, isNull } from 'drizzle-orm';
import { stringify } from 'devalue';
import { chromium, type Locator, type Page } from 'playwright';
import * as schema from '../../src/lib/server/db/schema.ts';
import { assertAction, HTTP_BOT_TOKEN, HTTP_IDS } from '../api/support/http.ts';
import { createHttpRecordSeasonsFixture } from '../api/support/http-record-seasons-fixtures.ts';
import { appErrors, assertNoOverflow, sessionContext } from './support/browser.ts';

type Fixture = Awaited<ReturnType<typeof createHttpRecordSeasonsFixture>>;
const nextName = 'W'.repeat(100);
const concurrentName = '다른 관리자가 먼저 시작한 시즌';
const unavailableMessage = '시즌을 시작하지 못했어요. 다시 시도해 주세요.';
const isRotation = (url: string) => new URL(url).searchParams.has('/rotateSeason');

async function retained(f: Fixture) {
    return Promise.all([
        f.db.select().from(schema.scrims),
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

async function currentSeason(f: Fixture) {
    return (
        await f.db
            .select()
            .from(schema.mmrSeasons)
            .where(and(eq(schema.mmrSeasons.guildId, HTTP_IDS.guild), isNull(schema.mmrSeasons.endedAt)))
    )[0];
}

async function confirmation(page: Page, submit: Locator, currentName: string) {
    await submit.press('Enter');
    const dialog = page.getByRole('dialog', { name: '새 시즌 시작', exact: true });
    const accept = dialog.getByRole('button', { name: '확인', exact: true });
    await accept.waitFor();
    const content = dialog.locator('#confirmation-content');
    assert.ok((await content.innerText()).includes(nextName));
    assert.ok((await content.innerText()).includes(currentName));
    const fits = await content.evaluate((node) => {
        const bounds = node.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(node);
        return [...range.getClientRects()].every(
            (rect) => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1
        );
    });
    if (!fits)
        await page.screenshot({
            path: `/tmp/msm2-guild-season-confirm-overflow-${page.viewportSize()!.width}.png`,
            animations: 'disabled'
        });
    assert.equal(fits, true, '100자 시즌 이름과 현재 시즌을 확인창 안에서 모두 읽을 수 있어야 한다.');
    return { dialog, accept };
}

async function post(page: Page, accept: Locator, status: number) {
    const response = page.waitForResponse((reply) => isRotation(reply.url()));
    await accept.press('Enter');
    assert.equal((await response).status(), status);
}

for (const width of [1440, 390])
    for (const theme of ['primary', 'dark'])
        test(
            `웹 시즌 전환은 확인·충돌 복구·입력을 보존하고 기존 경기·MMR을 유지한다: ${width}px ${theme}`,
            { timeout: 90_000 },
            async (t) => {
                let release = () => {};
                t.after(() => release());
                const browser = await chromium.launch({ headless: true });
                t.after(() => browser.close());
                const f = await createHttpRecordSeasonsFixture(t, { games: 3 });
                const context = await browser.newContext({
                    viewport: { width, height: width === 390 ? 844 : 1000 },
                    reducedMotion: 'reduce'
                });
                await sessionContext(context, f, f.manager.cookie);
                await context.addInitScript((mode) => localStorage.setItem('theme-mode', mode), theme);
                const page = await context.newPage();
                page.setDefaultTimeout(10_000);
                const errors = appErrors(page);
                let posts = 0;
                page.on('request', (request) => {
                    if (request.method() === 'POST' && isRotation(request.url())) posts++;
                });
                const path = '/g/' + HTTP_IDS.guild + '/admin';
                await page.goto(f.url + path + '?q=' + encodeURIComponent('지워질 검색') + '&page=9');
                await page.getByLabel('멤버 이름 검색', { exact: true }).waitFor();
                const views = page.getByRole('group', { name: '관리 항목', exact: true });
                const seasons = views.getByRole('button', { name: '시즌', exact: true });
                await seasons.press('Space');
                await page.waitForURL((url) => url.searchParams.get('tab') === 'seasons');
                assert.equal(new URL(page.url()).searchParams.has('q'), false);
                assert.equal(new URL(page.url()).searchParams.has('page'), false);
                const input = page.getByLabel('새 시즌 이름', { exact: true });
                const submit = page.getByRole('button', { name: '새 시즌 시작', exact: true });
                const current = page.getByRole('region', { name: '현재 시즌', exact: true });
                const completed = page.getByRole('region', { name: '지난 시즌', exact: true });
                await input.waitFor();
                await page.waitForFunction(
                    (node) => node.getAttribute('aria-pressed') === 'true',
                    await seasons.elementHandle()
                );
                assert.equal(await views.locator('button[aria-pressed="true"]').count(), 1);
                assert.equal(await page.getByRole('tab').count(), 0);
                assert.equal(await input.count(), 1);
                assert.equal(await submit.count(), 1);
                for (const name of ['멤버', 'Discord 연동', '변경 이력', '시즌']) {
                    const button = views.getByRole('button', { name, exact: true });
                    assert.equal(await button.count(), 1);
                    assert.equal(await button.getAttribute('type'), 'button');
                    assert.equal(
                        await button.evaluate((node) => {
                            const bounds = node.getBoundingClientRect();
                            return bounds.left >= 0 && bounds.right <= innerWidth && bounds.height >= 44;
                        }),
                        true,
                        '네 관리 항목을 모바일에서도 화면 안에서 조작할 수 있어야 한다.'
                    );
                }
                assert.equal(await page.getByRole('link', { name: '관리', exact: true }).count(), 0);
                await current.getByText(f.currentSeason.name, { exact: true }).waitFor();
                assert.equal(await completed.getByRole('listitem').count(), 1);
                assert.equal(await completed.getByRole('button').count(), 0);
                assert.equal(await completed.getByRole('link').count(), 0);
                const before = await retained(f);
                assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 30);
                const fields = {
                    name: nextName,
                    expectedCurrentSeasonId: f.currentSeason.id,
                    confirm: 'true'
                };
                assertAction(await f.action(path, 'rotateSeason', fields), 401);
                assertAction(await f.action(path, 'rotateSeason', fields, f.participant.cookie), 403);
                assert.equal((await f.db.select().from(schema.mmrSeasons)).length, 2);

                await input.fill('   ');
                await submit.press('Enter');
                await page
                    .getByRole('alert')
                    .getByText('새 시즌 이름은 1~100자로 입력해 주세요.', { exact: true })
                    .waitFor();
                assert.equal(await input.evaluate((node) => node === document.activeElement), true);
                assert.equal(posts, 0);
                await input.fill(nextName);
                const cancelled = await confirmation(page, submit, f.currentSeason.name);
                await assertNoOverflow(page, 'rotation-confirm');
                await cancelled.dialog.getByRole('button', { name: '취소', exact: true }).press('Enter');
                await cancelled.accept.waitFor({ state: 'hidden' });
                await page.waitForFunction(
                    (node) => node === document.activeElement,
                    await submit.elementHandle()
                );
                assert.equal(posts, 0);
                assert.equal(await input.inputValue(), nextName);
                assert.equal((await currentSeason(f))!.id, f.currentSeason.id);

                // 다른 운영자가 실제 봇 경로로 먼저 전환해 열린 웹 화면을 오래된 현재 시즌 상태로 만든다.
                const rotated = await f.request('/internal/bot/guilds/' + HTTP_IDS.guild + '/seasons', {
                    method: 'POST',
                    headers: {
                        authorization: 'Bearer ' + HTTP_BOT_TOKEN,
                        'content-type': 'application/json'
                    },
                    body: JSON.stringify({
                        actorId: HTTP_IDS.manager,
                        interactionId: '997000000000000002',
                        expectedCurrentSeasonId: f.currentSeason.id,
                        name: concurrentName,
                        confirm: true
                    })
                });
                assert.equal(rotated.status, 200);
                const concurrent = (await rotated.json()) as { current: { id: string; name: string } };
                assert.notEqual(concurrent.current.id, f.currentSeason.id);
                const stale = await confirmation(page, submit, f.currentSeason.name);
                await post(page, stale.accept, 409);
                await page
                    .getByRole('alert')
                    .getByText('현재 시즌이 바뀌었어요. 시즌을 다시 조회하고 확인해 주세요', { exact: true })
                    .waitFor();
                await current.getByText(concurrentName, { exact: true }).waitFor();
                assert.equal(await input.inputValue(), nextName);
                assert.equal(
                    await page.locator('input[name="expectedCurrentSeasonId"]').inputValue(),
                    concurrent.current.id
                );
                assert.equal(posts, 1);
                assert.equal((await f.db.select().from(schema.mmrSeasons)).length, 3);

                let failNext = true;
                let holdNext = true;
                let arrived!: () => void;
                const pending = new Promise<void>((done) => {
                    arrived = done;
                });
                const held = new Promise<void>((done) => {
                    release = done;
                });
                await context.route('**/*', async (route) => {
                    if (!isRotation(route.request().url())) return route.fallback();
                    if (failNext) {
                        failNext = false;
                        return route.fulfill({
                            status: 503,
                            contentType: 'application/json',
                            body: JSON.stringify({
                                type: 'failure',
                                status: 503,
                                data: stringify({ message: unavailableMessage })
                            })
                        });
                    }
                    if (holdNext) {
                        holdNext = false;
                        arrived();
                        await held;
                    }
                    await route.fallback();
                });
                const failed = await confirmation(page, submit, concurrentName);
                await post(page, failed.accept, 503);
                await page.getByRole('alert').getByText(unavailableMessage, { exact: true }).waitFor();
                assert.equal(await input.inputValue(), nextName);
                assert.equal(await input.isEnabled(), true);
                assert.equal(await submit.isEnabled(), true);
                assert.equal((await currentSeason(f))!.id, concurrent.current.id);
                await assertNoOverflow(page, 'rotation-error');

                const retry = await confirmation(page, submit, concurrentName);
                const response = page.waitForResponse((reply) => isRotation(reply.url()));
                await retry.accept.press('Enter');
                await pending;
                assert.equal(await input.isDisabled(), true);
                assert.equal(await submit.isDisabled(), true);
                assert.equal(
                    await page
                        .getByRole('form', { name: '시즌 전환', exact: true })
                        .getAttribute('aria-busy'),
                    'true'
                );
                await input.evaluate((node) => (node as HTMLInputElement).form?.requestSubmit());
                await submit.press('Enter');
                assert.equal(posts, 3);
                release();
                assert.equal((await response).status(), 200);
                await page.getByRole('status').getByText('새 시즌을 시작했어요.', { exact: true }).waitFor();
                await current.getByText(nextName, { exact: true }).waitFor();
                assert.equal(await input.inputValue(), '');
                assert.equal(posts, 3);
                const next = (await currentSeason(f))!;
                assert.equal(next.name, nextName);
                assert.notEqual(next.id, concurrent.current.id);
                const [previous] = await f.db
                    .select()
                    .from(schema.mmrSeasons)
                    .where(eq(schema.mmrSeasons.id, concurrent.current.id));
                assert.equal(previous!.endedAt!.toISOString(), next.startedAt.toISOString());
                assert.equal((await f.db.select().from(schema.mmrSeasons)).length, 4);
                assert.equal(await completed.getByRole('listitem').count(), 3);
                assert.equal(await completed.getByRole('button').count(), 0);
                assert.equal(await completed.getByRole('link').count(), 0);
                assert.equal(
                    (
                        await f.db
                            .select()
                            .from(schema.userPositionMmr)
                            .where(eq(schema.userPositionMmr.seasonId, next.id))
                    ).length,
                    0
                );
                assert.deepEqual(await retained(f), before);
                await assertNoOverflow(page, 'new-current-season');
                await page.reload();
                await current.getByText(nextName, { exact: true }).waitFor();
                assert.equal(
                    await page.locator('input[name="expectedCurrentSeasonId"]').inputValue(),
                    next.id
                );
                assert.equal(await input.inputValue(), '');

                if (width === 1440 && theme === 'primary') {
                    // 활성 시즌 없는 초기 설정 경계는 명시적 DB 상태로만 재현하며 UI로 종료했다고 주장하지 않는다.
                    await f.db
                        .update(schema.mmrSeasons)
                        .set({ endedAt: new Date() })
                        .where(eq(schema.mmrSeasons.id, next.id));
                    await page.reload();
                    await current
                        .getByText('진행 중인 시즌이 없어요. Discord에서 서버 초기 설정을 확인해 주세요.', {
                            exact: true
                        })
                        .waitFor();
                    assert.equal(await input.isDisabled(), true);
                    assert.equal(await submit.isDisabled(), true);
                    assertAction(
                        await f.action(
                            path,
                            'rotateSeason',
                            { ...fields, expectedCurrentSeasonId: next.id },
                            f.manager.cookie
                        ),
                        409
                    );
                    assert.equal((await f.db.select().from(schema.mmrSeasons)).length, 4);
                }
                assert.deepEqual(await retained(f), before);
                assert.deepEqual(errors, []);
                assert.equal(
                    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
                    false
                );
            }
        );
