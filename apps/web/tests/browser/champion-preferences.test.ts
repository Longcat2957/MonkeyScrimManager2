import assert from 'node:assert/strict';
import test from 'node:test';
import { and, asc, eq } from 'drizzle-orm';
import { stringify } from 'devalue';
import { chromium, type Locator } from 'playwright';
import * as schema from '../../src/lib/server/db/schema.ts';
import {
    CHAMPION_PREFERENCES_CATALOG_URL,
    championPreferenceCatalog,
    createHttpChampionPreferencesFixture
} from '../api/support/http-champion-preferences-fixtures.ts';
import { prepareHttpAuctionFixture } from '../api/support/http-auction-fixtures.ts';
import { assertAction, HTTP_IDS } from '../api/support/http.ts';
import { appErrors, assertNoOverflow, sessionContext } from './support/browser.ts';

type Fixture = Awaited<ReturnType<typeof createHttpChampionPreferencesFixture>>;
const saveError = '선호 챔피언을 저장하지 못했어요. 다시 시도해 주세요.';
const catalogError = '챔피언 검색 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요';

async function selected(list: Locator, ids: number[]) {
    assert.deepEqual(
        await list
            .locator('li[data-champion-id]')
            .evaluateAll((rows) => rows.map((row) => Number((row as HTMLElement).dataset.championId))),
        ids
    );
}

async function lane(form: Locator, name: string) {
    const button = form.getByRole('button', { name, exact: true });
    await button.press('Space');
    await button
        .page()
        .waitForFunction(
            (node) => node?.getAttribute('aria-pressed') === 'true',
            await button.elementHandle()
        );
    assert.equal(await form.locator('button[aria-pressed="true"]').count(), 1);
    assert.equal(await button.getAttribute('type'), 'button');
    return form.getByRole('list', { name: `${name} 선택한 챔피언`, exact: true });
}

async function stored(f: Fixture, position: 'top' | 'jungle' = 'top') {
    return (
        await f.db
            .select()
            .from(schema.userChampionPreferences)
            .where(
                and(
                    eq(schema.userChampionPreferences.userId, HTTP_IDS.member),
                    eq(schema.userChampionPreferences.position, position)
                )
            )
            .orderBy(asc(schema.userChampionPreferences.ordinal))
    ).map((row) => row.championId);
}

async function retained(f: Fixture) {
    const rows = await Promise.all([
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
    return rows.map((table) => table.map((row) => JSON.stringify(row)).sort());
}

async function auctionProjection(
    browser: Awaited<ReturnType<typeof chromium.launch>>,
    f: Fixture,
    width: number,
    theme: string
) {
    const auction = await prepareHttpAuctionFixture(f);
    const ownerName = '경매 후보 닉네임';
    await f.db
        .update(schema.guildMembers)
        .set({ nickname: ownerName })
        .where(
            and(
                eq(schema.guildMembers.guildId, HTTP_IDS.guild),
                eq(schema.guildMembers.userId, HTTP_IDS.member)
            )
        );
    const indexes = [1, 2, 0, 3, 4, 5, 6, 7, 8, 9];
    for (const [index, person] of auction.people.entries()) {
        const identityIndex = indexes[index]!;
        await f.db
            .update(schema.scrimParticipants)
            .set({
                userId: f.identities[identityIndex]!.userId,
                riotAccountId: f.accounts[identityIndex]!.id,
                displayName: f.identities[identityIndex]!.gameName
            })
            .where(eq(schema.scrimParticipants.id, person.id));
    }
    assertAction(await auction.setup(), 200);
    assertAction(await auction.action('start'), 200);
    let found = false;
    for (let draw = 0; draw < 8; draw++) {
        assertAction(await auction.action('draw'), 200);
        const [lot] = await f.db
            .select()
            .from(schema.auctionLots)
            .where(
                and(eq(schema.auctionLots.scrimId, auction.scrim.id), eq(schema.auctionLots.status, 'open'))
            );
        assert.ok(lot);
        if (lot.scrimParticipantId === auction.people[2]!.id) {
            found = true;
            break;
        }
        assertAction(await auction.action('pass', { lotId: lot.id }), 200);
    }
    assert.equal(found, true);
    const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 1000 },
        reducedMotion: 'reduce'
    });
    await sessionContext(context, f);
    await context.addInitScript((mode) => localStorage.setItem('theme-mode', mode), theme);
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = appErrors(page);
    await page.goto(f.url + auction.path);
    const current = page.getByRole('group', { name: `현재 매물 ${ownerName}`, exact: true });
    await current.waitFor();
    await page.getByRole('button', { name: '상세보기', exact: true }).press('Enter');
    const detail = page.getByRole('region', { name: '후보 전적 상세', exact: true });
    await detail.getByRole('heading', { name: '선호 챔피언', exact: true }).waitFor();
    const preferences = detail
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: '선호 챔피언', exact: true }) });
    const ids = await stored(f);
    assert.deepEqual(
        (await preferences.getByRole('listitem').allTextContents()).map((text) => text.trim()),
        ids.map((id) => f.catalog.find((entry) => entry.championId === id)!.name)
    );
    await detail.getByText('2게임', { exact: true }).first().waitFor();
    await detail.focus();
    await detail.press('End');
    await detail.press('Home');
    await assertNoOverflow(page, 'auction-preferences');
    assert.deepEqual(errors, []);
    assertAction(
        await f.action(
            '/me',
            'privacy',
            { publicProfile: 'false', publicRiotIds: 'true' },
            f.participant.cookie
        ),
        200
    );
    await page.reload();
    await page.getByRole('group', { name: '현재 매물 비공개 사용자', exact: true }).waitFor();
    await page.getByRole('button', { name: '상세보기', exact: true }).press('Enter');
    await detail.getByRole('heading', { name: '내전 전적', exact: true }).waitFor();
    assert.equal(await detail.getByRole('heading', { name: '선호 챔피언', exact: true }).count(), 0);
    assert.equal(await page.getByText(ownerName, { exact: true }).count(), 0);
    assert.deepEqual(await stored(f), ids);
    assert.deepEqual(errors, []);
    await context.close();
}

for (const width of [1440, 390])
    for (const theme of ['primary', 'dark'])
        test(
            `선호 챔피언 초안·순서·저장 복구와 공개 경매를 확인한다: ${width}px ${theme}`,
            { timeout: 90_000 },
            async (t) => {
                let release = () => {};
                t.after(() => release());
                const browser = await chromium.launch({ headless: true });
                t.after(() => browser.close());
                const paginated = width === 1440 && theme === 'primary';
                const extraCatalog = [
                    ...championPreferenceCatalog,
                    { id: 'Teemo', championId: 17, name: '티모' },
                    { id: 'TwistedFate', championId: 4, name: '트위스티드 페이트' }
                ];
                const f = await createHttpChampionPreferencesFixture(
                    t,
                    paginated
                        ? [
                              {
                                  method: 'GET',
                                  url: CHAMPION_PREFERENCES_CATALOG_URL,
                                  body: {
                                      type: 'champion',
                                      version: '26.21.1',
                                      data: Object.fromEntries(
                                          extraCatalog.map(({ id, championId, name }) => [
                                              id,
                                              {
                                                  id,
                                                  key: String(championId),
                                                  name,
                                                  image: { full: id + '.png' }
                                              }
                                          ])
                                      )
                                  }
                              }
                          ]
                        : []
                );
                for (const game of [1, 2])
                    assertAction(
                        await f.action(
                            f.path,
                            'upload',
                            { ...(await f.confirm(game)), file: f.file(1_800_125 + game * 100_000) },
                            f.participant.cookie
                        ),
                        200
                    );
                const original = await retained(f);
                assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 20);
                const viewport = { width, height: width === 390 ? 844 : 1000 };
                const context = await browser.newContext({
                    viewport,
                    hasTouch: width === 390,
                    reducedMotion: 'reduce'
                });
                await sessionContext(context, f, f.participant.cookie);
                await context.addInitScript((mode) => localStorage.setItem('theme-mode', mode), theme);
                const page = await context.newPage();
                page.setDefaultTimeout(10_000);
                const errors = appErrors(page);
                await page.goto(f.url + '/me');
                await page.getByRole('heading', { name: '선호 챔피언', exact: true }).waitFor();
                const form = page.getByRole('form', { name: '선호 챔피언 저장', exact: true });
                const search = form.getByRole('searchbox', { name: '챔피언 검색', exact: true });
                await search.waitFor();
                assert.equal(await form.getByRole('button', { name: / 선호 챔피언 저장$/ }).count(), 1);
                assert.equal(
                    await form.getByRole('button', { name: '탑', exact: true }).getAttribute('aria-pressed'),
                    'true'
                );
                for (const name of ['탑', '정글', '미드', '원딜', '서폿']) {
                    const box = await form.getByRole('button', { name, exact: true }).boundingBox();
                    assert.ok(box && box.height >= 44 && box.width > 0);
                }
                let posts = 0;
                page.on('request', (request) => {
                    if (request.method() === 'POST' && new URL(request.url()).searchParams.has('/champions'))
                        posts++;
                });
                const pages = form.getByRole('navigation', { name: '챔피언 검색 결과 쪽 이동', exact: true });
                if (paginated) {
                    assert.equal(
                        await form
                            .getByRole('list', { name: '추가할 챔피언', exact: true })
                            .getByRole('button')
                            .count(),
                        12
                    );
                    await pages.getByRole('button', { name: '2', exact: true }).press('Enter');
                    assert.equal(
                        await pages
                            .getByRole('button', { name: '2', exact: true })
                            .getAttribute('aria-current'),
                        'page'
                    );
                    assert.equal(
                        await form
                            .getByRole('list', { name: '추가할 챔피언', exact: true })
                            .getByRole('button')
                            .count(),
                        2
                    );
                }
                await search.fill('AHri');
                assert.equal(await pages.count(), 0);
                await form.getByRole('button', { name: '아리 추가', exact: true }).press('Enter');
                let list = form.getByRole('list', { name: '탑 선택한 챔피언', exact: true });
                await selected(list, [103]);
                assert.equal(await form.getByRole('button', { name: '아리 추가', exact: true }).count(), 0);
                await search.press('Enter');
                assert.equal(posts, 0);
                list = await lane(form, '정글');
                await search.fill('leeSIN');
                await form.getByRole('button', { name: '리 신 추가', exact: true }).press('Enter');
                await selected(list, [64]);
                if (width === 390 && theme === 'dark') {
                    await form.getByRole('button', { name: '리 신 제거', exact: true }).press('Enter');
                    assert.equal(await search.evaluate((node) => document.activeElement === node), true);
                    await form.getByRole('button', { name: '리 신 추가', exact: true }).press('Enter');
                    await selected(list, [64]);
                }
                if (paginated) {
                    await search.fill('');
                    await pages.getByRole('button', { name: '2', exact: true }).press('Enter');
                }
                list = await lane(form, '탑');
                await selected(list, [103]);
                if (paginated)
                    assert.equal(
                        await pages
                            .getByRole('button', { name: '1', exact: true })
                            .getAttribute('aria-current'),
                        'page'
                    );
                await search.fill('');
                for (const name of ['가렌', '럭스'])
                    await form.getByRole('button', { name: `${name} 추가`, exact: true }).press('Enter');
                await form.getByRole('button', { name: '럭스 위로', exact: true }).press('Enter');
                await selected(list, [103, 99, 86]);
                await form.getByRole('button', { name: '아리 아래로', exact: true }).press('Space');
                await selected(list, [99, 103, 86]);
                await form.getByRole('button', { name: '가렌 제거', exact: true }).press('Enter');
                await selected(list, [99, 103]);
                const chosen = [99, 103];
                for (const champion of f.catalog
                    .filter(({ championId }) => !chosen.includes(championId))
                    .slice(0, 8)) {
                    await form
                        .getByRole('button', { name: `${champion.name} 추가`, exact: true })
                        .press('Enter');
                    chosen.push(champion.championId);
                }
                await selected(list, chosen);
                assert.equal(chosen.length, 10);
                const remaining = form
                    .getByRole('list', { name: '추가할 챔피언', exact: true })
                    .getByRole('button');
                assert.equal(await remaining.count(), paginated ? 4 : 2);
                for (const button of await remaining.all()) assert.equal(await button.isDisabled(), true);
                for (const button of await list.getByRole('button').all()) {
                    const box = await button.boundingBox();
                    assert.ok(box && box.width >= 24 && box.height >= (width === 390 ? 44 : 36));
                }
                assert.equal(
                    await form.getByRole('button', { name: '럭스 위로', exact: true }).isDisabled(),
                    true
                );
                await assertNoOverflow(page, 'ten-champion-draft');
                assert.deepEqual(errors, []);
                let fail = true;
                let hold = true;
                let arrived!: () => void;
                const arrival = new Promise<void>((done) => {
                    arrived = done;
                });
                const held = new Promise<void>((done) => {
                    release = done;
                });
                await context.route('**/*', async (route) => {
                    if (!new URL(route.request().url()).searchParams.has('/champions'))
                        return route.fallback();
                    if (fail) {
                        fail = false;
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
                    if (hold) {
                        hold = false;
                        arrived();
                        await held;
                    }
                    await route.fallback();
                });
                const save = form.getByRole('button', { name: '탑 선호 챔피언 저장', exact: true });
                await search.fill('lux');
                await search.press('Enter');
                assert.equal(posts, 0);
                await save.press('Enter');
                await form.getByRole('alert').filter({ hasText: saveError }).waitFor();
                await selected(list, chosen);
                assert.equal(await search.inputValue(), 'lux');
                assert.deepEqual(await stored(f), []);
                await assertNoOverflow(page, 'save-error');
                assert.deepEqual(errors, []);
                await save.press('Enter');
                await arrival;
                assert.equal(await search.isDisabled(), true);
                for (const name of ['탑', '정글', '미드', '원딜', '서폿'])
                    assert.equal(await form.getByRole('button', { name, exact: true }).isDisabled(), true);
                await form.evaluate((node) => (node as HTMLFormElement).requestSubmit());
                release();
                await form.getByRole('status').filter({ hasText: '탑 선호 챔피언을 저장했어요.' }).waitFor();
                assert.equal(posts, 2);
                assert.deepEqual(await stored(f), chosen);
                assert.equal(await save.isDisabled(), true);
                list = await lane(form, '정글');
                await selected(list, [64]);
                assert.deepEqual(await stored(f, 'jungle'), []);
                await form.getByRole('button', { name: '정글 선호 챔피언 저장', exact: true }).press('Enter');
                await form
                    .getByRole('status')
                    .filter({ hasText: '정글 선호 챔피언을 저장했어요.' })
                    .waitFor();
                assert.deepEqual(await stored(f, 'jungle'), [64]);
                for (const name of ['미드', '원딜', '서폿', '탑']) await lane(form, name);
                await page.reload();
                await search.waitFor();
                await selected(form.getByRole('list', { name: '탑 선택한 챔피언', exact: true }), chosen);
                assert.equal(posts, 3);
                assert.deepEqual(await retained(f), original);
                assert.deepEqual(errors, []);
                await context.close();
                if (theme === 'primary') await auctionProjection(browser, f, width, theme);
                assert.deepEqual(await retained(f), original);

                if ((width === 1440 && theme === 'primary') || (width === 390 && theme === 'dark')) {
                    const unavailable = await createHttpChampionPreferencesFixture(t, [
                        {
                            method: 'GET',
                            url: CHAMPION_PREFERENCES_CATALOG_URL,
                            status: 503,
                            body: { unavailable: true }
                        }
                    ]);
                    await unavailable.db.insert(schema.userChampionPreferences).values(
                        [103, 99].map((championId, index) => ({
                            userId: HTTP_IDS.member,
                            position: 'top' as const,
                            championId,
                            ordinal: index + 1
                        }))
                    );
                    const failureContext = await browser.newContext({ viewport, reducedMotion: 'reduce' });
                    await sessionContext(failureContext, unavailable, unavailable.participant.cookie);
                    await failureContext.addInitScript(
                        (mode) => localStorage.setItem('theme-mode', mode),
                        theme
                    );
                    const failurePage = await failureContext.newPage();
                    failurePage.setDefaultTimeout(10_000);
                    const failureErrors = appErrors(failurePage);
                    await failurePage.goto(unavailable.url + '/me');
                    const failureForm = failurePage.getByRole('form', {
                        name: '선호 챔피언 저장',
                        exact: true
                    });
                    await failureForm.getByRole('alert').filter({ hasText: catalogError }).waitFor();
                    assert.equal(
                        await failureForm
                            .getByRole('searchbox', { name: '챔피언 검색', exact: true })
                            .isDisabled(),
                        true
                    );
                    await assertNoOverflow(failurePage, 'catalog-error');
                    assert.deepEqual(failureErrors, []);
                    const calls = unavailable.upstreamCalls.filter(
                        (url) => url === CHAMPION_PREFERENCES_CATALOG_URL
                    ).length;
                    const retried = failurePage.waitForResponse(
                        (response) => new URL(response.url()).pathname === '/me/__data.json'
                    );
                    const retry = failureForm.getByRole('button', {
                        name: '목록 다시 불러오기',
                        exact: true
                    });
                    await retry.press('Enter');
                    assert.equal((await retried).status(), 200);
                    await failurePage.waitForFunction(
                        (node) => !(node as HTMLButtonElement)?.disabled,
                        await retry.elementHandle()
                    );
                    assert.ok(
                        unavailable.upstreamCalls.filter((url) => url === CHAMPION_PREFERENCES_CATALOG_URL)
                            .length > calls
                    );
                    for (const id of [103, 99])
                        await failureForm
                            .getByRole('button', { name: `챔피언 #${id} 제거`, exact: true })
                            .press('Enter');
                    await failureForm
                        .getByRole('button', { name: '탑 선호 챔피언 저장', exact: true })
                        .press('Enter');
                    await failureForm
                        .getByRole('status')
                        .filter({ hasText: '탑 선호 챔피언을 저장했어요.' })
                        .waitFor();
                    assert.deepEqual(await stored(unavailable), []);
                    assert.deepEqual(failureErrors, []);
                    await failureContext.close();
                }
            }
        );
