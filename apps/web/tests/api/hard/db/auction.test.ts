import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { type TestContext } from 'node:test';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import type { AuctionView } from '../../../../src/lib/features/scrims/formation.ts';
import { listGuildMembers } from '../../../../src/lib/server/accounts/queries.ts';
import {
    assignAuctionCandidate,
    assignAuctionCurrent,
    awardAuctionLot,
    confirmAuctionFormation,
    drawAuctionLot,
    getAuction,
    passAuctionLot,
    reopenAuctionSetup,
    resetAuction,
    restoreAuctionUnsold,
    revertAuctionLot,
    saveAuctionSetup,
    startAuction
} from '../../../../src/lib/server/scrims/auction.ts';
import { chooseFormationMethod, reopenFormation } from '../../../../src/lib/server/scrims/workflow.ts';
import { createFormationFixture, concurrently, errorCode } from '../../support/domain-fixtures.ts';

async function fixture(t: TestContext) {
    const f = await createFormationFixture(t, 2, 'auction');
    const setup = f.teams.map((_, index) => ({ captainId: f.participants[index]!.id, startPoints: 100 }));
    const view = async () => (await getAuction(f.db, null, f.guildId, f.scrimId))!;
    const start = async () => {
        await saveAuctionSetup(
            f.db,
            f.manager,
            f.guildId,
            f.scrimId,
            { ...(await f.revision()), teams: setup },
            f.access
        );
        await startAuction(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    };
    const draw = async () => {
        await drawAuctionLot(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
        return (await view()).openLotId!;
    };
    return { ...f, setup, view, start, draw };
}

function assertPartition(view: AuctionView) {
    const ids = [
        ...view.teams.flatMap((team) => team.members.map((member) => member.player.participantId)),
        ...view.queue.map((player) => player.participantId),
        ...view.unsold.map((player) => player.participantId),
        ...(view.openLot ? [view.openLot.participantId] : [])
    ];
    assert.equal(ids.length, view.players.length);
    assert.equal(new Set(ids).size, ids.length);
}

test('공개 경매는 관리자만 설정·시작하고 진행 중에는 팀장·예산을 다시 설정하지 못한다', async (t) => {
    const f = await fixture(t);
    assert.equal((await f.view()).status, 'setup');
    assert.equal((await f.db.select().from(schema.auctions)).length, 0);
    await assert.rejects(
        startAuction(f.db, null, f.guildId, f.scrimId, await f.revision(), f.access),
        errorCode('UNAUTHENTICATED')
    );
    await assert.rejects(
        startAuction(f.db, f.viewer, f.guildId, f.scrimId, await f.revision(), f.access),
        errorCode('FORBIDDEN')
    );
    await saveAuctionSetup(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        { ...(await f.revision()), teams: [f.setup[0], { captainId: null, startPoints: 100 }] },
        f.access
    );
    await assert.rejects(
        startAuction(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access),
        errorCode('CONFLICT')
    );
    await saveAuctionSetup(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        { ...(await f.revision()), teams: [...f.setup].reverse() },
        f.access
    );
    await startAuction(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    const started = await f.view();
    assert.deepEqual(
        started.teams.map((team) => team.captainId),
        [...f.setup].reverse().map((team) => team.captainId)
    );
    assertPartition(started);
    await assert.rejects(
        saveAuctionSetup(
            f.db,
            f.manager,
            f.guildId,
            f.scrimId,
            { ...(await f.revision()), teams: f.setup },
            f.access
        ),
        errorCode('CONFLICT')
    );
    assert.deepEqual(await f.view(), started);
});

test('후보 순서는 서버의 실제 유상 낙찰 평균을 따르고 공개 대기 명단은 이름순이다', async (t) => {
    const f = await fixture(t);
    const [oldSeason] = await f.db
        .insert(schema.mmrSeasons)
        .values({
            guildId: f.guildId,
            name: '이전 시즌',
            startedAt: new Date(-2000),
            endedAt: new Date(-1000)
        })
        .returning();
    const at = new Date();
    async function history(
        sales: [number, number | null][],
        {
            guildId = f.guildId,
            seasonId = oldSeason!.id as string | null,
            completed = true,
            cancelled = false,
            activeTeam = true,
            voidedPlayer = -1
        } = {}
    ) {
        const scrimId = randomUUID();
        const auctionId = randomUUID();
        const teamId = randomUUID();
        await f.db.insert(schema.scrims).values({
            id: scrimId,
            guildId,
            mmrSeasonId: seasonId,
            title: '과거 경매',
            status: cancelled ? 'cancelled' : 'ready',
            formationMethod: 'auction'
        });
        await f.db.insert(schema.auctions).values({
            id: auctionId,
            scrimId,
            status: completed ? 'completed' : 'in_progress'
        });
        await f.db.insert(schema.scrimTeams).values({
            id: teamId,
            scrimId,
            ordinal: 1,
            name: '과거 팀',
            isActive: activeTeam
        });
        const participants = [0, ...sales.map(([index]) => index)].map((index) => ({
            scrimId,
            id: randomUUID(),
            userId: f.users[index]!.id,
            displayName: '당시 이름'
        }));
        await f.db.insert(schema.scrimParticipants).values(participants);
        const scope = { scrimId, auctionId };
        const buyer = participants[0]!.id;
        await f.db.insert(schema.auctionTeams).values({
            ...scope,
            teamId,
            captainParticipantId: buyer,
            initialPoints: 1000
        });
        const lots = sales.map((_, i) => ({
            ...scope,
            id: randomUUID(),
            sequenceNumber: i + 1,
            scrimParticipantId: participants[i + 1]!.id,
            status: 'sold' as const,
            openedAt: at,
            closedAt: at
        }));
        await f.db.insert(schema.auctionLots).values(lots);
        await f.db.insert(schema.auctionAcquisitions).values(
            sales.map(([index, price], i) => ({
                ...scope,
                teamId,
                scrimParticipantId: lots[i]!.scrimParticipantId,
                lotId: lots[i]!.id,
                buyerParticipantId: price === null ? null : buyer,
                price,
                method: price === null ? ('manual' as const) : ('auction' as const),
                acquiredAt: at,
                voidedAt: index === voidedPlayer ? at : null,
                voidReason: index === voidedPlayer ? '정정' : null
            }))
        );
    }
    await history(
        [
            [2, 1000],
            [4, 30],
            [5, 35],
            [6, 5],
            [7, 70],
            [8, 149],
            [9, 80]
        ],
        { voidedPlayer: 2 }
    );
    await history(
        [
            [6, 122],
            [7, null],
            [8, 1],
            [9, 0]
        ],
        { seasonId: f.season.id }
    );
    await history([[2, 1000]], { guildId: f.otherGuildId, seasonId: null });
    await history([[2, 1000]], { completed: false });
    await history([[2, 1000]], { cancelled: true });
    await history([[2, 1000]], { activeTeam: false });
    async function memberPrices(index: number) {
        const user = f.users[index]!;
        const result = await listGuildMembers(
            f.db,
            f.manager,
            f.guildId,
            { q: user.username, page: 1, pageSize: 20 },
            f.access
        );
        const member = result.members.find((row) => row.userId === user.id)!;
        return { average: member.auctionAveragePrice, count: member.auctionPurchaseCount };
    }
    assert.deepEqual(await memberPrices(2), { average: null, count: 0 });
    assert.deepEqual(await memberPrices(6), { average: 63.5, count: 2 });
    assert.deepEqual(await memberPrices(7), { average: 70, count: 1 });
    assert.deepEqual(await memberPrices(9), { average: 80, count: 1 });
    const privatePlayers = [2, 3, 9];
    await f.db
        .update(schema.users)
        .set({ publicProfile: false })
        .where(
            inArray(
                schema.users.id,
                privatePlayers.map((i) => f.users[i]!.id)
            )
        );
    await f.start();
    const stored = async () => {
        const entries = await f.db
            .select({ id: schema.auctionQueueEntries.scrimParticipantId })
            .from(schema.auctionQueueEntries)
            .where(eq(schema.auctionQueueEntries.scrimId, f.scrimId))
            .orderBy(asc(schema.auctionQueueEntries.ordinal));
        return entries.map(({ id }) => id);
    };
    const order = await stored();
    const candidateIds = f.participants
        .slice(2)
        .map((p) => p.id)
        .sort();
    assert.deepEqual(order.toSorted(), candidateIds);
    await history([[2, 100]]);
    assert.deepEqual(await memberPrices(2), { average: 100, count: 1 });
    const expected = [
        ...privatePlayers.map((i) => f.participants[i]!.id).sort(),
        ...f.participants.slice(4, 9).map((p) => p.id)
    ];
    const managerView = await getAuction(f.db, f.manager, f.guildId, f.scrimId, f.access);
    for (const view of [await f.view(), managerView!]) {
        assert.equal(view.openPriceHistory, null);
        assert.deepEqual(
            view.queue.map((p) => p.participantId),
            expected
        );
    }
    assert.deepEqual(await stored(), order);
    const waiting = new Set(expected);
    for (const id of order) {
        await drawAuctionLot(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
        const view = await f.view();
        assert.equal(view.openLot?.participantId, id);
        waiting.delete(id);
        assert.deepEqual(
            view.queue.map((p) => p.participantId),
            [...waiting]
        );
        const index = f.participants.findIndex((p) => p.id === id);
        const { average, count } = await memberPrices(index);
        assert.deepEqual(view.openPriceHistory, count ? { average, count } : null);
        if (privatePlayers.includes(index)) assert.ok(!JSON.stringify(view).includes(f.users[index]!.id));
        await passAuctionLot(
            f.db,
            f.manager,
            f.guildId,
            f.scrimId,
            { ...(await f.revision()), lotId: view.openLotId! },
            f.access
        );
    }
    await resetAuction(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    assert.deepEqual((await stored()).sort(), candidateIds);
});

test('잘못된 lot와 예산 초과 낙찰은 후보·포인트·revision을 바꾸지 않는다', async (t) => {
    const f = await fixture(t);
    await f.start();
    const lotId = await f.draw();
    const revision = await f.revision();
    for (const input of [
        { lotId: randomUUID(), price: 1 },
        { lotId, price: 101 }
    ]) {
        await assert.rejects(
            awardAuctionLot(
                f.db,
                f.manager,
                f.guildId,
                f.scrimId,
                { ...revision, ...input, teamId: f.teams[0]!.id },
                f.access
            ),
            errorCode('CONFLICT')
        );
    }
    const state = await f.view();
    assert.deepEqual(await f.revision(), revision);
    assert.equal(state.openLotId, lotId);
    assert.deepEqual(
        state.teams.map((team) => team.remainingPoints),
        [100, 100]
    );
    assert.equal((await f.db.select().from(schema.auctionAcquisitions)).length, 0);
});

test('0점 낙찰은 가격을 기록하고 되돌리면 후보를 복원한다', async (t) => {
    const f = await fixture(t);
    await f.start();
    const lotId = await f.draw();
    const participantId = (await f.view()).openLot!.participantId;
    const input = { ...(await f.revision()), lotId, teamId: f.teams[0]!.id, price: 0 };
    await awardAuctionLot(f.db, f.manager, f.guildId, f.scrimId, input, f.access);
    const awarded = await f.view();
    assert.equal(awarded.history.at(-1)?.price, 0);
    assert.equal(awarded.teams[0]?.remainingPoints, 100);
    await revertAuctionLot(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    const restored = await f.view();
    assert.equal(restored.openLot?.participantId, participantId);
    assert.ok(restored.history.every((entry) => entry.voided));
    assertPartition(restored);
});

test('낙찰 후 다음 추첨을 되돌리면 낙찰과 포인트를 유지한다', async (t) => {
    const f = await fixture(t);
    await f.start();
    const lotId = await f.draw();
    const previous = (await f.view()).openLot!.participantId;
    await awardAuctionLot(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        { ...(await f.revision()), lotId, teamId: f.teams[0]!.id, price: 10 },
        f.access
    );
    await f.draw();
    const next = (await f.view()).openLot!.participantId;
    await revertAuctionLot(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    const state = await f.view();
    assert.equal(state.openLot, null);
    assert.ok(state.queue.some((player) => player.participantId === next));
    await f.draw();
    assert.equal((await f.view()).openLot?.participantId, next);
    assert.equal(state.teams[0]?.remainingPoints, 90);
    assert.ok(state.teams[0]!.members.some((entry) => entry.player.participantId === previous));
    assertPartition(state);
});

test('대기 후보 수동 배치는 진행 중인 후보와 예산을 보존하고 원래 추첨 순서로 되돌린다', async (t) => {
    const f = await fixture(t);
    await f.start();
    const passed = await f.draw();
    await passAuctionLot(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        { ...(await f.revision()), lotId: passed },
        f.access
    );
    const openId = await f.draw();
    const before = await f.view();
    const queue = () =>
        f.db
            .select({
                id: schema.auctionQueueEntries.scrimParticipantId,
                ordinal: schema.auctionQueueEntries.ordinal
            })
            .from(schema.auctionQueueEntries)
            .orderBy(schema.auctionQueueEntries.ordinal);
    const order = await queue();
    const target = order[2]!;
    const team = before.teams[0]!;
    const stale = await f.revision();
    const assign = (participantId: string, revision = stale) =>
        assignAuctionCandidate(
            f.db,
            f.manager,
            f.guildId,
            f.scrimId,
            { ...revision, participantId, teamId: team.id },
            f.access
        );
    const unavailable = [
        before.openLot!.participantId,
        before.unsold[0]!.participantId,
        team.captainId!,
        randomUUID()
    ];
    for (const id of unavailable) await assert.rejects(assign(id), errorCode('CONFLICT'));
    await assign(target.id);
    await assert.rejects(assign(order[1]!.id), errorCode('CONFLICT'));
    await assert.rejects(assign(target.id, await f.revision()), errorCode('CONFLICT'));
    const assigned = await f.view();
    assert.equal(assigned.openLotId, openId);
    assert.deepEqual(
        assigned.teams.map((entry) => entry.remainingPoints),
        [100, 100]
    );
    assert.deepEqual(
        await queue(),
        order.filter((entry) => entry.id !== target.id)
    );
    assert.deepEqual(
        assigned.queue,
        before.queue.filter((entry) => entry.participantId !== target.id)
    );
    assertPartition(assigned);
    const [sale] = await f.db.select().from(schema.auctionAcquisitions);
    assert.equal(sale!.method, 'manual');
    assert.equal(sale!.price, null);
    assert.equal(sale!.buyerParticipantId, null);
    assert.equal(sale!.scrimParticipantId, target.id);
    assert.equal(sale!.teamId, team.id);
    const history = assigned.history.at(-1)!;
    assert.equal(history.id, sale!.lotId);
    assert.equal(history.result, 'manual');
    assert.equal(history.price, null);
    const actions = await f.db
        .select()
        .from(schema.auctionActions)
        .orderBy(schema.auctionActions.sequenceNumber);
    assert.deepEqual(
        actions.map((entry) => entry.kind),
        ['draw', 'pass', 'draw', 'assign_queued']
    );
    assert.equal(actions.at(-1)!.queueOrdinal, target.ordinal);

    await revertAuctionLot(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    const restored = await f.view();
    assert.equal(restored.openLotId, openId);
    assert.deepEqual(operationalState(restored), operationalState(before));
    assert.deepEqual(await queue(), order);
    assert.equal(restored.history.at(-1)!.voided, true);
    assert.equal(restored.canRevert, false);
});

test('유찰 수동 배치와 초기화는 원장을 삭제하지 않고 무효화한다', async (t) => {
    const f = await fixture(t);
    await f.start();
    const lotId = await f.draw();
    const participantId = (await f.view()).openLot!.participantId;
    await passAuctionLot(f.db, f.manager, f.guildId, f.scrimId, { ...(await f.revision()), lotId }, f.access);
    await assert.rejects(
        assignAuctionCandidate(
            f.db,
            f.manager,
            f.guildId,
            f.scrimId,
            { ...(await f.revision()), participantId, teamId: randomUUID() },
            f.access
        ),
        errorCode('NOT_FOUND')
    );
    await assignAuctionCandidate(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        { ...(await f.revision()), participantId, teamId: f.teams[0]!.id },
        f.access
    );
    await f.draw();
    await resetAuction(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    const state = await f.view();
    assert.equal(state.queue.length, 8);
    assert.equal(state.openLot, null);
    assert.ok(state.history.length > 0 && state.history.every((entry) => entry.voided));
    assertPartition(state);
    await reopenAuctionSetup(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    assert.equal((await f.view()).status, 'setup');
    assert.deepEqual(
        (await f.view()).teams.map((team) => team.captainId),
        f.setup.map((team) => team.captainId)
    );
});

test('모든 팀이 다섯 명이면 편성을 완료하고 복귀·방식 변경에도 이력을 보존한다', async (t) => {
    const f = await fixture(t);
    await f.start();
    for (let index = 0; index < 8; index++) {
        const lotId = await f.draw();
        if (index === 4)
            await assert.rejects(
                assignAuctionCurrent(
                    f.db,
                    f.manager,
                    f.guildId,
                    f.scrimId,
                    { ...(await f.revision()), lotId, teamId: f.teams[0]!.id },
                    f.access
                ),
                errorCode('CONFLICT')
            );
        await awardAuctionLot(
            f.db,
            f.manager,
            f.guildId,
            f.scrimId,
            { ...(await f.revision()), lotId, teamId: f.teams[Math.floor(index / 4)]!.id, price: 1 },
            f.access
        );
    }
    assert.equal((await f.view()).status, 'completed');
    assert.equal((await f.view()).canRevert, false);
    await assert.rejects(
        revertAuctionLot(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access),
        errorCode('CONFLICT')
    );
    assert.equal((await f.row()).status, 'ready');
    assert.deepEqual(
        (await f.view()).teams.map((team) => team.remainingPoints),
        [96, 96]
    );
    assert.ok(
        (await f.db.select().from(schema.scrimParticipants)).every(
            (row) => row.teamId && row.position === null
        )
    );
    await assert.rejects(
        resetAuction(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access),
        errorCode('CONFLICT')
    );
    const ledger = () =>
        f.db.select().from(schema.auctionAcquisitions).orderBy(schema.auctionAcquisitions.id);
    const before = await f.view();
    const purchases = await ledger();
    const actions = await f.db
        .select()
        .from(schema.auctionActions)
        .orderBy(schema.auctionActions.sequenceNumber);
    await reopenFormation(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        { ...(await f.revision()), formationMethod: 'auction' },
        f.access
    );
    assert.deepEqual((await f.view()).teams, before.teams);
    assert.deepEqual(await ledger(), purchases);
    assert.deepEqual(
        await f.db.select().from(schema.auctionActions).orderBy(schema.auctionActions.sequenceNumber),
        actions
    );
    assert.equal((await f.view()).canRevert, true);
    await confirmAuctionFormation(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    assert.equal((await f.row()).status, 'ready');
    assert.equal((await f.view()).status, 'completed');
    assert.deepEqual(await ledger(), purchases);
    assert.deepEqual((await f.view()).teams, before.teams);
    await reopenFormation(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        { ...(await f.revision()), formationMethod: 'auction' },
        f.access
    );
    await revertAuctionLot(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    assert.equal((await ledger()).filter((entry) => !entry.voidedAt).length, 7);
    assert.deepEqual(
        (await f.view()).teams.map((team) => team.remainingPoints),
        [96, 97]
    );
    assert.ok((await f.view()).openLotId);
    assert.equal((await f.db.select().from(schema.scrimBracketNodes)).length, 0);
    await assert.rejects(
        confirmAuctionFormation(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access),
        errorCode('CONFLICT')
    );
    await chooseFormationMethod(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        { ...(await f.revision()), method: null },
        f.access
    );
    assert.equal((await f.db.select().from(schema.auctions))[0]?.status, 'cancelled');
    assert.equal(
        (
            await f.db
                .select()
                .from(schema.auctionAcquisitions)
                .where(isNull(schema.auctionAcquisitions.voidedAt))
        ).length,
        0
    );
    assert.ok((await f.db.select().from(schema.scrimParticipants)).every((row) => row.teamId === null));
    await chooseFormationMethod(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        { ...(await f.revision()), method: 'auction' },
        f.access
    );
    assert.equal((await f.view()).status, 'setup');
    assert.ok((await f.view()).history.length > 0);
    assert.ok((await f.db.select().from(schema.auctionActions)).every((action) => action.invalidatedAt));
});

test('동일 후보 동시 낙찰은 한 영입과 한 번의 포인트 차감만 남긴다', async (t) => {
    const f = await fixture(t);
    await f.start();
    const lotId = await f.draw(),
        revision = await f.revision();
    const results = await concurrently(
        f.teams.map(
            (team) => () =>
                awardAuctionLot(
                    f.db,
                    f.manager,
                    f.guildId,
                    f.scrimId,
                    { ...revision, lotId, teamId: team.id, price: 10 },
                    f.access
                )
        )
    );
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(
        results.filter((result) => result.status === 'rejected' && errorCode('CONFLICT')(result.reason))
            .length,
        1
    );
    assert.equal(
        (
            await f.db
                .select()
                .from(schema.auctionAcquisitions)
                .where(
                    and(
                        eq(schema.auctionAcquisitions.scrimId, f.scrimId),
                        isNull(schema.auctionAcquisitions.voidedAt)
                    )
                )
        ).length,
        1
    );
    assert.equal(
        (await f.view()).teams.reduce((sum, team) => sum + team.remainingPoints, 0),
        190
    );
    await assert.rejects(
        drawAuctionLot(f.db, f.manager, f.guildId, f.scrimId, revision, f.access),
        errorCode('CONFLICT')
    );
    assertPartition(await f.view());
});

function operationalState(view: AuctionView) {
    return {
        open: view.openLot?.participantId ?? null,
        queue: view.queue.map((player) => player.participantId),
        unsold: view.unsold.map((player) => player.participantId).sort(),
        teams: view.teams.map((team) => ({
            id: team.id,
            points: team.remainingPoints,
            members: team.members.map((entry) => ({
                id: entry.player.participantId,
                via: entry.via,
                price: entry.price
            }))
        }))
    };
}

for (const kind of ['draw', 'pass', 'award', 'assign_current', 'assign_unsold', 'restore'] as const)
    test(`직전 ${kind} 작업만 한 번 취소하고 기존 원장·분할을 보존한다`, async (t) => {
        const f = await fixture(t);
        await f.start();
        assert.equal((await f.view()).canRevert, false);
        let lotId: string | undefined;
        let participantId: string | undefined;
        if (kind !== 'draw') {
            lotId = await f.draw();
            participantId = (await f.view()).openLot!.participantId;
            if (kind === 'assign_unsold' || kind === 'restore')
                await passAuctionLot(
                    f.db,
                    f.manager,
                    f.guildId,
                    f.scrimId,
                    { ...(await f.revision()), lotId },
                    f.access
                );
        }
        const before = operationalState(await f.view());
        if (kind === 'restore') {
            assert.equal(before.open, null);
            assert.deepEqual(before.unsold, [participantId]);
        }
        const input = {
            ...(await f.revision()),
            lotId: lotId!,
            participantId: participantId!,
            teamId: f.teams[0]!.id
        };
        switch (kind) {
            case 'draw':
                await f.draw();
                break;
            case 'pass':
                await passAuctionLot(f.db, f.manager, f.guildId, f.scrimId, input, f.access);
                break;
            case 'award':
                await awardAuctionLot(
                    f.db,
                    f.manager,
                    f.guildId,
                    f.scrimId,
                    { ...input, price: 35 },
                    f.access
                );
                break;
            case 'assign_current':
                await assignAuctionCurrent(f.db, f.manager, f.guildId, f.scrimId, input, f.access);
                break;
            case 'assign_unsold':
                await assignAuctionCandidate(f.db, f.manager, f.guildId, f.scrimId, input, f.access);
                break;
            case 'restore':
                await restoreAuctionUnsold(f.db, f.manager, f.guildId, f.scrimId, input, f.access);
                break;
        }
        const applied = await f.view();
        assert.equal(applied.canRevert, true);
        if (kind === 'assign_current') {
            assert.equal(applied.history.at(-1)?.price, null);
            assert.equal(applied.teams[0]?.remainingPoints, 100);
        }
        const originals = await f.db.select().from(schema.auctionActions);
        const original = originals.at(-1)!;
        assert.equal(original.kind, kind);
        await revertAuctionLot(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
        const after = await f.view();
        assert.deepEqual(operationalState(after), before);
        if (kind === 'assign_current') assert.ok(after.history.every((entry) => entry.voided));
        assertPartition(after);
        assert.equal(after.canRevert, false);
        const actions = await f.db.select().from(schema.auctionActions);
        assert.equal(actions.length, originals.length + 1);
        assert.equal(actions.at(-1)!.kind, 'revert');
        assert.equal(actions.at(-1)!.reversesId, original.id);
        await assert.rejects(
            revertAuctionLot(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access),
            errorCode('CONFLICT')
        );
        assert.equal((await f.db.select().from(schema.auctionActions)).length, actions.length);
        if (kind === 'draw') {
            await f.draw();
            assert.equal((await f.view()).canRevert, true);
        }
    });

test('행위 원장이 없는 기존 경매는 과거 추첨을 추정해 취소하지 않는다', async (t) => {
    const f = await fixture(t);
    await f.start();
    const lotId = await f.draw();
    await awardAuctionLot(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        { ...(await f.revision()), lotId, teamId: f.teams[0]!.id, price: 30 },
        f.access
    );
    // migration 이전의 lot·영입만 있는 경매를 재현한다.
    await f.db.delete(schema.auctionActions);
    const before = await f.view();
    assert.equal(before.canRevert, false);
    await assert.rejects(
        revertAuctionLot(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access),
        errorCode('CONFLICT')
    );
    assert.deepEqual(await f.view(), before);
    await f.draw();
    await revertAuctionLot(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    assert.equal((await f.view()).teams[0]!.remainingPoints, 70);
    assert.equal((await f.view()).history.filter((entry) => !entry.voided).length, 1);
});

test('초기화·준비 복귀는 행위 경계를 끊고 이전 작업을 복원하지 않는다', async (t) => {
    const f = await fixture(t);
    await f.start();
    await f.draw();
    await resetAuction(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    assert.equal((await f.view()).canRevert, false);
    assert.ok((await f.db.select().from(schema.auctionActions)).every((action) => action.invalidatedAt));
    await assert.rejects(
        revertAuctionLot(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access),
        errorCode('CONFLICT')
    );
    await f.draw();
    await reopenAuctionSetup(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    await startAuction(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    assert.equal((await f.view()).canRevert, false);
    await f.draw();
    assert.equal((await f.view()).canRevert, true);
});

test('같은 revision의 되돌리기는 한 번만 커밋하고 역기록 하나를 남긴다', async (t) => {
    const f = await fixture(t);
    await f.start();
    await f.draw();
    const input = await f.revision();
    const results = await concurrently([
        () => revertAuctionLot(f.db, f.manager, f.guildId, f.scrimId, input, f.access),
        () => revertAuctionLot(f.db, f.manager, f.guildId, f.scrimId, input, f.access)
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(
        (await f.db.select().from(schema.auctionActions)).filter((action) => action.kind === 'revert').length,
        1
    );
    assert.equal((await f.view()).queue.length, 8);
    assertPartition(await f.view());
});
