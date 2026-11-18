import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { Page } from 'playwright';
import { eq } from 'drizzle-orm';
import * as schema from '../../src/lib/server/db/schema.ts';
import { createBracketDraft } from '../../src/lib/server/scrims/bracket.ts';
import { HTTP_IDS, assertAction } from '../api/support/http.ts';
import { prepareHttpAuctionFixture } from '../api/support/http-auction-fixtures.ts';
import { createBrowserFixture } from './support/browser.ts';

const captures: Record<string, unknown>[] = [];

async function capture(page: Page, name: string) {
    const directory = process.env.MSM2_AUCTION_CAPTURE_DIR;
    if (!directory) return;
    await mkdir(directory, { recursive: true });
    const bytes = await page.screenshot({
        path: resolve(directory, name + '.png'),
        fullPage: true,
        animations: 'disabled'
    });
    captures.push({
        file: name + '.png',
        url: new URL(page.url()).pathname,
        viewport: page.viewportSize(),
        theme: await page.evaluate(() => document.documentElement.dataset.mode),
        sha256: createHash('sha256').update(bytes).digest('hex')
    });
    await writeFile(resolve(directory, 'auction-images.json'), JSON.stringify(captures, null, 4) + '\n');
}

test(
    '390px 경매는 마지막 팀 입찰 중에도 현재 후보를 유지하고 조정 종료를 구분한다',
    { timeout: 60_000 },
    async (t) => {
        const f = await createBrowserFixture(t, { width: 390, userId: HTTP_IDS.manager });
        await f.page.setViewportSize({ width: 390, height: 844 });
        const a = await prepareHttpAuctionFixture(f);
        assertAction(await a.setup(), 200);
        assertAction(await a.action('start'), 200);
        assertAction(await a.action('draw'), 200);
        await f.page.clock.install();
        await f.page.goto(f.url + a.path);
        const candidate = f.page.getByRole('group', { name: /^현재 매물 / });
        const bid = f.page.getByRole('textbox', { name: '2팀 입찰가', exact: true });
        await candidate.waitFor();
        await bid.evaluate((node) => node.scrollIntoView({ block: 'start', behavior: 'instant' }));
        await bid.focus();
        const candidateBox = await candidate.boundingBox();
        const bidBox = await bid.boundingBox();
        assert.ok(candidateBox && bidBox);
        const header = await f.page.getByRole('banner').boundingBox();
        assert.ok(header && Math.abs(candidateBox.y - (header.y + header.height)) <= 1);
        assert.ok(bidBox.y >= candidateBox.y + candidateBox.height);
        const bidTitle = await f.page.getByText('2팀 입찰가', { exact: true }).boundingBox();
        assert.ok(bidTitle && bidTitle.y >= candidateBox.y + candidateBox.height);
        assert.equal(await candidate.count(), 1);
        const candidates = f.page.getByRole('button', { name: '후보 목록', exact: true });
        assert.equal(await candidates.count(), 1);
        assert.ok((await candidates.boundingBox())!.y > bidBox.y);
        const bar = candidate.getByRole('progressbar', { name: '남은 입찰 조정 시간' });
        const barBox = await bar.boundingBox();
        assert.ok(barBox && Math.abs(barBox.y - candidateBox.y) <= 2);
        const surface = () => candidate.evaluate((node) => getComputedStyle(node).backgroundColor);
        const initialColor = await surface();
        await f.page.emulateMedia({ reducedMotion: 'no-preference' });
        const fill = bar.locator(':scope > div');
        const widthBefore = (await fill.boundingBox())!.width;
        await f.page.waitForFunction(
            (width) =>
                document.querySelector('[role="progressbar"] > div')!.getBoundingClientRect().width <
                width - 1,
            widthBefore
        );
        await f.page.emulateMedia({ reducedMotion: 'reduce' });
        await f.page.clock.fastForward(5000);
        assert.equal(await surface(), initialColor);
        const reducedWidth = (await fill.boundingBox())!.width;
        assert.ok(reducedWidth > 0 && reducedWidth < widthBefore);
        await f.page.clock.fastForward(10_200);
        const timer = candidate.getByText('조정 시간 종료', { exact: true });
        await timer.waitFor();
        assert.equal(await bar.getAttribute('aria-valuenow'), '0');
        assert.equal(await surface(), initialColor);
        const timerBox = await timer.boundingBox();
        assert.ok(timerBox && timerBox.y >= candidateBox.y);
        assert.ok(timerBox.y + timerBox.height <= candidateBox.y + candidateBox.height);
        assert.equal(await f.page.getByText('조정 시간 종료', { exact: true }).count(), 1);
        assert.equal(await candidate.count(), 1);
        await bid.fill('15');
        await f.page
            .getByRole('button', { name: '+10 2팀 입찰가 10포인트 올리기', exact: true })
            .press('Enter');
        assert.equal(await bid.inputValue(), '25');
        assert.equal(await bar.getAttribute('aria-valuenow'), '10');
        assert.equal(await f.page.getByRole('button', { name: '낙찰 2팀', exact: true }).isEnabled(), true);
        await capture(f.page, 'manager-candidate-mobile-primary');

        // 넓은 화면에서는 기존 후보 왼쪽·팀 오른쪽 구성을 유지한다.
        await f.page.setViewportSize({ width: 1440, height: 1000 });
        await f.page.evaluate(() => window.scrollTo(0, 0));
        const desktopCandidate = await candidate.boundingBox();
        const desktopBid = await bid.boundingBox();
        assert.ok(desktopCandidate && desktopBid);
        assert.ok(desktopCandidate.x + desktopCandidate.width < desktopBid.x);
        assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        const point = (box: NonNullable<typeof desktopBid>) =>
            [box.x + box.width / 2, box.y + box.height / 2] as const;
        await f.page.mouse.move(...point(desktopCandidate));
        await f.page.mouse.down();
        const [x, y] = point(desktopBid);
        await f.page.mouse.move(x, y, { steps: 12 });
        await f.page.mouse.move(x + 1, y);
        const team = f.page.getByRole('region', { name: /^2팀/ });
        await f.page.waitForFunction(([node, color]) => getComputedStyle(node).backgroundColor === color, [
            await team.elementHandle(),
            initialColor
        ] as const);
        await f.page.mouse.up();
        await f.page.getByRole('list', { name: '2팀 팀원' }).getByText('수동', { exact: true }).waitFor();
        await f.page.getByRole('button', { name: '다음 후보' }).click();
        await bid.hover();
        await bid.click();
        await f.page.keyboard.type('30');
        assert.equal(await bid.inputValue(), '30');
        assert.deepEqual(f.errors, []);
    }
);

for (const width of [390, 1440]) {
    test(`후보 목록에서 대기자를 팀에 배치한다: ${width}px`, { timeout: 60_000 }, async (t) => {
        const f = await createBrowserFixture(t, { width, userId: HTTP_IDS.manager });
        const a = await prepareHttpAuctionFixture(f);
        assertAction(await a.setup(), 200);
        assertAction(await a.action('start'), 200);
        if (width === 1440) assertAction(await a.action('draw'), 200);
        await f.page.goto(f.url + a.path, { waitUntil: 'networkidle' });
        const bid = f.page.getByRole('textbox', { name: '2팀 입찰가', exact: true });
        if (width === 1440) await bid.fill('25');
        await f.page.getByRole('button', { name: '후보 목록', exact: true }).press('Enter');
        const dialog = f.page.getByRole('dialog', { name: '후보 목록' });
        await dialog
            .getByRole('button', { name: /^1팀 배치/ })
            .last()
            .press('Enter');
        await dialog.waitFor({ state: 'hidden' });
        await f.page.getByRole('list', { name: '1팀 팀원' }).getByText('수동', { exact: true }).waitFor();
        if (width === 1440) assert.equal(await bid.inputValue(), '25');
        else await f.page.getByText('후보 대기', { exact: true }).waitFor();
        assert.deepEqual(f.errors, []);
    });
}

test(
    '390px 대진의 선택 팀 안내는 아래 배치 자리에서도 보이고 Escape로 해제된다',
    { timeout: 60_000 },
    async (t) => {
        const f = await createBrowserFixture(t, { width: 390, userId: HTTP_IDS.manager });
        await f.page.setViewportSize({ width: 390, height: 844 });
        const [scrim] = await f.db
            .insert(schema.scrims)
            .values({
                guildId: HTTP_IDS.guild,
                title: '대진 선택 안내',
                status: 'ready',
                formationMethod: 'manual',
                teamCount: 4,
                mmrSeasonId: f.season.id
            })
            .returning();
        await f.db.insert(schema.scrimTeams).values(
            [1, 2, 3, 4].map((ordinal) => ({
                scrimId: scrim!.id,
                ordinal,
                name: `${ordinal}팀`
            }))
        );
        await f.db.transaction((tx) => createBracketDraft(tx, scrim!));
        await f.page.goto(`${f.url}/g/${HTTP_IDS.guild}/scrims/${scrim!.id}/bracket`);
        // 경기 방식의 클라이언트 선택 상태가 붙은 뒤 입력해 SSR과 초기화 사이의 경합을 피한다.
        await f.page
            .getByRole('group', { name: '준결승 경기 방식', exact: true })
            .getByRole('radio', { name: '3전 2선승', exact: true, checked: true })
            .waitFor();
        await f.page.getByRole('button', { name: '1팀', exact: true }).press('Enter');
        await f.page.getByRole('button', { name: '1팀', exact: true, pressed: true }).waitFor();
        const target = f.page
            .getByRole('article', { name: '준결승 B', exact: true })
            .getByRole('button', { name: /1팀 배치 위치 준결승 B 오른쪽/ });
        await target.evaluate((node) => node.scrollIntoView({ block: 'start', behavior: 'instant' }));
        await target.focus();
        const reminder = f.page.locator('[aria-live="polite"]').filter({ hasText: '1팀 선택됨' });
        const reminderBox = await reminder.boundingBox();
        const targetBox = await target.boundingBox();
        assert.ok(reminderBox && targetBox);
        const header = await f.page.getByRole('banner').boundingBox();
        assert.ok(header && Math.abs(reminderBox.y - (header.y + header.height)) <= 1);
        assert.ok(targetBox.y >= reminderBox.y + reminderBox.height);
        assert.equal(await f.page.getByRole('button', { name: '선택 취소', exact: true }).count(), 1);
        await capture(f.page, 'bracket-selection-mobile-primary');
        await target.press('Escape');
        assert.equal(await reminder.count(), 0);
        assert.equal(await f.page.getByRole('button', { name: /1팀 배치 위치/ }).count(), 0);
        assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.deepEqual(f.errors, []);
    }
);

test('관리자는 첫 후보 추첨과 직전 작업 취소를 키보드로 실행한다: 1440px', { timeout: 60_000 }, async (t) => {
    const f = await createBrowserFixture(t, { width: 1440, userId: HTTP_IDS.manager });
    const a = await prepareHttpAuctionFixture(f);
    assertAction(await a.setup(), 200);
    assertAction(await a.action('start'), 200);
    await f.page.goto(f.url + a.path);
    const drawn = f.page.waitForResponse((response) => response.url().endsWith('?/draw'));
    const next = f.page.getByRole('button', { name: '다음 후보', exact: true });
    await next.focus();
    await next.press('Enter');
    assert.equal((await drawn).status(), 200);
    const undo = f.page.getByRole('button', { name: '되돌리기', exact: true });
    await undo.waitFor();
    await capture(f.page, 'manager-draw-desktop-primary');
    await undo.focus();
    await undo.press('Enter');
    const dialog = f.page.getByRole('dialog', { name: '마지막 작업 되돌리기', exact: true });
    await dialog.getByRole('button', { name: '확인', exact: true }).waitFor();
    await capture(f.page, 'manager-confirm-desktop-primary');
    const reverted = f.page.waitForResponse((response) => response.url().endsWith('?/revert'));
    await dialog.getByRole('button', { name: '확인', exact: true }).press('Enter');
    assert.equal((await reverted).status(), 200);
    await f.page.getByText('후보 대기', { exact: true }).waitFor();
    assert.equal(await undo.count(), 0);
    assert.equal((await f.db.select().from(schema.auctionQueueEntries)).length, 8);
    assert.equal(
        (await f.db.select().from(schema.auctionActions)).filter((action) => action.kind === 'revert').length,
        1
    );
    await capture(f.page, 'manager-undo-desktop-primary');
    // 낙찰 이후의 추첨만 취소해도 남은 영입을 초기화할 수 있어야 한다.
    for (let index = 0; index < 2; index++) {
        const response = f.page.waitForResponse((reply) => reply.url().endsWith('?/draw'));
        await next.click();
        assert.equal((await response).status(), 200);
        if (index === 0) {
            await f.page.getByRole('textbox', { name: '1팀 입찰가', exact: true }).fill('15');
            const awarded = f.page.waitForResponse((reply) => reply.url().endsWith('?/award'));
            await f.page.getByRole('button', { name: '낙찰 1팀', exact: true }).click();
            assert.equal((await awarded).status(), 200);
            await f.page.getByText(/^85P\s*남음$/).waitFor();
        }
    }
    await undo.click();
    const undoDraw = f.page.waitForResponse((reply) => reply.url().endsWith('?/revert'));
    await dialog.getByRole('button', { name: '확인', exact: true }).click();
    assert.equal((await undoDraw).status(), 200);
    await f.page.getByText('후보 대기', { exact: true }).waitFor();
    assert.equal(await f.page.getByRole('button', { name: '초기화', exact: true }).isEnabled(), true);
    assert.equal(await f.page.getByText(/^85P\s*남음$/).count(), 1);
    assert.equal(
        (await f.db.select().from(schema.auctionAcquisitions)).filter((entry) => !entry.voidedAt).length,
        1
    );
    await capture(f.page, 'manager-award-preserved-undo-desktop-primary');
    assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(f.errors, []);
});

test(
    '390px 공개 경매는 자동 갱신·실패 복구·일시 중지와 페이지 이탈을 읽기 전용으로 처리한다',
    { timeout: 90_000 },
    async (t) => {
        const f = await createBrowserFixture(t, { width: 390 });
        await f.page.setViewportSize({ width: 390, height: 844 });
        const a = await prepareHttpAuctionFixture(f);
        // 공개 이름을 검증하는 후보는 같은 서버의 활성 사용자와 연결한다. 사용자 없는 과거 이름은 공개하지 않는다.
        const users = a.people.map((person, index) => ({
            id: String(970000000000002100n + BigInt(index)),
            username: person.displayName
        }));
        await f.db.insert(schema.users).values(users);
        await f.db
            .insert(schema.guildMembers)
            .values(
                users.map((user) => ({ guildId: HTTP_IDS.guild, userId: user.id, syncedAt: new Date() }))
            );
        for (const [index, person] of a.people.entries())
            await f.db
                .update(schema.scrimParticipants)
                .set({ userId: users[index]!.id })
                .where(eq(schema.scrimParticipants.id, person.id));
        assertAction(await a.setup(), 200);
        await f.page.clock.install();
        let requests = 0;
        let posts = 0;
        let failNext = false;
        let hold: Promise<void> | null = null;
        let release: (() => void) | undefined;
        f.page.on('request', (request) => {
            if (request.method() === 'POST') posts++;
            if (request.url().endsWith('/auction/live')) requests++;
        });
        await f.context.route('**/auction/live', async (route) => {
            if (hold) await hold;
            if (failNext) {
                failNext = false;
                await route.fulfill({
                    status: 503,
                    contentType: 'application/json',
                    body: '{"message":"fixture unavailable"}'
                });
            } else {
                // 의도적으로 중단한 지연 응답은 브라우저가 이미 취소했을 수 있다.
                await route.fallback().catch(() => {});
            }
        });
        const poll = async (milliseconds: number, status = 200) => {
            const response = f.page.waitForResponse((reply) => reply.url().endsWith('/auction/live'));
            await f.page.clock.fastForward(milliseconds);
            assert.equal((await response).status(), status);
        };
        await f.page.goto(f.url + a.path);
        await f.page.getByRole('button', { name: '새로고침', exact: true }).waitFor();
        assert.equal(await f.page.getByRole('button', { name: '경매 시작', exact: true }).count(), 0);
        assertAction(await a.action('start'), 200);
        assertAction(await a.action('draw'), 200);
        const [lot] = await f.db
            .select()
            .from(schema.auctionLots)
            .where(eq(schema.auctionLots.status, 'open'));
        const person = a.people.find((entry) => entry.id === lot!.scrimParticipantId)!;
        await poll(5_100);
        await f.page.getByRole('group', { name: '현재 매물 ' + person.displayName, exact: true }).waitFor();
        assertAction(await a.action('award', { lotId: lot!.id, teamId: a.teams[0]!.id, price: '15' }), 200);
        await poll(5_100);
        await f.page.getByText(/^85P\s*남음$/).waitFor();
        await capture(f.page, 'guest-snapshot-mobile-primary');
        failNext = true;
        await poll(5_100, 503);
        const error = f.page
            .getByRole('status')
            .filter({ hasText: '마지막으로 확인한 내용을 표시하고 있어요.' });
        await error.waitFor();
        assert.equal(await f.page.getByText(/^85P\s*남음$/).count(), 1);
        await capture(f.page, 'guest-error-mobile-primary');
        const failedCount = requests;
        await f.page.clock.fastForward(5_000);
        assert.equal(requests, failedCount);
        await poll(5_100);
        await error.waitFor({ state: 'hidden' });

        // 수동 조회가 끝없이 지연돼도 제한 시간 뒤 조작과 다음 자동 재시도를 복구한다.
        hold = new Promise<void>((resolve) => {
            release = resolve;
        });
        const stalled = f.page.waitForRequest((request) => request.url().endsWith('/auction/live'));
        const manualRefresh = f.page.getByRole('button', { name: '새로고침', exact: true });
        await manualRefresh.click();
        await stalled;
        assert.equal(await manualRefresh.isDisabled(), true);
        const stalledCount = requests;
        await f.page.clock.runFor(15_100);
        await error.waitFor();
        assert.equal(await manualRefresh.isEnabled(), true);
        assert.equal(requests, stalledCount);
        assert.equal(await f.page.getByText(/^85P\s*남음$/).count(), 1);
        hold = null;
        release!();
        await poll(10_100);
        await error.waitFor({ state: 'hidden' });

        hold = new Promise<void>((resolve) => {
            release = resolve;
        });
        const held = f.page.waitForRequest((request) => request.url().endsWith('/auction/live'));
        await f.page.clock.fastForward(5_100);
        await held;
        const heldCount = requests;
        await f.page.clock.fastForward(14_000);
        assert.equal(requests, heldCount);
        await f.page.getByRole('button', { name: '자동 갱신 끄기', exact: true }).click();
        hold = null;
        release!();
        await f.page.getByRole('button', { name: '자동 갱신 켜기', exact: true }).waitFor();
        await f.page.clock.fastForward(30_000);
        assert.equal(requests, heldCount);
        const manual = f.page.waitForResponse((reply) => reply.url().endsWith('/auction/live'));
        await f.page.getByRole('button', { name: '새로고침', exact: true }).click();
        assert.equal((await manual).status(), 200);
        const resumed = f.page.waitForResponse((reply) => reply.url().endsWith('/auction/live'));
        await f.page.getByRole('button', { name: '자동 갱신 켜기', exact: true }).press('Space');
        assert.equal((await resumed).status(), 200);

        await f.page.evaluate(() => {
            Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
            document.dispatchEvent(new Event('visibilitychange'));
        });
        const hiddenCount = requests;
        await f.page.clock.fastForward(30_000);
        assert.equal(requests, hiddenCount);
        const visible = f.page.waitForResponse((reply) => reply.url().endsWith('/auction/live'));
        await f.page.evaluate(() => {
            Reflect.deleteProperty(document, 'visibilityState');
            document.dispatchEvent(new Event('visibilitychange'));
        });
        assert.equal((await visible).status(), 200);
        await f.context.setOffline(true);
        const offlineCount = requests;
        await f.page.clock.fastForward(30_000);
        assert.equal(requests, offlineCount);
        const online = f.page.waitForResponse((reply) => reply.url().endsWith('/auction/live'));
        await f.context.setOffline(false);
        assert.equal((await online).status(), 200);

        await f.page.evaluate(() => localStorage.setItem('theme-mode', 'dark'));
        await f.page.reload();
        await f.page.getByText(/^85P\s*남음$/).waitFor();
        assert.equal(await f.page.evaluate(() => document.documentElement.dataset.mode), 'dark');
        await capture(f.page, 'guest-snapshot-mobile-dark');
        hold = new Promise<void>((resolve) => {
            release = resolve;
        });
        const leaving = f.page.waitForRequest((request) => request.url().endsWith('/auction/live'));
        await f.page.clock.fastForward(5_100);
        await leaving;
        await f.page.getByRole('link', { name: '문서', exact: true }).click();
        await f.page.waitForURL('**/docs');
        hold = null;
        release!();
        const leftCount = requests;
        await f.page.clock.fastForward(30_000);
        assert.equal(requests, leftCount);
        assert.equal(posts, 0);
        assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.deepEqual(f.errors, []);
    }
);
