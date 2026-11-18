import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import * as schema from '../../src/lib/server/db/schema.ts';
import { MMR_POSITIONS } from '../../src/lib/server/mmr/rules.ts';
import { createBracketDraft } from '../../src/lib/server/scrims/bracket.ts';
import { HTTP_IDS, assertAction } from '../api/support/http.ts';
import { prepareHttpAuctionFixture } from '../api/support/http-auction-fixtures.ts';
import { createBrowserFixture } from './support/browser.ts';

for (const width of [1440, 390])
    test(
        `모집 마감부터 2팀 편성·경기 시작까지 이동하고 같은 내전 메뉴를 유지한다: ${width}px`,
        { timeout: 60_000 },
        async (t) => {
            const f = await createBrowserFixture(t, { width, userId: HTTP_IDS.manager });
            await f.page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
            const users = await f.db
                .insert(schema.users)
                .values(
                    Array.from({ length: 10 }, (_, index) => ({
                        id: String(970000000000002000n + BigInt(index)),
                        username: `편성 참가자 ${index + 1}`
                    }))
                )
                .returning();
            await f.db.insert(schema.guildMembers).values(
                users.map((user) => ({
                    guildId: HTTP_IDS.guild,
                    userId: user.id,
                    syncedAt: new Date()
                }))
            );
            const [scrim] = await f.db
                .insert(schema.scrims)
                .values({
                    guildId: HTTP_IDS.guild,
                    title: '한 번에 경기 시작',
                    status: 'recruit',
                    formationMethod: 'manual',
                    teamCount: 2,
                    mmrSeasonId: f.season.id
                })
                .returning();
            const participants = await f.db
                .insert(schema.scrimParticipants)
                .values(
                    users.map((user) => ({
                        scrimId: scrim!.id,
                        userId: user.id,
                        displayName: user.username
                    }))
                )
                .returning();
            await f.db.insert(schema.scrimParticipantRegistrations).values(
                participants.map((person) => ({
                    scrimParticipantId: person.id,
                    status: 'selected' as const
                }))
            );
            const path = `/g/${HTTP_IDS.guild}/scrims/${scrim!.id}`;
            const manager = await f.session(HTTP_IDS.manager);
            const navigation = async () => {
                const local = f.page.getByRole('navigation', { name: '내전 메뉴', exact: true });
                await local.waitFor();
                assert.deepEqual(await local.getByRole('listitem').allTextContents(), [
                    '모집·참가자',
                    '팀 편성',
                    '대진·경기',
                    '결과'
                ]);
                if (width === 1440) {
                    const global = f.page.getByRole('navigation', { name: '서버 메뉴', exact: true });
                    await global.waitFor();
                    assert.deepEqual(await global.getByRole('listitem').allTextContents(), [
                        '서버 홈',
                        '내전',
                        '경기 기록',
                        '통계',
                        '관리'
                    ]);
                }
            };
            const accept = async (title: string) => {
                const dialog = f.page.getByRole('dialog', { name: title, exact: true });
                const cancel = dialog.getByRole('button', { name: '취소', exact: true });
                await cancel.waitFor();
                await f.page.waitForFunction(
                    (node) => node === document.activeElement,
                    await cancel.elementHandle()
                );
                await dialog.getByRole('button', { name: '확인', exact: true }).press('Enter');
            };
            await f.page.goto(f.url + path);
            await f.page.waitForLoadState('networkidle');
            await navigation();
            await f.page.getByRole('button', { name: '모집 마감', exact: true }).press('Enter');
            await accept('모집 마감');
            await f.page.waitForURL(f.url + path + '/manual');
            await navigation();
            const teams = await f.db
                .select()
                .from(schema.scrimTeams)
                .where(eq(schema.scrimTeams.scrimId, scrim!.id))
                .orderBy(schema.scrimTeams.ordinal);
            // 배치 자체는 기존 운영 action으로 준비하고 새 확정·이동 동작을 브라우저에서 검증한다.
            for (const [index, participant] of participants.entries()) {
                const [row] = await f.db.select().from(schema.scrims).where(eq(schema.scrims.id, scrim!.id));
                assertAction(
                    await f.action(
                        path + '/manual',
                        'move',
                        {
                            expectedRevision: String(row!.revision),
                            participantId: participant.id,
                            slot: `${teams[Math.floor(index / 5)]!.id}:${MMR_POSITIONS[index % 5]}`
                        },
                        manager.cookie
                    ),
                    204
                );
            }
            await f.page.reload();
            const format = f.page.getByRole('group', { name: '시리즈 경기 방식', exact: true });
            await format.getByRole('radio', { name: '3전 2선승', exact: true, checked: true }).waitFor();
            await format.getByRole('radio', { name: '5전 3선승', exact: true }).press('Space');
            await format.getByRole('radio', { name: '5전 3선승', exact: true, checked: true }).waitFor();
            assert.equal(
                await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
                false
            );
            await f.page.getByRole('button', { name: '편성 확정·경기 시작', exact: true }).press('Enter');
            await accept('편성 확정·경기 시작');
            await f.page.waitForURL(new RegExp(`/g/${HTTP_IDS.guild}/matches/[^/]+$`));
            await navigation();
            const [match] = await f.db
                .select()
                .from(schema.matches)
                .where(eq(schema.matches.scrimId, scrim!.id));
            assert.equal(new URL(f.page.url()).pathname, `/g/${HTTP_IDS.guild}/matches/${match!.id}`);
            assert.equal(match!.bestOf, 5);
            const [lineup] = await f.db
                .select()
                .from(schema.matchLineups)
                .where(eq(schema.matchLineups.matchId, match!.id));
            assert.ok(lineup?.confirmedAt);
            assert.equal(await f.page.getByRole('button', { name: '라인업 확정', exact: true }).count(), 0);
            assert.equal(
                await f.page.getByRole('button', { name: 'ROFL 업로드', exact: true }).isVisible(),
                true
            );
            assert.equal(
                await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
                false
            );
            // 완료 결과 주소는 현재 대진에 연결된 실제 경기로 한 번만 이동한다.
            await f.db
                .update(schema.matches)
                .set({ status: 'completed', winnerTeamId: match!.teamAId })
                .where(eq(schema.matches.id, match!.id));
            await f.db
                .update(schema.scrims)
                .set({ status: 'completed' })
                .where(eq(schema.scrims.id, scrim!.id));
            const redirect = await f.request(path + '/result');
            assert.equal(redirect.status, 307);
            assert.equal(
                new URL(redirect.headers.get('location')!, f.url + path + '/result').pathname,
                `/g/${HTTP_IDS.guild}/matches/${match!.id}`
            );
            const observation = f.requestObservations.find(
                (entry) => entry.requestId === redirect.headers.get('x-request-id')
            );
            assert.ok(observation);
            assert.equal(observation.code, null);
            await f.page.goto(f.url + path + '/result');
            await f.page.waitForURL(`${f.url}/g/${HTTP_IDS.guild}/matches/${match!.id}`);
            await navigation();
            assert.deepEqual(f.errors, []);
        }
    );

test(
    '경매 마지막 배치는 대진으로 이동하고 경기 시작 후 출전 포지션을 별도로 확정한다',
    { timeout: 60_000 },
    async (t) => {
        const f = await createBrowserFixture(t, { width: 390, userId: HTTP_IDS.manager });
        const a = await prepareHttpAuctionFixture(f);
        assertAction(await a.setup(), 200);
        assertAction(await a.action('start'), 200);
        for (let index = 0; index < 8; index++) {
            assertAction(await a.action('draw'), 200);
            if (index === 7) break;
            const [lot] = await f.db
                .select()
                .from(schema.auctionLots)
                .where(eq(schema.auctionLots.status, 'open'));
            assertAction(
                await a.action('assignCurrent', {
                    lotId: lot!.id,
                    teamId: a.teams[Math.floor(index / 4)]!.id
                }),
                200
            );
        }
        await f.page.goto(f.url + a.path);
        await f.page.waitForLoadState('networkidle');
        await f.page.getByRole('textbox', { name: '2팀 입찰가', exact: true }).fill('1');
        await f.page.getByRole('button', { name: '낙찰 2팀', exact: true }).press('Enter');
        const bracketPath = a.path.replace(/\/auction$/, '/bracket');
        await f.page.waitForURL(f.url + bracketPath);
        const [scrim] = await f.db.select().from(schema.scrims).where(eq(schema.scrims.id, a.scrim.id));
        assert.equal(scrim!.status, 'ready');
        assert.equal((await f.db.select().from(schema.matches)).length, 0);
        for (const [index, team] of a.teams.entries())
            assertAction(
                await f.action(
                    bracketPath,
                    'place',
                    {
                        expectedRevision: await a.revision(),
                        seat: index === 0 ? 'final-a' : 'final-b',
                        teamId: team.id
                    },
                    a.manager.cookie
                ),
                204
            );
        await f.page.reload();
        await f.page
            .getByRole('group', { name: '결승 경기 방식', exact: true })
            .getByRole('radio', { name: '3전 2선승', exact: true, checked: true })
            .waitFor();
        await f.page.getByRole('button', { name: '대진 확정·내전 시작', exact: true }).press('Enter');
        const dialog = f.page.getByRole('dialog', { name: '대진 확정·내전 시작', exact: true });
        const cancel = dialog.getByRole('button', { name: '취소', exact: true });
        await cancel.waitFor();
        await f.page.waitForFunction((node) => node === document.activeElement, await cancel.elementHandle());
        await dialog.getByRole('button', { name: '확인', exact: true }).press('Enter');
        await f.page.waitForURL(new RegExp(`/g/${HTTP_IDS.guild}/matches/[^/]+$`));
        const [match] = await f.db
            .select()
            .from(schema.matches)
            .where(eq(schema.matches.scrimId, a.scrim.id));
        await f.page.waitForURL(`${f.url}/g/${HTTP_IDS.guild}/matches/${match!.id}`);
        assert.equal((await f.db.select().from(schema.matchLineupPlayers)).length, 0);
        assert.equal(await f.page.getByRole('button', { name: '라인업 확정', exact: true }).count(), 1);
        assert.deepEqual(f.errors, []);
    }
);

test('3팀 대진은 준결승 한 경기만 생성되어도 전체 대진에 남는다', { timeout: 60_000 }, async (t) => {
    const f = await createBrowserFixture(t, { width: 390, userId: HTTP_IDS.manager });
    const [scrim] = await f.db
        .insert(schema.scrims)
        .values({
            guildId: HTTP_IDS.guild,
            title: '결승 직행이 있는 대진',
            status: 'ready',
            formationMethod: 'auction',
            teamCount: 3,
            mmrSeasonId: f.season.id
        })
        .returning();
    const teams = await f.db
        .insert(schema.scrimTeams)
        .values([1, 2, 3].map((ordinal) => ({ scrimId: scrim!.id, ordinal, name: `${ordinal}팀` })))
        .returning();
    const participants = await f.db
        .insert(schema.scrimParticipants)
        .values(
            Array.from({ length: 15 }, (_, index) => ({
                scrimId: scrim!.id,
                teamId: teams[Math.floor(index / 5)]!.id,
                displayName: `경매 참가자 ${index + 1}`
            }))
        )
        .returning();
    await f.db
        .insert(schema.scrimParticipantRegistrations)
        .values(
            participants.map((person) => ({ scrimParticipantId: person.id, status: 'selected' as const }))
        );
    await f.db.transaction((tx) => createBracketDraft(tx, scrim!));
    const path = `/g/${HTTP_IDS.guild}/scrims/${scrim!.id}/bracket`;
    const manager = await f.session(HTTP_IDS.manager);
    for (const [index, seat] of ['semi-a', 'semi-b', 'final-b'].entries()) {
        const [row] = await f.db.select().from(schema.scrims).where(eq(schema.scrims.id, scrim!.id));
        assertAction(
            await f.action(
                path,
                'place',
                { expectedRevision: String(row!.revision), seat, teamId: teams[index]!.id },
                manager.cookie
            ),
            204
        );
    }
    await f.page.goto(f.url + path);
    await f.page
        .getByRole('group', { name: '준결승 경기 방식', exact: true })
        .getByRole('radio', { name: '3전 2선승', exact: true, checked: true })
        .waitFor();
    await f.page.getByRole('button', { name: '대진 확정·내전 시작', exact: true }).press('Enter');
    const dialog = f.page.getByRole('dialog', { name: '대진 확정·내전 시작', exact: true });
    const cancel = dialog.getByRole('button', { name: '취소', exact: true });
    await cancel.waitFor();
    await f.page.waitForFunction((node) => node === document.activeElement, await cancel.elementHandle());
    await dialog.getByRole('button', { name: '확인', exact: true }).press('Enter');
    const semi = f.page.getByRole('article', { name: '준결승', exact: true });
    await semi.getByRole('link', { name: /^준결승 경기 상세/ }).waitFor();
    assert.equal(new URL(f.page.url()).pathname, path);
    assert.equal(await f.page.getByRole('article', { name: '결승', exact: true }).isVisible(), true);
    assert.equal((await f.db.select().from(schema.matches)).length, 1);
    const nodes = await f.db.select().from(schema.scrimBracketNodes);
    assert.equal(nodes.length, 2);
    assert.equal(nodes.filter((node) => node.matchId === null).length, 1);
    assert.deepEqual(f.errors, []);
});
