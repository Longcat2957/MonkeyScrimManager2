import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import type { Locator, Page } from 'playwright';
import { eq } from 'drizzle-orm';
import * as schema from '../../src/lib/server/db/schema.ts';
import { createHttpMatchResultFixture } from '../api/support/http-match-fixtures.ts';
import {
    championCatalogUpstream,
    championPreferenceCatalog
} from '../api/support/http-champion-preferences-fixtures.ts';
import { sessionContext } from './support/browser.ts';
import { replayBytes, replayPlayer } from '../api/support/rofl-fixtures.ts';

async function prepareUpload(page: Page, file: File, plannedFirst = false) {
    await page.getByRole('button', { name: 'ROFL 업로드', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'ROFL 업로드', exact: true });
    const blueTeam = dialog.getByRole('group', { name: '이 세트의 블루 팀', exact: true });
    const firstTeam = blueTeam.getByRole('radio', { name: '1팀', exact: true });
    const secondTeam = blueTeam.getByRole('radio', { name: '2팀', exact: true });
    const review = dialog.getByRole('button', { name: '미리보기', exact: true });
    await firstTeam.waitFor();
    assert.equal(await firstTeam.isChecked(), plannedFirst);
    assert.equal(await secondTeam.isChecked(), false);
    assert.equal(await review.isDisabled(), true);
    assert.equal(await dialog.locator('input[type=file]').getAttribute('multiple'), null);
    await dialog.locator('input[type="file"]').setInputFiles({
        name: file.name,
        mimeType: 'application/octet-stream',
        buffer: Buffer.from(await file.arrayBuffer())
    });
    assert.equal(await review.isDisabled(), true);
    // 네이티브 라디오의 방향키로 진영을 바꾸고 실제 선택을 확인한다.
    await firstTeam.focus();
    await firstTeam.press('ArrowRight');
    assert.equal(await secondTeam.isChecked(), true);
    await secondTeam.press('ArrowLeft');
    assert.equal(await firstTeam.isChecked(), true);
    assert.equal(await secondTeam.isChecked(), false);
    const confirmation = dialog.getByRole('checkbox', {
        name: '블루 1팀 · 레드 2팀이 실제 진영과 맞아요',
        exact: true
    });
    await dialog.getByRole('checkbox', { checked: false }).waitFor();
    assert.equal(await review.isDisabled(), true);
    await page.keyboard.press('Tab');
    assert.equal(await confirmation.evaluate((button) => button === document.activeElement), true);
    await page.keyboard.press('Space');
    await dialog.getByRole('checkbox', { checked: true }).waitFor();
    assert.equal(await review.isDisabled(), false);
    await page.keyboard.press('Space');
    await dialog.getByRole('checkbox', { checked: false }).waitFor();
    assert.equal(await review.isDisabled(), true);
    await page.keyboard.press('Space');
    await secondTeam.click();
    await dialog
        .getByRole('checkbox', {
            name: '블루 2팀 · 레드 1팀이 실제 진영과 맞아요',
            checked: false,
            exact: true
        })
        .waitFor();
    assert.equal(await review.isDisabled(), true);
    await firstTeam.click();
    await confirmation.press('Space');
    await dialog.getByRole('checkbox', { checked: true }).waitFor();
    if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches))
        for (const choice of [firstTeam, secondTeam, confirmation]) {
            const bounds = await choice.locator('..').boundingBox();
            assert.ok(bounds && bounds.width >= 44 && bounds.height >= 44);
        }
    return dialog;
}

async function preview(dialog: Locator) {
    await dialog.getByRole('button', { name: '미리보기', exact: true }).press('Enter');
    const heading = dialog.getByRole('heading', { name: '등록값 미리보기' });
    await heading.waitFor();
    assert.equal(await heading.evaluate((node) => node === document.activeElement), true);
    assert.equal(
        await dialog.evaluate((node) => {
            const bounds = node.getBoundingClientRect();
            return [...node.querySelectorAll('table')].every((table) => {
                const rect = table.getBoundingClientRect();
                return (
                    rect.left >= bounds.left &&
                    rect.right <= bounds.right &&
                    table.scrollWidth <= table.clientWidth
                );
            });
        }),
        true
    );
}

async function upload(page: Page, file: File, order: number, newLinks = false) {
    const dialog = await prepareUpload(page, file);
    await preview(dialog);
    await dialog.getByText(`HTTP 결과 내전 · 1팀 vs 2팀 · ${order}세트`).waitFor();
    await dialog.getByText(file.name, { exact: true }).waitFor();
    assert.equal(await dialog.getByText('새 연결', { exact: true }).count(), newLinks ? 10 : 0);

    const rows = [];
    for (const [team, name] of ['블루 1팀', '레드 2팀'].entries()) {
        const outcome = team === 0 ? '승리' : '패배';
        const table = dialog.getByRole('table', { name: `${name} ${outcome}` });
        assert.equal(await table.locator('tbody tr').count(), 5);
        for (let role = 0; role < 5; role++) {
            const index = team * 5 + role;
            const raw = replayPlayer(`ReplayPlayer${index}`, 'KR1', index);
            const riotId = `${raw.RIOT_ID_GAME_NAME}#${raw.RIOT_ID_TAG_LINE}`;
            const row = table.getByRole('row').filter({ has: page.getByText(riotId, { exact: true }) });
            await row.getByText(raw.RIOT_ID_GAME_NAME, { exact: true }).waitFor();
            const position = ['탑', '정글', '미드', '원딜', '서폿'][role]!;
            const kda = `${index} / 2 / 7`;
            await row.getByText(position, { exact: true }).waitFor();
            const champion = championPreferenceCatalog.find((entry) => entry.id === raw.SKIN)!.name;
            await row.getByText(champion, { exact: false }).waitFor();
            await row.getByRole('cell', { name: kda }).waitFor();
            rows.push({ name, outcome, riotId, position, champion, kda });
        }
    }
    const response = page.waitForResponse((reply) => reply.url().endsWith('?/upload'));
    await dialog.getByRole('button', { name: '이대로 등록', exact: true }).press('Enter');
    assert.equal((await response).status(), 200);
    await dialog.getByText(new RegExp(`${order}세트로 기록했어요$`)).waitFor();
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForURL((url) => url.searchParams.has('game'));
    await page.locator('#game-heading').getByText(`${order}세트`, { exact: true }).waitFor();
    for (const { name, outcome, riotId, position, champion, kda } of rows) {
        const table = page.getByRole('table', { name: `${name} 선수` });
        await table.getByText(outcome, { exact: true }).waitFor();
        const row = table.getByRole('row').filter({ has: page.getByText(riotId, { exact: true }) });
        await row.getByText(position, { exact: true }).waitFor();
        await row.getByText(champion, { exact: true }).waitFor();
        await row.getByText(kda, { exact: false }).waitFor();
    }
}

test(
    '미리보기 응답 유실은 읽기만 재시도하고 등록 응답 유실은 실제 경기 상태를 다시 확인한다',
    { timeout: 60_000 },
    async (t) => {
        const browser = await chromium.launch();
        t.after(() => browser.close());
        const fixture = await createHttpMatchResultFixture(t);
        const context = await browser.newContext();
        await sessionContext(context, fixture, fixture.participant.cookie);
        const page = await context.newPage();
        page.setDefaultTimeout(10_000);
        await page.goto(fixture.url + fixture.path);
        const dialog = await prepareUpload(page, fixture.file(), true);
        await page.route(
            (url) => url.search === '?/preview',
            (route) => route.abort(),
            { times: 1 }
        );
        await dialog.getByRole('button', { name: '미리보기', exact: true }).click();
        await dialog.getByText(/미리보기를 불러오지 못했어요/).waitFor();
        assert.equal(await dialog.getByText('기록 여부를 확인하지 못했어요').count(), 0);
        assert.equal((await fixture.db.select().from(schema.games)).length, 0);
        await preview(dialog);

        let writes = 0;
        await page.route(
            (url) => url.search === '?/upload',
            async (route) => {
                writes++;
                const response = await route.fetch({
                    headers: {
                        ...route.request().headers(),
                        origin: fixture.origin,
                        'x-forwarded-proto': 'https'
                    }
                });
                assert.equal(response.status(), 200);
                await route.abort();
            }
        );
        await dialog.getByRole('button', { name: '이대로 등록', exact: true }).dblclick();
        await dialog.getByText(/기록 여부를 확인하지 못했어요/).waitFor();
        assert.equal(writes, 1);
        assert.equal(await dialog.getByRole('button', { name: '이대로 등록', exact: true }).count(), 0);
        await dialog.getByRole('button', { name: '닫기', exact: true }).press('Enter');
        await page.locator('#game-heading').getByText('1세트', { exact: true }).waitFor();
        assert.equal((await fixture.db.select().from(schema.games)).length, 1);
        assert.equal((await fixture.db.select().from(schema.mmrLedgerEntries)).length, 10);
    }
);

for (const width of [1440, 390]) {
    test(
        `출전자가 정상 ROFL을 기록하고 관리자가 취소·복구한 뒤 같은 라인업으로 경기를 끝낸다: ${width}px`,
        { timeout: 90_000 },
        async (t) => {
            const browser = await chromium.launch({ headless: true });
            // 브라우저를 앱·DB보다 먼저 닫아 정리 중의 남은 요청을 방지한다.
            t.after(() => browser.close());
            const fixture = await createHttpMatchResultFixture(t, [championCatalogUpstream]);
            // 마이그레이션 전에 시작해 예정 진영이 없는 경기에서도 업로드·정정할 수 있다.
            await fixture.db
                .delete(schema.matchSetSides)
                .where(eq(schema.matchSetSides.matchId, fixture.match.id));
            await fixture.db.delete(schema.guildRiotAccounts);
            await fixture.db.update(schema.scrimParticipants).set({ riotAccountId: null });
            const publications = await fixture.db.select().from(schema.discordPublicationJobs);
            const viewport = { width, height: width === 390 ? 844 : 1000 };
            const participant = await browser.newContext({ viewport, hasTouch: width === 390 });
            const manager = await browser.newContext({ viewport, hasTouch: width === 390 });
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
            const draft = await prepareUpload(page, fixture.file());
            await draft.getByRole('button', { name: 'fixture.rofl 선택 해제', exact: true }).click();
            assert.equal(await draft.getByRole('checkbox').count(), 0);
            assert.equal(
                await draft.getByRole('button', { name: '미리보기', exact: true }).isDisabled(),
                true
            );
            await draft.getByRole('radio', { name: '1팀', exact: true }).check();
            await draft.getByRole('checkbox', { checked: false }).waitFor();
            await draft.getByRole('checkbox').press('Space');
            const selectedFile = fixture.file();
            await draft.locator('input[type="file"]').setInputFiles({
                name: selectedFile.name,
                mimeType: 'application/octet-stream',
                buffer: Buffer.from(await selectedFile.arrayBuffer())
            });
            await draft.getByRole('checkbox', { checked: false }).waitFor();
            assert.equal(
                await draft.getByRole('button', { name: '미리보기', exact: true }).isDisabled(),
                true
            );
            await draft.getByRole('checkbox').press('Space');
            await preview(draft);
            await draft.getByRole('table', { name: '블루 1팀 승리' }).waitFor();
            await draft.getByRole('button', { name: '수정', exact: true }).press('Enter');
            await draft.getByRole('button', { name: 'fixture.rofl 선택 해제' }).waitFor();
            await draft.getByRole('checkbox', { checked: true }).waitFor();
            assert.equal(await draft.getByRole('button', { name: '이대로 등록' }).count(), 0);
            await draft.getByRole('radio', { name: '2팀', exact: true }).check();
            await draft.getByRole('checkbox').check();
            await preview(draft);
            await draft.getByRole('table', { name: '블루 2팀 승리' }).waitFor();
            assert.equal(await draft.getByText('새 연결', { exact: true }).count(), 10);
            await draft.getByRole('button', { name: '수정', exact: true }).press('Enter');
            await draft.getByRole('button', { name: 'fixture.rofl 선택 해제' }).click();
            await draft.locator('input[type=file]').setInputFiles({
                name: '교체.rofl',
                mimeType: selectedFile.type,
                buffer: replayBytes(
                    fixture.identities.map((person, index) => ({
                        ...replayPlayer(person.gameName, person.tagLine, index),
                        CHAMPIONS_KILLED: '14'
                    }))
                )
            });
            await draft.getByRole('radio', { name: '1팀', exact: true }).check();
            await draft.getByRole('checkbox').check();
            await preview(draft);
            await draft.getByText('교체.rofl', { exact: true }).waitFor();
            assert.equal(await draft.getByRole('cell', { name: '14 / 2 / 7', exact: true }).count(), 10);
            await draft.getByRole('button', { name: '닫기', exact: true }).click();
            await draft.waitFor({ state: 'hidden' });
            assert.equal((await fixture.db.select().from(schema.games)).length, 0);
            assert.equal((await fixture.db.select().from(schema.guildRiotAccounts)).length, 0);
            assert.equal((await fixture.db.select().from(schema.roflMetadata)).length, 0);
            assert.equal((await fixture.db.select().from(schema.mmrLedgerEntries)).length, 0);
            assert.deepEqual(await fixture.db.select().from(schema.discordPublicationJobs), publications);
            await upload(page, fixture.file(), 1, true);
            assert.equal((await fixture.db.select().from(schema.guildRiotAccounts)).length, 10);
            const [first] = await fixture.db.select().from(schema.games);
            assert.equal(first!.status, 'completed');
            const players = await fixture.db.select().from(schema.gameParticipants);
            assert.equal(players.length, 10);
            for (const player of players) {
                const { gameName, tagLine } = fixture.identities[player.roflParticipantIndex]!;
                assert.equal(player.displayName, gameName);
                assert.equal(player.riotGameName, gameName);
                assert.equal(player.riotTagLine, tagLine);
            }
            assert.equal((await fixture.db.select().from(schema.mmrLedgerEntries)).length, 10);
            assert.equal(
                await page.getByRole('button', { name: '마지막 세트 취소', exact: true }).count(),
                0
            );

            // 다음 세트에 같은 파일을 넣으면 기존 결과·MMR은 유지되고 현재 상태 확인을 안내한다.
            const duplicate = await prepareUpload(page, fixture.file());
            const rejected = page.waitForResponse((reply) => reply.url().endsWith('?/preview'));
            await duplicate.getByRole('button', { name: '미리보기', exact: true }).click();
            assert.equal((await rejected).status(), 409);
            await duplicate
                .getByRole('alert')
                .filter({ hasText: '닫으면 현재 경기 상태를 다시 확인해요.' })
                .waitFor();
            assert.equal(await duplicate.getByRole('button', { name: '이대로 등록' }).count(), 0);
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
                            ? { ROFL_USER_REQUEST_LIMIT: '2', ROFL_RATE_WINDOW_MS: '10000' }
                            : { ROFL_PARSE_TIMEOUT_MS: '1' }
                });
                if (failure === 'rate') {
                    const first = await fixture.record();
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
                await page.goto(fixture.url + fixture.path);
                await page.waitForTimeout(700);
                const dialog = await prepareUpload(page, fixture.file(1_900_000), failure === 'timeout');
                const rejected = page.waitForResponse((reply) => reply.url().endsWith('?/preview'));
                await dialog.getByRole('button', { name: '미리보기', exact: true }).click();
                const response = await rejected;
                assert.equal(response.status(), failure === 'rate' ? 429 : 503);
                await dialog.getByRole('button', { name: 'fixture.rofl 선택 해제', exact: true }).waitFor();
                await dialog
                    .getByRole('button', { name: '미리보기', exact: true })
                    .and(dialog.locator('button:enabled'))
                    .waitFor();
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
                if (failure === 'rate') {
                    const retryAfter = Number(response.headers()['retry-after']);
                    assert.ok(retryAfter > 0 && retryAfter <= 10);
                    await page.waitForTimeout(retryAfter * 1000 + 100);
                    const retried = page.waitForResponse((reply) => reply.url().endsWith('?/preview'));
                    // 파일과 진영을 다시 고르지 않고 같은 입력으로 재시도한다.
                    await dialog.getByRole('button', { name: '미리보기', exact: true }).press('Enter');
                    assert.equal((await retried).status(), 200);
                    await dialog.getByRole('button', { name: '이대로 등록', exact: true }).press('Enter');
                    await dialog.getByText(/2세트로 기록했어요$/).waitFor();
                    assert.equal((await fixture.db.select().from(schema.games)).length, 2);
                }
                assert.deepEqual(errors, []);
            }
        );
