import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import * as schema from '../../src/lib/server/db/schema.ts';
import { HTTP_IDS } from '../api/support/http.ts';
import { createBrowserFixture } from './support/browser.ts';

for (const width of [1440, 390]) {
    test(
        `참가자 일괄 추가는 검색·쪽 선택과 부분 실패·응답 유실을 복구한다: ${width}px`,
        { timeout: 60_000 },
        async (t) => {
            const f = await createBrowserFixture(t, { width, userId: HTTP_IDS.manager });
            const { page, context } = f;
            await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
            const members = Array.from({ length: 22 }, (_, index) => ({
                id: String(970000000000001000n + BigInt(index)),
                username: `B선수${String(index + 2).padStart(2, '0')}`
            }));
            await f.db.insert(schema.users).values(members);
            await f.db.insert(schema.guildMembers).values(
                members.map((member) => ({
                    guildId: HTTP_IDS.guild,
                    userId: member.id,
                    syncedAt: new Date()
                }))
            );
            await f.db
                .update(schema.users)
                .set({ username: 'B선수01' })
                .where(eq(schema.users.id, HTTP_IDS.member));
            await f.db
                .update(schema.users)
                .set({ username: 'B선수24' })
                .where(eq(schema.users.id, HTTP_IDS.serviceAdmin));
            const [scrim] = await f.db
                .insert(schema.scrims)
                .values({
                    guildId: HTTP_IDS.guild,
                    mmrSeasonId: f.season.id,
                    title: '일괄 참가자 추가',
                    reserveCapacity: 1
                })
                .returning();
            const players = await f.db
                .insert(schema.scrimParticipants)
                .values(
                    members.slice(0, 9).map((member) => ({
                        scrimId: scrim!.id,
                        userId: member.id,
                        displayName: member.username
                    }))
                )
                .returning();
            await f.db.insert(schema.scrimParticipantRegistrations).values(
                players.map((player) => ({
                    scrimParticipantId: player.id,
                    status: 'selected' as const,
                    joinedByUserId: HTTP_IDS.manager
                }))
            );

            let mode: 'hold' | 'pass' | 'lose' = 'hold';
            let release!: () => void;
            let arrived!: () => void;
            const held = new Promise<void>((resolve) => {
                release = resolve;
            });
            const started = new Promise<void>((resolve) => {
                arrived = resolve;
            });
            t.after(release);
            const batches: string[][] = [];
            await context.route('**/*', async (route) => {
                const request = route.request();
                if (!request.url().endsWith('?/addParticipant')) return route.fallback();
                batches.push(
                    [...request.postData()!.matchAll(/name="userId"\r\n\r\n([^\r]+)/g)].map(
                        (match) => match[1]!
                    )
                );
                if (mode === 'hold') {
                    arrived();
                    await held;
                }
                if (mode === 'lose') {
                    // 실제 저장 응답만 버려 클라이언트가 성공 여부를 알 수 없는 상황을 만든다.
                    const response = await route.fetch({
                        headers: {
                            ...request.headers(),
                            'x-forwarded-proto': 'https',
                            origin: f.origin
                        },
                        maxRedirects: 0
                    });
                    assert.equal(response.status(), 200);
                    await route.abort('connectionreset');
                } else await route.fallback();
            });

            const path = `/g/${HTTP_IDS.guild}/scrims/${scrim!.id}`;
            await page.goto(f.url + path);
            await page.getByRole('button', { name: '참가자 추가', exact: true }).click();
            const dialog = page.getByRole('dialog', { name: '참가자 추가', exact: true });
            const member = dialog.getByRole('checkbox', { name: 'B선수01', exact: true });
            await member.waitFor();
            assert.equal(
                await dialog.getByRole('checkbox', { name: 'B선수02 참가 중', exact: true }).isDisabled(),
                true
            );
            await member.focus();
            await member.press('Space');
            assert.equal(await member.getAttribute('aria-checked'), 'true');
            await dialog.getByRole('button', { name: '2', exact: true }).click();
            await dialog.getByRole('checkbox', { name: 'B선수24', exact: true }).click();
            const search = dialog.getByRole('textbox', { name: '서버 멤버 검색', exact: true });
            await search.fill('HTTP');
            await dialog.getByRole('button', { name: '검색', exact: true }).click();
            await dialog.getByRole('checkbox', { name: 'HTTP 사용자', exact: true }).click();
            const submit = dialog.getByRole('button', { name: '선택한 3명 추가', exact: true });
            await submit.click();
            await started;
            assert.equal(await search.isDisabled(), true);
            assert.equal(await dialog.getByRole('button', { name: '닫기', exact: true }).isDisabled(), true);
            await page.keyboard.press('Escape');
            assert.equal(
                await dialog.getByRole('heading', { name: '참가자 추가', exact: true }).isVisible(),
                true
            );
            await submit.evaluate((button) =>
                button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
            );
            assert.equal(batches.length, 1);
            mode = 'pass';
            release();
            const retry = dialog.getByRole('button', { name: '실패한 1명 다시 추가', exact: true });
            await retry.waitFor();
            assert.deepEqual(batches[0], [HTTP_IDS.member, HTTP_IDS.serviceAdmin, HTTP_IDS.manager]);
            assert.match(await dialog.innerText(), /선발로 추가했어요/);
            assert.match(await dialog.innerText(), /대기로 추가했어요/);
            assert.match(await dialog.innerText(), /신청 정원이 찼어요/);
            await page.waitForFunction(
                () => document.activeElement?.getAttribute('aria-label') === '참가자 추가 결과'
            );

            await f.db
                .update(schema.scrims)
                .set({ reserveCapacity: 2 })
                .where(eq(schema.scrims.id, scrim!.id));
            await retry.click();
            await dialog.getByRole('button', { name: '선택한 0명 추가', exact: true }).waitFor();
            assert.deepEqual(batches[1], [HTTP_IDS.manager]);
            const stored = await f.db
                .select({
                    status: schema.scrimParticipantRegistrations.status,
                    actor: schema.scrimParticipantRegistrations.joinedByUserId
                })
                .from(schema.scrimParticipantRegistrations)
                .innerJoin(
                    schema.scrimParticipants,
                    eq(schema.scrimParticipants.id, schema.scrimParticipantRegistrations.scrimParticipantId)
                )
                .where(eq(schema.scrimParticipants.scrimId, scrim!.id));
            assert.equal(stored.filter((row) => row.status === 'selected').length, 10);
            assert.equal(stored.filter((row) => row.status === 'standby').length, 2);
            assert.ok(stored.every((row) => row.actor === HTTP_IDS.manager));
            await dialog.getByRole('button', { name: '닫기', exact: true }).click();

            const [second] = await f.db
                .insert(schema.scrims)
                .values({
                    guildId: HTTP_IDS.guild,
                    mmrSeasonId: f.season.id,
                    title: '응답 유실 확인'
                })
                .returning();
            await page.goto(`${f.url}/g/${HTTP_IDS.guild}/scrims/${second!.id}`);
            await page.getByRole('button', { name: '참가자 추가', exact: true }).click();
            await dialog.getByRole('checkbox', { name: 'HTTP 사용자', exact: true }).first().click();
            mode = 'lose';
            await dialog.getByRole('button', { name: '선택한 1명 추가', exact: true }).click();
            const refresh = dialog.getByRole('button', { name: '참가 현황 다시 확인', exact: true });
            await refresh.waitFor();
            assert.equal(batches.length, 3);
            await refresh.click();
            await dialog.getByRole('button', { name: '선택한 0명 추가', exact: true }).waitFor();
            assert.equal(batches.length, 3);
            assert.equal(
                await dialog.getByRole('button', { name: '선택한 0명 추가', exact: true }).isDisabled(),
                true
            );
            assert.equal(
                await dialog.getByRole('checkbox', { name: 'HTTP 사용자 참가 중', exact: true }).count(),
                1
            );
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
            assert.deepEqual(f.errors, []);
        }
    );
}
