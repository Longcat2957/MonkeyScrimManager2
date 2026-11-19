import assert from 'node:assert/strict';
import test from 'node:test';
import { and, eq } from 'drizzle-orm';
import { chromium } from 'playwright';
import * as schema from '../../src/lib/server/db/schema.ts';
import { createHttpMatchResultFixture } from '../api/support/http-match-fixtures.ts';
import { assertAction, HTTP_IDS } from '../api/support/http.ts';
import { appErrors, sessionContext } from './support/browser.ts';

test(
    '정상 ROFL 기록이 수동 편성의 시너지·라인 맞대결과 경매 후보 상세에 연결된다',
    { timeout: 90_000 },
    async (t) => {
        const browser = await chromium.launch({ headless: true });
        // 브라우저를 앱·DB보다 먼저 닫아 정리 중의 남은 요청을 방지한다.
        t.after(() => browser.close());
        const fixture = await createHttpMatchResultFixture(t);
        assertAction(await fixture.record(), 200);
        const [game] = await fixture.db.select().from(schema.games);
        assert.equal(game!.status, 'completed');
        assert.equal(game!.startedAt, null);

        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        await sessionContext(context, fixture, fixture.manager.cookie);
        const page = await context.newPage();
        page.setDefaultTimeout(10_000);
        const errors = appErrors(page);

        await page.goto(fixture.url + '/g/' + HTTP_IDS.guild + '/scrims/' + fixture.scrim.id + '/manual');
        await page.getByRole('button', { name: '상세', exact: true }).click();
        for (const [teamName, wins, losses] of [
            ['1팀', 1, 0],
            ['2팀', 0, 1]
        ] as const) {
            const synergy = page.getByRole('complementary', { name: teamName + ' 시너지', exact: true });
            await synergy.getByText(`${wins}승 ${losses}패`, { exact: true }).first().waitFor();
            assert.equal(await synergy.getByRole('listitem').count(), 3);
            assert.equal(await synergy.getByText(`${wins}승 ${losses}패`, { exact: true }).count(), 3);
            assert.equal(
                await synergy.getByText(`1판 · ${wins ? '100%' : '0%'}`, { exact: true }).count(),
                3
            );
        }
        const headToHead = page.getByRole('complementary', { name: '라인 상대 전적', exact: true });
        assert.equal(await headToHead.getByRole('listitem').count(), 5);
        assert.equal(await headToHead.getByText('1-0', { exact: true }).count(), 5);
        assert.equal(await headToHead.getByText('1승 우위', { exact: true }).count(), 5);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

        // 같은 사용자를 새 내전에 등록하되 과거 내전의 출전 기록을 바꾸지 않는다.
        const [auctionScrim] = await fixture.db
            .insert(schema.scrims)
            .values({
                guildId: HTTP_IDS.guild,
                mmrSeasonId: fixture.season.id,
                title: '실제 전적 경매',
                teamCount: 2,
                status: 'preparing',
                formationMethod: 'auction'
            })
            .returning();
        await fixture.db
            .insert(schema.scrimTeams)
            .values([1, 2].map((ordinal) => ({ scrimId: auctionScrim!.id, ordinal, name: ordinal + '팀' })));
        const auctionPeople = await fixture.db
            .insert(schema.scrimParticipants)
            .values(
                fixture.identities.map((person, index) => ({
                    scrimId: auctionScrim!.id,
                    userId: person.userId,
                    riotAccountId: fixture.accounts[index]!.id,
                    displayName: person.gameName
                }))
            )
            .returning();
        await fixture.db.insert(schema.scrimParticipantRegistrations).values(
            auctionPeople.map((person) => ({
                scrimParticipantId: person.id,
                status: 'selected' as const
            }))
        );
        const auctionPath = '/g/' + HTTP_IDS.guild + '/scrims/' + auctionScrim!.id + '/auction';
        const revision = async () =>
            String(
                (
                    await fixture.db
                        .select()
                        .from(schema.scrims)
                        .where(eq(schema.scrims.id, auctionScrim!.id))
                )[0]!.revision
            );
        assertAction(
            await fixture.action(
                auctionPath,
                'setup',
                {
                    expectedRevision: await revision(),
                    teams: JSON.stringify(
                        auctionPeople.slice(8).map((person) => ({ captainId: person.id, startPoints: 100 }))
                    )
                },
                fixture.manager.cookie
            ),
            200
        );
        for (const action of ['start', 'draw'])
            assertAction(
                await fixture.action(
                    auctionPath,
                    action,
                    { expectedRevision: await revision() },
                    fixture.manager.cookie
                ),
                200
            );
        const [lot] = await fixture.db
            .select()
            .from(schema.auctionLots)
            .where(
                and(eq(schema.auctionLots.scrimId, auctionScrim!.id), eq(schema.auctionLots.status, 'open'))
            );
        const index = auctionPeople.findIndex((person) => person.id === lot!.scrimParticipantId);
        assert.ok(index >= 0 && index < 8);
        const [record] = await fixture.db
            .select({ championId: schema.roflParticipantDataV1.champion })
            .from(schema.roflParticipantDataV1)
            .where(
                and(
                    eq(schema.roflParticipantDataV1.roflMetadataId, game!.roflMetadataId!),
                    eq(schema.roflParticipantDataV1.participantIndex, index)
                )
            );
        assert.ok(record?.championId);

        await page.goto(fixture.url + auctionPath);
        await page
            .getByRole('group', { name: '현재 매물 ' + fixture.identities[index]!.gameName, exact: true })
            .waitFor();
        await page.getByRole('button', { name: '상세보기', exact: true }).click();
        const profile = page.getByRole('region', { name: '후보 전적 상세', exact: true });
        await profile.getByRole('heading', { name: '내전 전적', exact: true }).waitFor();
        assert.equal(await profile.getByText('1게임', { exact: true }).count(), 2);
        assert.equal(await profile.getByText(index < 5 ? '1승 0패' : '0승 1패', { exact: true }).count(), 1);
        const champions = profile
            .locator('section')
            .filter({ has: page.getByRole('heading', { name: '내전 주력 챔피언', exact: true }) });
        assert.equal(await champions.getByText(record.championId, { exact: true }).count(), 1);
        assert.equal(
            await champions
                .getByText(index < 5 ? '1게임 · 1승 0패' : '1게임 · 0승 1패', { exact: true })
                .count(),
            1
        );
        await profile.getByRole('heading', { name: '게임 기록', exact: true }).waitFor();
        assert.equal(await profile.getByText(/시각 미확인/).count(), 1);
        assert.equal(await profile.getByRole('heading', { name: '최근 게임', exact: true }).count(), 0);
        assert.equal(await profile.getByRole('heading', { name: '선호 챔피언', exact: true }).count(), 0);
        assert.equal(await profile.getByRole('heading', { name: 'Riot 전적', exact: true }).count(), 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.deepEqual(errors, []);
    }
);
