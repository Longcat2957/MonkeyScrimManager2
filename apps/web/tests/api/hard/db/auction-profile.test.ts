import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { and, eq } from 'drizzle-orm';
import { LANES } from '../../../../src/lib/features/scrims/formation.ts';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import {
    drawAuctionLot,
    getAuction,
    saveAuctionSetup,
    startAuction
} from '../../../../src/lib/server/scrims/auction.ts';
import { champion, createGameFixture } from '../../support/domain-fixtures.ts';

async function fixture(t: TestContext) {
    const f = await createGameFixture(t);
    const [current] = await f.db
        .insert(schema.scrims)
        .values({
            guildId: f.guildId,
            mmrSeasonId: f.season.id,
            title: '현재 경매',
            teamCount: 2,
            status: 'preparing',
            formationMethod: 'auction'
        })
        .returning();
    const scrimId = current!.id;
    const teams = await f.db
        .insert(schema.scrimTeams)
        .values([1, 2].map((ordinal) => ({ scrimId, ordinal, name: `${ordinal}팀` })))
        .returning();
    const participants = await f.db
        .insert(schema.scrimParticipants)
        .values(
            f.users.slice(0, 10).map((user, index) => ({
                scrimId,
                userId: user.id,
                displayName: `현재 이름 ${index}`,
                riotAccountId: f.accounts[index]!.id
            }))
        )
        .returning();
    await f.db.insert(schema.scrimParticipantRegistrations).values(
        participants.map((participant) => ({
            scrimParticipantId: participant.id,
            status: 'selected' as const
        }))
    );
    const row = async () =>
        (await f.db.select().from(schema.scrims).where(eq(schema.scrims.id, scrimId)))[0]!;
    const revision = async () => ({ expectedRevision: (await row()).revision });
    const view = async () => (await getAuction(f.db, null, f.guildId, scrimId, undefined, champion))!;
    const draw = async () => {
        await saveAuctionSetup(
            f.db,
            f.manager,
            f.guildId,
            scrimId,
            {
                ...(await revision()),
                teams: teams.map((_, index) => ({
                    captainId: participants[index + 8]!.id,
                    startPoints: 100
                }))
            },
            f.access
        );
        await startAuction(f.db, f.manager, f.guildId, scrimId, await revision(), f.access);
        await drawAuctionLot(f.db, f.manager, f.guildId, scrimId, await revision(), f.access);
        const state = await view();
        return {
            state,
            userId: state.openLot!.userId!,
            participantId: state.openLot!.participantId,
            index: f.users.findIndex((user) => user.id === state.openLot!.userId)
        };
    };
    return { ...f, currentScrimId: scrimId, currentParticipants: participants, view, draw, revision };
}

test('공개 경매는 현재 후보의 실제 0기록을 제공하고 후보가 없으면 조회하지 않는다', async (t) => {
    const f = await fixture(t);
    assert.equal((await f.view()).openProfile, null);
    const target = await f.draw();
    assert.ok(target.state.openProfile);
    assert.deepEqual(target.state.openProfile.summary, { games: 0, wins: 0, losses: 0 });
    assert.equal(target.state.openProfile.mainLane, null);
    assert.deepEqual(target.state.openProfile.laneGames, {
        top: 0,
        jungle: 0,
        mid: 0,
        bot: 0,
        support: 0
    });
    assert.deepEqual(target.state.openProfile.championRecords, []);
    assert.deepEqual(target.state.openProfile.recentGames, []);
    assert.deepEqual(target.state.openProfile.preferredChampions, []);
    assert.equal(target.state.openProfile.riot, null);
    const before = await f.revision();
    assert.deepEqual((await f.view()).openProfile, target.state.openProfile);
    assert.deepEqual(await f.revision(), before);
});

test('경매 참고 전적은 희망 위치와 별개인 실출전·진영 승패·실제 null을 보존한다', async (t) => {
    const f = await fixture(t);
    const first = await f.createGame(f.db, 1, f.match.id, 'a', {
        startedAt: new Date('2026-01-01T00:00:00Z'),
        champion: 'Ahri'
    });
    const second = await f.createGame(f.db, 2, f.match.id, 'b', { missingStats: true });
    const target = await f.draw();
    await f.db.insert(schema.scrimParticipantPreferences).values({
        scrimParticipantId: target.participantId,
        position: LANES[(target.index + 1) % 5]!,
        priority: 1
    });
    await f.db
        .update(schema.gameParticipants)
        .set({ position: null })
        .where(
            and(
                eq(schema.gameParticipants.gameId, second.id),
                eq(schema.gameParticipants.scrimParticipantId, f.participants[target.index]!.id)
            )
        );
    const profile = (await f.view()).openProfile!;
    assert.deepEqual(profile.summary, { games: 2, wins: 1, losses: 1 });
    assert.equal(profile.mainLane, LANES[target.index % 5]);
    assert.equal(profile.laneGames[LANES[target.index % 5]!], 1);
    assert.equal(
        Object.values(profile.laneGames).reduce((sum, games) => sum + games, 0),
        1
    );
    assert.deepEqual(profile.championRecords, [
        { champion: champion('Ahri'), games: 1, wins: target.index < 5 ? 1 : 0 }
    ]);
    assert.deepEqual(profile.recentGames, [
        {
            id: first.id,
            champion: champion('Ahri'),
            lane: LANES[target.index % 5],
            win: target.index < 5,
            playedAt: '2026-01-01T00:00:00.000Z'
        },
        {
            id: second.id,
            champion: { id: 'unknown', name: '미확인', iconUrl: null },
            lane: null,
            win: target.index >= 5,
            playedAt: null
        }
    ]);
    assert.equal(profile.recentChronologyKnown, false);
    assert.deepEqual(profile.preferredChampions, []);
    assert.equal(profile.riot, null);
});

test('경매는 MSM1처럼 상위 세 챔피언과 여덟 게임만 제공하고 전체 승패는 유지한다', async (t) => {
    const f = await fixture(t);
    const [other] = await f.db.insert(schema.matches).values(f.matchValues).returning();
    const picks = ['Ahri', 'Zed', 'Ahri', 'Lux', 'Ahri', 'Zed', 'Ashe', 'Ahri', 'Lux', 'Zed'];
    const ids: string[] = [];
    for (const [index, pick] of picks.entries()) {
        const game = await f.createGame(f.db, (index % 5) + 1, index < 5 ? f.match.id : other!.id, 'a', {
            startedAt: new Date(Date.UTC(2026, 0, index + 1)),
            champion: pick,
            winnerSide: index % 2 ? 'red' : 'blue'
        });
        ids.push(game.id);
    }
    await f.draw();
    const profile = (await f.view()).openProfile!;
    assert.deepEqual(profile.summary, { games: 10, wins: 5, losses: 5 });
    assert.deepEqual(
        profile.championRecords.map((record) => [record.champion.id, record.games]),
        [
            ['Ahri', 4],
            ['Zed', 3],
            ['Lux', 2]
        ]
    );
    assert.deepEqual(
        profile.recentGames.map((game) => game.id),
        ids.slice(2).reverse()
    );
    assert.equal(profile.recentChronologyKnown, true);
});

test('출전 수가 같은 주력 위치는 기존 개인 전적처럼 최근 확인 기록의 위치를 유지한다', async (t) => {
    const f = await fixture(t);
    await f.createGame(f.db, 1, f.match.id, 'a', {
        startedAt: new Date('2026-01-01T00:00:00Z')
    });
    const second = await f.createGame(f.db, 2, f.match.id, 'a', {
        startedAt: new Date('2026-02-01T00:00:00Z')
    });
    const target = await f.draw();
    const otherIndex = Math.floor(target.index / 5) * 5 + ((target.index + 1) % 5);
    const recentLane = LANES[(target.index + 1) % 5]!;
    await f.db
        .update(schema.gameParticipants)
        .set({ position: null })
        .where(
            and(
                eq(schema.gameParticipants.gameId, second.id),
                eq(schema.gameParticipants.scrimParticipantId, f.participants[otherIndex]!.id)
            )
        );
    await f.db
        .update(schema.gameParticipants)
        .set({ position: recentLane })
        .where(
            and(
                eq(schema.gameParticipants.gameId, second.id),
                eq(schema.gameParticipants.scrimParticipantId, f.participants[target.index]!.id)
            )
        );
    const profile = (await f.view()).openProfile!;
    assert.equal(profile.laneGames[LANES[target.index % 5]!], 1);
    assert.equal(profile.laneGames[recentLane], 1);
    assert.equal(profile.mainLane, recentLane);
});

test('활성 시즌이 바뀌어도 경매에 고정한 시즌의 참고 전적을 읽는다', async (t) => {
    const f = await fixture(t);
    await f.createGame(f.db, 1);
    await f.draw();
    await f.db
        .update(schema.mmrSeasons)
        .set({ endedAt: new Date() })
        .where(eq(schema.mmrSeasons.id, f.season.id));
    const [next] = await f.db
        .insert(schema.mmrSeasons)
        .values({ guildId: f.guildId, name: '다음 시즌' })
        .returning();
    assert.equal((await f.view()).openProfile!.summary.games, 1);
    await f.db.update(schema.scrims).set({ mmrSeasonId: next!.id }).where(eq(schema.scrims.id, f.scrimId));
    assert.equal((await f.view()).openProfile!.summary.games, 0);
    const [other] = await f.db
        .insert(schema.mmrSeasons)
        .values({ guildId: f.otherGuildId, name: '다른 서버 시즌' })
        .returning();
    await f.db
        .update(schema.scrims)
        .set({ guildId: f.otherGuildId, mmrSeasonId: other!.id })
        .where(eq(schema.scrims.id, f.scrimId));
    assert.equal((await f.view()).openProfile!.summary.games, 0);
});

test('미완료·취소 세트와 취소 부모는 제외하며 중도 종료의 유효 결과는 유지한다', async (t) => {
    const f = await fixture(t);
    await f.createGame(f.db, 1);
    const pending = await f.createGame(f.db, 2);
    await f.db
        .update(schema.games)
        .set({ status: 'pending', winnerSide: null })
        .where(eq(schema.games.id, pending.id));
    const cancelled = await f.createGame(f.db, 3);
    await f.db
        .update(schema.games)
        .set({ status: 'cancelled', winnerSide: null })
        .where(eq(schema.games.id, cancelled.id));
    await f.draw();
    assert.equal((await f.view()).openProfile!.summary.games, 1);
    await f.db.update(schema.matches).set({ status: 'cancelled' }).where(eq(schema.matches.id, f.match.id));
    assert.equal((await f.view()).openProfile!.summary.games, 0);
    await f.db.update(schema.matches).set({ status: 'ended_early' }).where(eq(schema.matches.id, f.match.id));
    assert.equal((await f.view()).openProfile!.summary.games, 1);
    await f.db.update(schema.scrims).set({ status: 'cancelled' }).where(eq(schema.scrims.id, f.scrimId));
    assert.equal((await f.view()).openProfile!.summary.games, 0);
    await f.db.update(schema.scrims).set({ status: 'ended_early' }).where(eq(schema.scrims.id, f.scrimId));
    assert.equal((await f.view()).openProfile!.summary.games, 1);
});

test('계정 소유자 변경은 당시 사용자의 경매 참고 기록을 바꾸지 않는다', async (t) => {
    const f = await fixture(t);
    await f.createGame(f.db, 1);
    const target = await f.draw();
    const before = (await f.view()).openProfile;
    await f.db
        .update(schema.guildRiotAccounts)
        .set({ userId: f.users[15]!.id, isPrimary: false })
        .where(
            and(
                eq(schema.guildRiotAccounts.guildId, f.guildId),
                eq(schema.guildRiotAccounts.riotAccountId, f.accounts[target.index]!.id)
            )
        );
    assert.deepEqual((await f.view()).openProfile, before);
});

test('후보의 사용자나 시즌 귀속이 미확인이면 임의의 0기록을 만들지 않는다', async (t) => {
    const f = await fixture(t);
    const target = await f.draw();
    await f.db
        .update(schema.scrimParticipants)
        .set({ userId: null })
        .where(eq(schema.scrimParticipants.id, target.participantId));
    assert.equal((await f.view()).openProfile, null);
    await f.db
        .update(schema.scrimParticipants)
        .set({ userId: target.userId })
        .where(eq(schema.scrimParticipants.id, target.participantId));
    await f.db.update(schema.scrims).set({ mmrSeasonId: null }).where(eq(schema.scrims.id, f.currentScrimId));
    assert.equal((await f.view()).openProfile, null);
});
