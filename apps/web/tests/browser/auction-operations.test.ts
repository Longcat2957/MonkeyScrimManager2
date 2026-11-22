import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { Locator, Page } from 'playwright';
import { eq } from 'drizzle-orm';
import { createCaptainRace, FINISH_Y } from '../../src/lib/features/scrims/captain-pinball.ts';
import type { Database } from '../../src/lib/server/db/types.ts';
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

// 공개 이름을 검증하는 후보는 같은 서버의 활성 사용자와 연결한다. 사용자 없는 과거 이름은 공개하지 않는다.
async function linkAuctionNames(db: Database, people: { id: string; displayName: string }[]) {
    const users = people.map((person, index) => ({
        id: String(970000000000002100n + BigInt(index)),
        username: person.displayName
    }));
    await db.insert(schema.users).values(users);
    await db
        .insert(schema.guildMembers)
        .values(users.map((user) => ({ guildId: HTTP_IDS.guild, userId: user.id, syncedAt: new Date() })));
    for (const [index, person] of people.entries())
        await db
            .update(schema.scrimParticipants)
            .set({ userId: users[index]!.id })
            .where(eq(schema.scrimParticipants.id, person.id));
}

// 같은 난수열로 별도 경기를 완주해 결과 UI와 무관한 실제 도착 순서를 얻는다.
async function drawPinball(button: Locator, count: number, seed: number) {
    const rolls: number[] = [];
    const race = createCaptainRace(count, () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const roll = seed / 2 ** 32;
        rolls.push(roll);
        return roll;
    });
    for (let step = 0; step < 66 * 60 && race.finishOrder.length < count; step++) race.step();
    assert.equal(race.finishOrder.length, count);
    const consumed = await button.evaluate((node, rolls) => {
        const original = Math.random;
        let index = 0;
        try {
            Math.random = () => rolls[index++]!;
            (node as HTMLButtonElement).click();
        } finally {
            Math.random = original;
        }
        return index;
    }, rolls);
    assert.equal(consumed, rolls.length);
    return race.finishOrder;
}

async function assertPinballTail(dialog: Locator, order: number[], teams: string[]) {
    const names = await dialog.locator('[data-marble-label] [data-display-name]').allTextContents();
    assert.equal(names.length, order.length);
    const crossed = await dialog
        .locator('[data-marble]')
        .evaluateAll(
            (nodes, finish) =>
                nodes.filter((node) => (node as SVGGElement).transform.baseVal.getItem(0).matrix.f >= finish)
                    .length,
            FINISH_Y
        );
    assert.equal(crossed, order.length);
    const expected = order.slice(-teams.length).map((index) => names[index]!);
    const rows = dialog.getByRole('list', { name: '도착 순서' }).getByRole('listitem');
    assert.equal(await rows.count(), teams.length);
    assert.deepEqual(await rows.locator('strong').allTextContents(), expected);
    for (const [i, team] of teams.entries()) {
        const rank = String(order.length - teams.length + i + 1).padStart(2, '0');
        await rows.nth(i).getByText(rank, { exact: true }).waitFor();
        await rows.nth(i).getByText(team, { exact: true }).waitFor();
    }
    return expected;
}

test(
    '팀장 핀볼은 제외한 참가자 없이 경기를 진행하고 재추첨해도 수동 팀장과 저장 전 초안을 보존한다',
    { timeout: 90_000 },
    async (t) => {
        const f = await createBrowserFixture(t, { width: 1440, userId: HTTP_IDS.manager });
        const a = await prepareHttpAuctionFixture(f, 4);
        const [standby] = await f.db
            .insert(schema.scrimParticipants)
            .values({ scrimId: a.scrim.id, displayName: '대기 참가자' })
            .returning();
        await f.db
            .insert(schema.scrimParticipantRegistrations)
            .values({ scrimParticipantId: standby!.id, status: 'standby' });
        await linkAuctionNames(f.db, [...a.people, standby!]);
        const { page } = f;
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.goto(f.url + a.path, { waitUntil: 'networkidle' });
        const posts: string[] = [];
        page.on('request', (request) => {
            if (request.method() === 'POST') posts.push(new URL(request.url()).search);
        });
        const revision = await a.revision();
        const team = (name: string) => page.getByRole('region', { name, exact: true });
        const candidate = (name: string) =>
            page.getByRole('button').filter({ has: page.getByText(name, { exact: true }) });
        const first = a.people[0]!.displayName;
        const fixed = a.people[1]!.displayName;
        // 중간 팀에만 수동 팀장을 남겨 첫 빈칸부터 순서대로 채우는지 확인한다.
        await candidate(first).click();
        await candidate(fixed).click();
        await candidate(first).click();
        const points = ['125', '246', '357', '468'];
        for (const [i, entry] of a.teams.entries()) {
            await team(entry.name).getByRole('textbox', { name: '시작 포인트' }).fill(points[i]!);
        }
        const draft = async (captains: string[]) => {
            for (const [i, entry] of a.teams.entries()) {
                await team(entry.name).getByText(captains[i]!, { exact: true }).waitFor();
                assert.equal(
                    await team(entry.name).getByRole('textbox', { name: '시작 포인트' }).inputValue(),
                    points[i]
                );
            }
        };
        const before = ['팀장 미지정', fixed, '팀장 미지정', '팀장 미지정'];
        const trigger = page.getByRole('button', { name: '핀볼 추첨', exact: true });
        const dialog = page.getByRole('dialog', { name: '팀장 핀볼 추첨', exact: true });
        const start = dialog.getByRole('button', { name: '추첨 시작', exact: true });
        const excluded = dialog.getByRole('checkbox', { name: first, exact: true });
        const camera = dialog.getByRole('combobox', { name: '중계 카메라' });
        const apply = dialog.getByRole('button', { name: '팀장 배정', exact: true });
        await trigger.press('Enter');
        await start.waitFor();
        assert.equal(await camera.count(), 0);
        assert.equal(await dialog.getByRole('checkbox').count(), 19);
        await dialog.getByText('추첨에서 제외할 참가자', { exact: true }).waitFor();
        await capture(page, 'captain-pinball-exclusions-desktop');
        const normalOrder = await drawPinball(start, 19, 29);
        await camera.waitFor();
        await dialog.getByText('마지막 3명 선발', { exact: true }).waitFor();
        await capture(page, 'captain-pinball-ready-desktop');
        const entrants = await camera.getByRole('option').allTextContents();
        assert.equal(await camera.locator('option:checked').textContent(), '자동 중계');
        assert.deepEqual(
            entrants
                .slice(1)
                .map((text) => text.replace(/^\d+ · /, ''))
                .sort(),
            a.people
                .map((person) => person.displayName)
                .filter((name) => name !== fixed)
                .sort()
        );
        await page.waitForFunction(
            () => {
                const viewport = document.querySelector<SVGRectElement>('dialog[open] [data-map-viewport]');
                return viewport && viewport.y.baseVal.value > viewport.height.baseVal.value;
            },
            undefined,
            { timeout: 66_000 }
        );
        const bib = normalOrder.at(-1)! + 1;
        await camera.selectOption({ label: entrants[bib]! });
        await dialog.getByRole('button', { name: '결과 바로 보기' }).waitFor();
        await page.waitForFunction(
            (bib) => {
                const board = document
                    .querySelector<HTMLDialogElement>('dialog[open]')
                    ?.querySelector<SVGSVGElement>('svg.board');
                const viewport = document.querySelector<SVGRectElement>('dialog[open] [data-map-viewport]');
                if (!board || !viewport) return false;
                const followed = board.querySelector<SVGGElement>(`[data-marble="${bib}"]`);
                if (!followed) return false;
                const y = followed.transform.baseVal.getItem(0).matrix.f;
                const top = viewport.y.baseVal.value;
                return (
                    y > board.viewBox.baseVal.height * 2 &&
                    top > 0 &&
                    y >= top &&
                    y <= top + viewport.height.baseVal.value
                );
            },
            bib,
            { timeout: 66_000 }
        );
        const runners = dialog.getByRole('list', { name: '현재 선발권 순위' }).locator('strong');
        const liveNames = await runners.allTextContents();
        assert.equal(new Set(liveNames).size, 3);
        assert.ok(liveNames.every((name) => a.people.some((person) => person.displayName === name)));
        await capture(page, 'captain-pinball-running-desktop');
        await apply.waitFor({ timeout: 66_000 });
        const openTeams = [0, 2, 3];
        const teamNames = openTeams.map((i) => a.teams[i]!.name);
        await assertPinballTail(dialog, normalOrder, teamNames);
        await apply.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        await draft(before);
        assert.deepEqual(posts, []);
        assert.equal(await a.revision(), revision);

        await page.setViewportSize({ width: 390, height: 844 });
        await trigger.click();
        await excluded.check();
        await dialog.getByText('18명 출전 · 마지막 3명 선발', { exact: true }).waitFor();
        await start.press('Enter');
        await camera.waitFor();
        assert.equal(await camera.getByRole('option').count(), 19);
        assert.equal(await camera.getByRole('option', { name: new RegExp(`${first}$`) }).count(), 0);
        const racingNames = await dialog.locator('[data-marble-label] [data-display-name]').allTextContents();
        assert.deepEqual(
            racingNames.sort(),
            a.people
                .map((person) => person.displayName)
                .filter((name) => name !== first && name !== fixed)
                .sort()
        );
        await dialog.getByText('레이스 중', { exact: true }).waitFor();
        await dialog.getByRole('img', { name: '코스 미니맵' }).waitFor();
        await capture(page, 'captain-pinball-running-mobile');
        await dialog.getByRole('button', { name: '결과 바로 보기' }).click();
        await apply.waitFor();
        await dialog.getByRole('button', { name: '다시 추첨', exact: true }).click();
        await start.waitFor();
        assert.equal(await camera.count(), 0);
        assert.equal(await excluded.isChecked(), true);
        await start.press('Enter');
        await camera.waitFor();
        assert.equal(await camera.getByRole('option', { name: new RegExp(`${first}$`) }).count(), 0);
        assert.equal(await camera.locator('option:checked').textContent(), '자동 중계');
        await dialog.getByRole('button', { name: '닫기' }).click();
        await draft(before);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await trigger.press('Enter');
        const order = await drawPinball(start, 19, 31);
        await apply.waitFor();
        assert.equal(await camera.isVisible(), false);
        const selected = await assertPinballTail(dialog, order, teamNames);
        const after = [...before];
        for (const [i, team] of openTeams.entries()) after[team] = selected[i]!;
        assert.equal(new Set(after).size, a.teams.length);
        assert.ok(after.every((name) => a.people.some((person) => person.displayName === name)));
        assert.equal(await dialog.evaluate((node) => node.scrollWidth > node.clientWidth), false);
        await capture(page, 'captain-pinball-result-mobile');
        await apply.press('Enter');
        await dialog.waitFor({ state: 'hidden' });
        await draft(after);
        const redraw = page
            .getByRole('region', { name: '팀장 후보' })
            .getByRole('button', { name: '다시 추첨', exact: true });
        await redraw.click();
        await start.press('Enter');
        await apply.waitFor();
        await dialog.getByRole('button', { name: '닫기' }).click();
        await draft(after);

        // 추첨된 팀장을 해제하고 직접 다시 지정하면 다음 추첨에서 보호한다.
        await candidate(after[0]!).click();
        await candidate(after[0]!).click();
        await redraw.click();
        const redrawnOrder = await drawPinball(start, 18, 32);
        await apply.waitFor();
        const redrawn = await assertPinballTail(dialog, redrawnOrder, teamNames.slice(1));
        after[2] = redrawn[0]!;
        after[3] = redrawn[1]!;
        assert.equal(new Set(after).size, 4);
        await apply.click();
        await draft(after);
        assert.deepEqual(posts, []);
        assert.equal(await a.revision(), revision);

        const saved = page.waitForResponse((reply) => reply.url().endsWith('?/setup'));
        await page.getByRole('button', { name: '설정 저장', exact: true }).click();
        assert.equal((await saved).status(), 200);
        await page.getByRole('button', { name: '저장됨', exact: true }).waitFor();
        assert.equal(await trigger.isDisabled(), true);
        assert.deepEqual(posts, ['?/setup']);
        await page.reload({ waitUntil: 'networkidle' });
        await draft(after);
        assert.equal(await page.getByRole('button', { name: '경매 시작', exact: true }).isEnabled(), true);
        await candidate(after[3]!).click();
        await trigger.click();
        const lastOrder = await drawPinball(start, 17, 33);
        await apply.waitFor();
        const [last] = await assertPinballTail(dialog, lastOrder, [a.teams[3]!.name]);
        await apply.press('Enter');
        after[3] = last!;
        await draft(after);
        assert.deepEqual(posts, ['?/setup']);
        assert.deepEqual(f.errors, []);
    }
);

test(
    '10인 팀장 핀볼은 열 명의 말풍선을 구분하고 마지막 두 도착자를 배정한다',
    { timeout: 45_000 },
    async (t) => {
        const f = await createBrowserFixture(t, { width: 390, userId: HTTP_IDS.manager });
        const a = await prepareHttpAuctionFixture(f);
        await linkAuctionNames(f.db, a.people);
        const { page } = f;
        await page.setViewportSize({ width: 390, height: 844 });
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.goto(f.url + a.path, { waitUntil: 'networkidle' });
        await page.clock.install({ time: new Date('2030-01-02T12:00:00Z') });
        await page.clock.pauseAt(new Date('2030-01-02T12:00:01Z'));
        await page.getByRole('button', { name: '핀볼 추첨', exact: true }).press('Enter');
        const dialog = page.getByRole('dialog', { name: '팀장 핀볼 추첨' });
        const start = dialog.getByRole('button', { name: '추첨 시작', exact: true });
        const exclude = dialog.getByRole('checkbox');
        await start.waitFor();
        assert.equal(await exclude.count(), 10);
        for (let i = 0; i < 8; i++) await exclude.nth(i).press('Space');
        assert.equal(await start.isEnabled(), true);
        await exclude.nth(8).press('Space');
        assert.equal(await start.isDisabled(), true);
        await dialog.getByText('팀장 2명을 뽑으려면 1명이 더 필요해요.', { exact: true }).waitFor();
        for (let i = 0; i < 9; i++) await exclude.nth(i).press('Space');
        const order = await drawPinball(start, 10, 17);
        await dialog.getByText('마지막 2명 선발', { exact: true }).waitFor();
        await page.clock.runFor(1200);
        const labels = dialog.locator('[data-marble-label]:visible');
        const boxes = await labels.evaluateAll((nodes) =>
            nodes.map((node) => {
                const { left, right, top, bottom } = node.getBoundingClientRect();
                const name = node.querySelector('[data-display-name]')?.textContent;
                return { left, right, top, bottom, name };
            })
        );
        assert.deepEqual(
            boxes.map((box) => box.name?.trim()).sort(),
            a.people.map((person) => person.displayName).sort()
        );
        const rear = await dialog.locator('[data-marble]').evaluateAll((nodes) =>
            nodes
                .map((node, i) => ({ i, y: (node as SVGGElement).transform.baseVal.getItem(0).matrix.f }))
                .sort((a, b) => b.y - a.y)
                .slice(-2)
                .map(({ i }) => i)
        );
        const standings = dialog.getByRole('list', { name: '현재 선발권 순위' });
        assert.deepEqual(
            await standings.locator('strong').allTextContents(),
            rear.map((i) => boxes[i]!.name)
        );
        const board = await dialog.locator('svg.board').boundingBox();
        assert.ok(board);
        for (const [i, box] of boxes.entries()) {
            assert.ok(box.right > box.left && box.bottom > box.top);
            assert.ok(
                box.left >= board.x - 1 && box.right <= board.x + board.width + 1,
                `가로 범위: ${box.name}`
            );
            assert.ok(
                box.top >= board.y - 1 && box.bottom <= board.y + board.height + 1,
                `세로 범위: ${box.name}`
            );
            for (const other of boxes.slice(i + 1)) {
                assert.ok(
                    box.right <= other.left + 0.5 ||
                        other.right <= box.left + 0.5 ||
                        box.bottom <= other.top + 0.5 ||
                        other.bottom <= box.top + 0.5,
                    `${box.name} / ${other.name}`
                );
            }
        }
        await capture(page, 'captain-pinball-ten-names-mobile');
        await dialog.getByRole('button', { name: '결과 바로 보기' }).press('Enter');
        await page.clock.runFor(1000);
        await dialog.getByRole('heading', { name: '팀장 2명 선발' }).waitFor();
        const winners = await assertPinballTail(
            dialog,
            order,
            a.teams.map((team) => team.name)
        );
        await dialog.getByRole('button', { name: '팀장 배정' }).press('Enter');
        for (const [i, team] of a.teams.entries()) {
            await page
                .getByRole('region', { name: team.name, exact: true })
                .getByText(winners[i]!, { exact: true })
                .waitFor();
        }
        assert.deepEqual(f.errors, []);
    }
);

test(
    '390px 경매는 마지막 팀 입찰 중에도 현재 후보를 유지하고 조정 종료를 구분한다',
    { timeout: 60_000 },
    async (t) => {
        const f = await createBrowserFixture(t, { width: 390, userId: HTTP_IDS.manager });
        await f.page.setViewportSize({ width: 390, height: 844 });
        const a = await prepareHttpAuctionFixture(f);
        assertAction(await a.setup(), 200);
        assertAction(await a.action('start'), 200);
        await f.page.clock.install();
        await f.page.goto(f.url + a.path);
        await f.page.getByText('후보 대기', { exact: true }).waitFor();
        const footer = f.page.locator('footer').last();
        const beforeDraw = await footer.evaluate((node) => node.getBoundingClientRect().top + scrollY);
        await f.page.getByRole('button', { name: '다음 후보' }).click();
        const candidate = f.page.getByRole('group', { name: /^현재 매물 / });
        const bid = f.page.getByRole('textbox', { name: '2팀 입찰가', exact: true });
        await candidate.waitFor();
        assert.equal(await footer.evaluate((node) => node.getBoundingClientRect().top + scrollY), beforeDraw);
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
        const timer = candidate.getByText('0초', { exact: true });
        await timer.waitFor();
        assert.equal(await bar.getAttribute('aria-valuenow'), '0');
        assert.equal(await surface(), initialColor);
        const timerBox = await timer.boundingBox();
        assert.ok(timerBox && timerBox.y >= candidateBox.y);
        assert.ok(barBox && barBox.x + barBox.width <= timerBox.x);
        assert.ok(barBox.y >= timerBox.y && barBox.y + barBox.height <= timerBox.y + timerBox.height);
        assert.ok(timerBox.y + timerBox.height <= candidateBox.y + candidateBox.height);
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
        const pass = await f.page.getByRole('button', { name: '유찰', exact: true }).boundingBox();
        assert.ok(pass && Math.abs(pass.y - desktopCandidate.y - desktopCandidate.height) <= 12);
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

test('공개 후보 상세는 프로필이 사라져도 낙찰가와 빈 이력을 표시한다', { timeout: 60_000 }, async (t) => {
    const f = await createBrowserFixture(t, { width: 390 });
    const draw = async () => {
        const auction = await prepareHttpAuctionFixture(f);
        assertAction(await auction.setup(), 200);
        assertAction(await auction.action('start'), 200);
        assertAction(await auction.action('draw'), 200);
        const [lot] = await f.db
            .select()
            .from(schema.auctionLots)
            .where(eq(schema.auctionLots.status, 'open'));
        assert.ok(lot);
        await f.db
            .update(schema.scrimParticipants)
            .set({ userId: HTTP_IDS.member })
            .where(eq(schema.scrimParticipants.id, lot.scrimParticipantId));
        return { auction, lot };
    };
    const past = await draw();
    const { teams, people, action } = past.auction;
    assertAction(await action('award', { lotId: past.lot.id, teamId: teams[0]!.id, price: '35' }), 200);
    const remaining = people.slice(2).filter((person) => person.id !== past.lot.scrimParticipantId);
    for (const [index, person] of remaining.entries()) {
        const team = teams[index < 3 ? 0 : 1]!;
        assertAction(await action('assign', { participantId: person.id, teamId: team.id }), 200);
    }

    const { auction, lot } = await draw();
    const { page } = f;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(f.url + auction.path, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '자동 갱신 끄기', exact: true }).click();
    const refresh = page.getByRole('button', { name: '새로고침', exact: true });
    const show = page.getByRole('button', { name: '상세 보기', exact: true });
    const hide = page.getByRole('button', { name: '상세 접기', exact: true });
    const detail = page.getByRole('region', { name: '후보 전적 상세', exact: true });
    const mmr = detail.getByRole('heading', { name: '포지션별 MMR', exact: true });
    const card = page.getByRole('group', { name: /^현재 매물 / });
    const frontHeight = await card.evaluate((node) => node.clientHeight);
    await show.press('Enter');
    await mmr.waitFor();
    await f.db.update(schema.scrims).set({ mmrSeasonId: null }).where(eq(schema.scrims.id, auction.scrim.id));
    await refresh.click();
    await mmr.waitFor({ state: 'hidden' });
    await detail.getByText('35P', { exact: true }).waitFor();
    await detail.getByText('(1회)', { exact: true }).waitFor();
    assert.equal(await hide.getAttribute('aria-expanded'), 'true');
    assert.equal(await card.evaluate((node) => node.clientHeight), frontHeight);
    await capture(page, 'guest-price-without-profile-mobile');

    await hide.press('Enter');
    await show.waitFor();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await f.db
        .update(schema.scrimParticipants)
        .set({ userId: null })
        .where(eq(schema.scrimParticipants.id, lot.scrimParticipantId));
    const refreshed = page.waitForResponse((response) => response.url().endsWith('/auction/live'));
    await refresh.click();
    assert.equal((await refreshed).status(), 200);
    await show.press('Enter');
    await detail.getByText('유상 낙찰 기록 없음', { exact: true }).waitFor();
    assert.equal(await detail.getByRole('heading').count(), 0);
    await capture(page, 'guest-no-price-without-profile-desktop');
    await hide.press('Enter');
    await show.waitFor();
    assert.deepEqual(f.errors, []);
});

test(
    '390px 공개 경매는 자동 갱신·실패 복구·일시 중지와 페이지 이탈을 읽기 전용으로 처리한다',
    { timeout: 90_000 },
    async (t) => {
        const f = await createBrowserFixture(t, { width: 390 });
        await f.page.setViewportSize({ width: 390, height: 844 });
        const a = await prepareHttpAuctionFixture(f);
        await linkAuctionNames(f.db, a.people);
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
        assert.equal(await f.page.getByRole('button', { name: '핀볼 추첨', exact: true }).count(), 0);
        assertAction(await a.setup(), 200);
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
