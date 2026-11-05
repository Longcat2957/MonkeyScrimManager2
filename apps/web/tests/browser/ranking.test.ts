import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { stringify, unflatten } from 'devalue';
import type { Page } from 'playwright';
import type { RankingEntry, RankingPage } from '../../src/lib/features/guild/types.ts';
import { HTTP_IDS } from '../api/support/http.ts';
import { createBrowserFixture } from './support/browser.ts';

const positions = ['top', 'jungle', 'mid', 'bot', 'support'];
const guildPath = (guildId = HTTP_IDS.guild) => '/g/' + guildId;
const rankingList = (page: Page) => page.getByRole('list', { name: '탑 순위', exact: true });
const initial: RankingEntry[] = Array.from({ length: 30 }, (_, index) => ({
    rank: index + 1,
    userId: String(970000000000002000n + BigInt(index)),
    displayName: '순위사용자' + index,
    mmr: 1700 - index * 10,
    games: 10,
    wins: 5,
    iconUrl: null,
    isMe: false
}));
// 첫 쪽 조회 후 기존 1위가 11위로 내려가고 기존 11위가 첫 쪽에 진입한다.
const changed = [...initial.slice(1, 11), { ...initial[0]!, mmr: 1595 }, ...initial.slice(11)].map(
    (entry, index) => ({ ...entry, rank: index + 1 })
);

function slice(entries: RankingEntry[], offset: number): RankingPage {
    return { entries: entries.slice(offset, offset + 10), hasMore: offset + 10 < entries.length, me: null };
}

type RankingRequest = { guildId: string; position: string; offset: number };
type Response = { status?: number; page: RankingPage };

async function fixture(
    t: TestContext,
    width: number,
    respond: (request: RankingRequest) => Response | Promise<Response>
) {
    const browser = await createBrowserFixture(t, { width });
    const calls: RankingRequest[] = [];
    const sources = new Map([
        [HTTP_IDS.guild, initial],
        [
            HTTP_IDS.otherGuild,
            initial.map((entry) => ({
                ...entry,
                userId: 'other-' + entry.userId,
                displayName: '다른서버-' + entry.displayName
            }))
        ]
    ]);
    await browser.context.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== new URL(browser.url).origin) return route.fallback();
        const guildId = url.pathname.split('/')[2]!;
        if (url.pathname === guildPath(guildId) + '/ranking') {
            const query = {
                guildId,
                position: url.searchParams.get('position')!,
                offset: Number(url.searchParams.get('offset'))
            };
            calls.push(query);
            const result =
                guildId === HTTP_IDS.guild
                    ? await respond(query)
                    : { page: slice(sources.get(guildId)!, query.offset) };
            await route.fulfill({ status: result.status ?? 200, json: result.page });
            return;
        }
        if (url.pathname === guildPath(guildId) + '/__data.json' && sources.has(guildId)) {
            const response = await route.fetch({
                headers: { ...request.headers(), 'x-forwarded-proto': 'https' },
                maxRedirects: 0
            });
            const payload = (await response.json()) as {
                nodes: ({ type: string; data?: unknown[] } | null)[];
            };
            for (const node of payload.nodes) {
                if (node?.type !== 'data' || !node.data) continue;
                const data = unflatten(node.data) as Record<string, unknown>;
                if (!Object.hasOwn(data, 'ranking')) continue;
                // 실제 운영 번들에 순위가 변하는 응답만 주입한다. 앱·라우터·컴포넌트는 대체하지 않는다.
                data.ranking = {
                    ok: true,
                    value: {
                        seasonName: '동시 결과 반영 순위',
                        positions: Object.fromEntries(
                            positions.map((position) => [position, slice(sources.get(guildId)!, 0)])
                        )
                    }
                };
                node.data = JSON.parse(stringify(data));
            }
            await route.fulfill({ response, json: payload });
            return;
        }
        await route.fallback();
    });
    // SSR에 없는 데스크톱 워드마크로 마운트를 확인한 뒤 검증할 화면 폭으로 이동한다.
    await browser.page.setViewportSize({ width: 1440, height: 1000 });
    await browser.page.goto(browser.url + '/docs');
    await browser.page.locator('header .font-brand').waitFor();
    await browser.page.setViewportSize({ width, height: 1000 });
    await navigate(browser.page, browser.url, guildPath());
    await rankingList(browser.page).waitFor();
    return { ...browser, calls, sources };
}

async function navigate(page: Page, origin: string, path: string) {
    await page.evaluate((href) => {
        const link = document.createElement('a');
        link.href = href;
        document.body.append(link);
        link.click();
        link.remove();
    }, path);
    await page.waitForURL(origin + path);
}

async function scrollMore(page: Page) {
    await rankingList(page).evaluate((node) => {
        const scroller = node.parentElement!;
        scroller.scrollTop = scroller.scrollHeight;
    });
}

async function expectEntries(page: Page, entries: RankingEntry[]) {
    await page.waitForFunction(
        (ids) => {
            const links = [...document.querySelectorAll('ul[aria-label="탑 순위"] li a')];
            return (
                links.length === ids.length &&
                links.every((link, index) => link.getAttribute('href')?.endsWith('/' + ids[index]))
            );
        },
        entries.map((entry) => entry.userId)
    );
    const links = await rankingList(page)
        .locator('li a')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')));
    assert.equal(new Set(links).size, entries.length);
}

for (const width of [1440, 360]) {
    test(
        `순위 중복은 첫 쪽으로 복구하고 다음 쪽을 다시 읽는다: ${width}px`,
        { timeout: 60_000 },
        async (t) => {
            const f = await fixture(t, width, ({ offset }) => ({ page: slice(changed, offset) }));
            await expectEntries(f.page, initial.slice(0, 10));
            await scrollMore(f.page);
            await expectEntries(f.page, changed.slice(0, 10));
            assert.deepEqual(
                f.calls.map((call) => call.offset),
                [10, 0]
            );
            assert.equal(await rankingList(f.page).evaluate((node) => node.parentElement!.scrollTop), 0);
            await scrollMore(f.page);
            await expectEntries(f.page, changed.slice(0, 20));
            assert.deepEqual(
                f.calls.map((call) => call.offset),
                [10, 0, 10]
            );
            await scrollMore(f.page);
            await expectEntries(f.page, changed);
            await f.page.getByText('마지막 순위예요', { exact: true }).waitFor();
            assert.deepEqual(
                f.calls.map((call) => call.offset),
                [10, 0, 10, 20]
            );
            assert.deepEqual(f.errors, []);
            assert.equal(
                await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
                false
            );
        }
    );
}

test(
    '순위 첫 쪽 재조회 실패는 기존 목록을 유지하고 사용자 재시도로 복구한다',
    { timeout: 60_000 },
    async (t) => {
        let firstFailed = false;
        const f = await fixture(t, 1440, ({ offset }) => {
            const failure = offset === 0 && !firstFailed;
            if (failure) firstFailed = true;
            return { status: failure ? 503 : 200, page: slice(changed, offset) };
        });
        await scrollMore(f.page);
        const retry = f.page.getByRole('button', { name: '불러오지 못했어요. 눌러서 다시 시도해 주세요' });
        await retry.waitFor();
        await expectEntries(f.page, initial.slice(0, 10));
        assert.deepEqual(
            f.calls.map((call) => call.offset),
            [10, 0]
        );
        await retry.click();
        await expectEntries(f.page, changed.slice(0, 10));
        assert.deepEqual(
            f.calls.map((call) => call.offset),
            [10, 0, 10, 0]
        );
        await scrollMore(f.page);
        await expectEntries(f.page, changed.slice(0, 20));
        assert.deepEqual(f.errors, []);
    }
);

for (const destination of ['guild', 'unmount'] as const) {
    test(
        `이전 순위 요청은 ${destination === 'guild' ? '다른 서버 이동' : '화면 종료'} 후 반영하지 않는다`,
        { timeout: 60_000 },
        async (t) => {
            let started!: () => void;
            let release!: () => void;
            const pending = new Promise<void>((resolve) => {
                started = resolve;
            });
            const held = new Promise<void>((resolve) => {
                release = resolve;
            });
            t.after(release);
            const f = await fixture(t, 1440, async ({ offset }) => {
                started();
                await held;
                return { page: slice(changed, offset) };
            });
            const aborted = f.page.waitForEvent('requestfailed', (request) =>
                request.url().includes('/ranking?')
            );
            await scrollMore(f.page);
            await pending;
            // 서버 이동 직전의 위치와 무관하게 이전 응답만 검증하도록 상단에서 이동한다.
            await rankingList(f.page).evaluate((node) => {
                node.parentElement!.scrollTop = 0;
            });
            await navigate(f.page, f.url, destination === 'guild' ? guildPath(HTTP_IDS.otherGuild) : '/docs');
            await aborted;
            release();
            if (destination === 'guild') {
                await expectEntries(f.page, f.sources.get(HTTP_IDS.otherGuild)!.slice(0, 10));
            } else {
                await f.page.getByRole('heading', { level: 1, name: '이용 안내' }).waitFor();
                assert.equal(await rankingList(f.page).count(), 0);
            }
            assert.deepEqual(f.errors, []);
        }
    );
}
