import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import type { BrowserContext, Page } from 'playwright';
import * as schema from '../../src/lib/server/db/schema.ts';
import { createHttpMatchResultFixture } from '../api/support/http-match-fixtures.ts';

type Fixture = Awaited<ReturnType<typeof createHttpMatchResultFixture>>;
const recoveryCaptures: { file: string; sha256: string; path: string; width: number; state: string }[] = [];

/** 브라우저가 보는 TLS 프록시·쿠키·origin 계약은 기존 브라우저 fixture와 같다. */
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
        const headers: Record<string, string> = {
            ...request.headers(),
            'x-forwarded-proto': 'https'
        };
        if (request.method() === 'POST') headers.origin = fixture.origin;
        await route.fulfill({ response: await route.fetch({ headers, maxRedirects: 0 }) });
    });
}

async function prepareUpload(page: Page, file: File) {
    await page.getByRole('button', { name: 'ROFL 업로드', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'ROFL 업로드', exact: true });
    const blueTeam = dialog.getByRole('group', { name: '이 세트의 블루 팀', exact: true });
    const firstTeam = blueTeam.getByRole('button', { name: '1팀', exact: true });
    const secondTeam = blueTeam.getByRole('button', { name: '2팀', exact: true });
    await blueTeam.getByRole('button', { name: '1팀', pressed: false, exact: true }).waitFor();
    assert.equal(await blueTeam.getByRole('button', { pressed: true }).count(), 0);
    assert.equal(await dialog.getByRole('button', { name: '업로드', exact: true }).isDisabled(), true);
    await dialog.locator('input[type="file"]').setInputFiles({
        name: file.name,
        mimeType: 'application/octet-stream',
        buffer: Buffer.from(await file.arrayBuffer())
    });
    assert.equal(await dialog.getByRole('button', { name: '업로드', exact: true }).isDisabled(), true);
    // 팝업의 초기 포커스가 끝난 뒤 실제 Tab 순서로 선택 버튼을 조작한다.
    await page.waitForFunction(
        (button) => button === document.activeElement,
        await firstTeam.elementHandle()
    );
    await page.keyboard.press('Tab');
    assert.equal(await secondTeam.evaluate((button) => button === document.activeElement), true);
    await page.keyboard.press('Space');
    await blueTeam.getByRole('button', { name: '2팀', pressed: true, exact: true }).waitFor();
    assert.equal(await firstTeam.getAttribute('aria-pressed'), 'false');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await firstTeam.evaluate((button) => button === document.activeElement), true);
    await page.keyboard.press('Enter');
    await blueTeam.getByRole('button', { name: '1팀', pressed: true, exact: true }).waitFor();
    assert.equal(await secondTeam.getAttribute('aria-pressed'), 'false');
    await page.waitForFunction(
        (group) =>
            [...group.querySelectorAll('button')].every((button) => {
                const bounds = button.getBoundingClientRect();
                return bounds.width >= 44 && bounds.height >= 44;
            }),
        await blueTeam.elementHandle()
    );
    for (const choice of [firstTeam, secondTeam]) {
        const bounds = await choice.boundingBox();
        assert.ok(bounds && bounds.width >= 44 && bounds.height >= 44);
    }
    return dialog;
}

async function upload(page: Page, file: File, order: number) {
    const dialog = await prepareUpload(page, file);
    const response = page.waitForResponse((reply) => reply.url().endsWith('?/upload'));
    await dialog.getByRole('button', { name: '업로드', exact: true }).click();
    assert.equal((await response).status(), 200);
    await dialog.getByText(`${order}세트로 기록했어요`, { exact: true }).waitFor();
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForURL((url) => url.searchParams.has('game'));
    await page.locator('#game-heading').getByText(`${order}세트`, { exact: true }).waitFor();
}

for (const width of [1440, 390]) {
    test(
        `출전자가 정상 ROFL을 기록하고 관리자가 취소·복구한 뒤 같은 라인업으로 경기를 끝낸다: ${width}px`,
        { timeout: 90_000 },
        async (t) => {
            const browser = await chromium.launch({ headless: true });
            // 브라우저를 앱·DB보다 먼저 닫아 정리 중의 남은 요청을 방지한다.
            t.after(() => browser.close());
            const fixture = await createHttpMatchResultFixture(t);
            const viewport = { width, height: width === 390 ? 844 : 1000 };
            const participant = await browser.newContext({ viewport });
            const manager = await browser.newContext({ viewport });
            await sessionContext(participant, fixture, fixture.participant.cookie);
            await sessionContext(manager, fixture, fixture.manager.cookie);
            const page = await participant.newPage();
            const managerPage = await manager.newPage();
            page.setDefaultTimeout(10_000);
            managerPage.setDefaultTimeout(10_000);
            const errors: string[] = [];
            for (const current of [page, managerPage])
                current.on('pageerror', (error) => errors.push(error.message));

            await page.goto(fixture.url + fixture.path);
            await page.getByText('아직 기록된 세트가 없어요', { exact: true }).waitFor();
            await upload(page, fixture.file(), 1);
            const [first] = await fixture.db.select().from(schema.games);
            assert.equal(first!.status, 'completed');
            assert.equal((await fixture.db.select().from(schema.gameParticipants)).length, 10);
            assert.equal((await fixture.db.select().from(schema.mmrLedgerEntries)).length, 10);
            assert.equal(
                await page.getByRole('button', { name: '마지막 세트 취소', exact: true }).count(),
                0
            );

            // 다음 세트에 같은 파일을 넣으면 기존 결과·MMR은 유지되고 현재 상태 확인을 안내한다.
            const duplicate = await prepareUpload(page, fixture.file());
            const rejected = page.waitForResponse((reply) => reply.url().endsWith('?/upload'));
            await duplicate.getByRole('button', { name: '업로드', exact: true }).click();
            assert.equal((await rejected).status(), 409);
            await duplicate.getByRole('alert').getByText('닫으면 현재 경기 상태를 다시 확인해요.').waitFor();
            assert.equal(
                await duplicate.getByRole('button', { name: '업로드', exact: true }).isDisabled(),
                true
            );
            assert.equal((await fixture.db.select().from(schema.games)).length, 1);
            assert.equal((await fixture.db.select().from(schema.mmrLedgerEntries)).length, 10);
            await duplicate.getByRole('button', { name: '닫기', exact: true }).click();

            await managerPage.goto(fixture.url + fixture.path + '?game=' + first!.id);
            await managerPage.getByRole('button', { name: '마지막 세트 취소', exact: true }).click();
            const confirmation = managerPage.getByRole('dialog', { name: '마지막 세트 취소', exact: true });
            const reverted = managerPage.waitForResponse((reply) => reply.url().endsWith('?/revertResult'));
            await confirmation.getByRole('button', { name: '확인', exact: true }).click();
            assert.equal((await reverted).status(), 200);
            await managerPage.getByText('아직 기록된 세트가 없어요', { exact: true }).waitFor();
            assert.equal((await fixture.db.select().from(schema.games))[0]!.status, 'cancelled');
            const reversedEntries = await fixture.db.select().from(schema.mmrLedgerEntries);
            assert.equal(reversedEntries.length, 20);
            assert.equal(reversedEntries.filter((entry) => entry.kind === 'game_reversal').length, 10);

            // 취소 파일을 현재 화면에서 다시 고르면 같은 세트로 복원하고 이전 기록은 보존한다.
            await page.reload();
            await upload(page, fixture.file(), 1);
            const restoredGames = await fixture.db.select().from(schema.games);
            const restored = restoredGames.find((game) => game.status === 'completed');
            assert.ok(restored);
            assert.notEqual(restored.id, first!.id);
            assert.equal(restored.gameNumber, 1);
            assert.equal(restored.roflMetadataId, first!.roflMetadataId);
            assert.equal((await fixture.db.select().from(schema.roflMetadata)).length, 1);
            assert.equal((await fixture.db.select().from(schema.mmrLedgerEntries)).length, 30);

            // 같은 출전 라인업과 이전 사용 챔피언으로도 정상 결과를 막지 않고 BO 시리즈를 마친다.
            await upload(page, fixture.file(1_900_000), 2);
            assert.equal((await fixture.matchRow()).status, 'completed');
            assert.equal((await fixture.db.select().from(schema.matchLineups)).length, 1);
            assert.equal(
                (await fixture.db.select().from(schema.games)).filter((game) => game.status === 'completed')
                    .length,
                2
            );
            assert.equal((await fixture.db.select().from(schema.mmrLedgerEntries)).length, 40);
            assert.equal((await fixture.db.select().from(schema.gameParticipants)).length, 30);
            assert.equal(await page.getByRole('button', { name: 'ROFL 업로드', exact: true }).count(), 0);
            assert.deepEqual(errors, []);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        }
    );
}

for (const width of [1440, 390])
    for (const failure of ['rate', 'timeout'] as const)
        test(
            `ROFL ${failure === 'rate' ? '요청 제한' : '처리 시간 초과'} 후 선택 파일·블루 팀 보존: ${width}px`,
            { timeout: 60_000 },
            async (t) => {
                const browser = await chromium.launch({ headless: true });
                t.after(() => browser.close());
                const fixture = await createHttpMatchResultFixture(t, [], {
                    operations:
                        failure === 'rate'
                            ? { ROFL_USER_REQUEST_LIMIT: '1', ROFL_RATE_WINDOW_MS: '10000' }
                            : { ROFL_PARSE_TIMEOUT_MS: '1' }
                });
                if (failure === 'rate') {
                    const first = await fixture.action(
                        fixture.path,
                        'upload',
                        { ...(await fixture.confirm()), file: fixture.file() },
                        fixture.participant.cookie
                    );
                    assert.equal(first.response.status, 200);
                }
                const context = await browser.newContext({
                    viewport: { width, height: width === 390 ? 844 : 1000 },
                    reducedMotion: 'reduce'
                });
                await context.addInitScript(
                    (mode) => localStorage.setItem('theme-mode', mode),
                    width === 390 ? 'dark' : 'primary'
                );
                await sessionContext(context, fixture, fixture.participant.cookie);
                const page = await context.newPage();
                page.setDefaultTimeout(10_000);
                const errors: string[] = [];
                page.on('pageerror', (error) => errors.push(error.message));
                const capture = async (state: string) => {
                    const directory = process.env.MSM2_ROFL_CAPTURE_DIR;
                    if (!directory) return;
                    await mkdir(directory, { recursive: true });
                    await page.waitForTimeout(500);
                    const file = `${width}-${failure}-${state}.png`;
                    const png = await page.screenshot({ path: join(directory, file) });
                    recoveryCaptures.push({
                        file,
                        sha256: createHash('sha256').update(png).digest('hex'),
                        path: new URL(page.url()).pathname,
                        width,
                        state
                    });
                    await writeFile(
                        join(directory, 'captures.json'),
                        JSON.stringify(recoveryCaptures, null, 4) + '\n'
                    );
                };
                await page.goto(fixture.url + fixture.path);
                await page.waitForTimeout(700);
                const dialog = await prepareUpload(page, fixture.file(1_900_000));
                const rejected = page.waitForResponse((reply) => reply.url().endsWith('?/upload'));
                await dialog.getByRole('button', { name: '업로드', exact: true }).click();
                const response = await rejected;
                assert.equal(response.status(), failure === 'rate' ? 429 : 503);
                await dialog.getByRole('button', { name: 'fixture.rofl 선택 해제', exact: true }).waitFor();
                await dialog
                    .getByRole('button', { name: '업로드', exact: true })
                    .and(dialog.locator('button:enabled'))
                    .waitFor();
                assert.equal(
                    await dialog.getByRole('button', { name: '업로드', exact: true }).isDisabled(),
                    false
                );
                assert.equal(
                    (await fixture.db.select().from(schema.games)).length,
                    failure === 'rate' ? 1 : 0
                );
                assert.equal(
                    (await fixture.db.select().from(schema.mmrLedgerEntries)).length,
                    failure === 'rate' ? 10 : 0
                );
                assert.equal(
                    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
                    false
                );
                await capture('input-preserved');
                if (failure === 'rate') {
                    const retryAfter = Number(response.headers()['retry-after']);
                    assert.ok(retryAfter > 0 && retryAfter <= 10);
                    await page.waitForTimeout(retryAfter * 1000 + 100);
                    const retried = page.waitForResponse((reply) => reply.url().endsWith('?/upload'));
                    // 파일과 진영을 다시 고르지 않고 같은 입력으로 재시도한다.
                    await dialog.getByRole('button', { name: '업로드', exact: true }).press('Enter');
                    assert.equal((await retried).status(), 200);
                    await dialog.getByText('2세트로 기록했어요', { exact: true }).waitFor();
                    assert.equal((await fixture.db.select().from(schema.games)).length, 2);
                    await capture('retry-recorded');
                }
                assert.deepEqual(errors, []);
            }
        );
