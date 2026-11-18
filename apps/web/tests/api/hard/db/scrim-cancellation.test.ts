import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { eq } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import {
    cancelScrim,
    createRegistration,
    restoreCancelledScrim
} from '../../../../src/lib/server/scrims/service.ts';
import { getScrimOperations, reopenFormation } from '../../../../src/lib/server/scrims/workflow.ts';
import { confirmManualFormation } from '../../../../src/lib/server/scrims/manual.ts';
import {
    awardAuctionLot,
    drawAuctionLot,
    getAuction,
    passAuctionLot,
    saveAuctionSetup,
    startAuction
} from '../../../../src/lib/server/scrims/auction.ts';
import {
    concurrently,
    createFormationFixture,
    createRecruitmentFixture,
    errorCode
} from '../../support/domain-fixtures.ts';
import { snapshotTables } from '../../support/database.ts';

type Fixture = Awaited<ReturnType<typeof createFormationFixture>>;
const cancel = async (f: Fixture) =>
    cancelScrim(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
const restore = async (f: Fixture) =>
    restoreCancelledScrim(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);

async function auctionFixture(t: TestContext) {
    const f = await createFormationFixture(t, 2, 'auction');
    await saveAuctionSetup(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        {
            ...(await f.revision()),
            teams: f.teams.map((_, index) => ({ captainId: f.participants[index]!.id, startPoints: 100 }))
        },
        f.access
    );
    await startAuction(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    const view = async () => (await getAuction(f.db, null, f.guildId, f.scrimId))!;
    const draw = async () => {
        await drawAuctionLot(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
        return (await view()).openLotId!;
    };
    return { ...f, view, draw };
}

test('모집 취소 복구는 신청·희망 포지션과 고정 시즌을 보존한다', async (t) => {
    const f = await createRecruitmentFixture(t);
    await createRegistration(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        { riotAccountId: f.accounts[0]!.id, positions: ['top', 'mid'] },
        f.access
    );
    const registrations = await f.db.select().from(schema.scrimParticipantRegistrations);
    const preferences = await f.db.select().from(schema.scrimParticipantPreferences);
    const before = await f.row();
    await cancelScrim(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    assert.equal((await f.row()).cancelledFromStatus, 'recruit');
    await restoreCancelledScrim(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    const after = await f.row();
    assert.equal(after.status, 'recruit');
    assert.equal(after.mmrSeasonId, before.mmrSeasonId);
    assert.equal(after.cancelledFromStatus, null);
    assert.equal(after.cancelledAuctionStatus, null);
    assert.deepEqual(await f.db.select().from(schema.scrimParticipantRegistrations), registrations);
    assert.deepEqual(await f.db.select().from(schema.scrimParticipantPreferences), preferences);
    assert.deepEqual(await f.db.select().from(schema.gameMmrApplications), []);
    assert.deepEqual(await f.db.select().from(schema.mmrLedgerEntries), []);
});

for (const status of ['preparing', 'ready'] as const)
    test(`${status} 취소 복구는 확정 여부·실제 배정·대진 초안을 그대로 복원한다`, async (t) => {
        const f = await createFormationFixture(t);
        await f.fill();
        if (status === 'ready')
            await confirmManualFormation(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
        const before = await f.row();
        const participants = await f.db.select().from(schema.scrimParticipants);
        const rounds = await f.db.select().from(schema.scrimRounds);
        const nodes = await f.db.select().from(schema.scrimBracketNodes);
        const slots = await f.db.select().from(schema.scrimBracketSlots);
        await cancel(f);
        await assert.rejects(
            reopenFormation(
                f.db,
                f.manager,
                f.guildId,
                f.scrimId,
                { ...(await f.revision()), formationMethod: 'manual' },
                f.access
            ),
            errorCode('CONFLICT')
        );
        await restore(f);
        assert.equal((await f.row()).status, status);
        assert.equal((await f.row()).formationMethod, before.formationMethod);
        assert.equal((await f.row()).bracketConfirmedAt?.getTime(), before.bracketConfirmedAt?.getTime());
        assert.deepEqual(await f.db.select().from(schema.scrimParticipants), participants);
        assert.deepEqual(await f.db.select().from(schema.scrimRounds), rounds);
        assert.deepEqual(await f.db.select().from(schema.scrimBracketNodes), nodes);
        assert.deepEqual(await f.db.select().from(schema.scrimBracketSlots), slots);
    });

test('진행 경매 취소 복구는 낙찰 포인트·유찰·현재 후보·대기열과 행위 이력을 보존한다', async (t) => {
    const f = await auctionFixture(t);
    const soldLotId = await f.draw();
    await awardAuctionLot(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        { ...(await f.revision()), lotId: soldLotId, teamId: f.teams[0]!.id, price: 30 },
        f.access
    );
    const unsoldLotId = await f.draw();
    await passAuctionLot(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        { ...(await f.revision()), lotId: unsoldLotId },
        f.access
    );
    await f.draw();
    const before = await f.view();
    const tables = [
        schema.auctionTeams,
        schema.auctionAcquisitions,
        schema.auctionLots,
        schema.auctionQueueEntries,
        schema.auctionActions
    ];
    const snapshots = await snapshotTables(f.db, tables);
    await cancel(f);
    assert.equal((await f.view()).status, 'cancelled');
    assert.equal((await f.row()).cancelledAuctionStatus, 'in_progress');
    await restore(f);
    assert.deepEqual(await f.view(), before);
    assert.deepEqual(await snapshotTables(f.db, tables), snapshots);
});

test('근거 없는 과거 취소는 복구하지 않고 관리자에게 차단 이유를 제공한다', async (t) => {
    const f = await createFormationFixture(t);
    await f.db.update(schema.scrims).set({ status: 'cancelled' }).where(eq(schema.scrims.id, f.scrimId));
    const before = await f.row();
    const operation = await getScrimOperations(f.db, f.manager, f.guildId, f.scrimId, f.access);
    assert.match(operation.restore?.blockedReason ?? '', /취소 전 단계/);
    await assert.rejects(restore(f), errorCode('CONFLICT'));
    assert.deepEqual(await f.row(), before);
    assert.equal((await getScrimOperations(f.db, null, f.guildId, f.scrimId)).restore, null);
});

test('완료 경매의 대진 준비 취소 복구는 완료 상태와 종료 시각을 유지한다', async (t) => {
    const f = await auctionFixture(t);
    while ((await f.view()).status === 'in_progress') {
        const lotId = await f.draw();
        const team = (await f.view()).teams.find((item) => item.members.length < 5)!;
        await awardAuctionLot(
            f.db,
            f.manager,
            f.guildId,
            f.scrimId,
            { ...(await f.revision()), lotId, teamId: team.id, price: 0 },
            f.access
        );
    }
    assert.equal((await f.row()).status, 'ready');
    const before = await f.view();
    const [auction] = await f.db.select().from(schema.auctions);
    await cancel(f);
    assert.equal((await f.row()).cancelledAuctionStatus, 'completed');
    await restore(f);
    assert.equal((await f.row()).status, 'ready');
    assert.deepEqual(await f.view(), before);
    assert.equal(
        (await f.db.select().from(schema.auctions))[0]?.endedAt?.getTime(),
        auction!.endedAt?.getTime()
    );
});

test('복구는 최신 관리자 권한·같은 서버·revision을 확인하고 중복 실행을 한 번만 반영한다', async (t) => {
    const f = await createFormationFixture(t);
    const stale = await f.revision();
    await cancel(f);
    await assert.rejects(
        restoreCancelledScrim(f.db, f.viewer, f.guildId, f.scrimId, await f.revision(), f.access),
        errorCode('FORBIDDEN')
    );
    await assert.rejects(
        restoreCancelledScrim(f.db, null, f.guildId, f.scrimId, await f.revision(), f.access),
        errorCode('UNAUTHENTICATED')
    );
    await assert.rejects(
        restoreCancelledScrim(f.db, f.manager, f.guildId, f.scrimId, stale, f.access),
        errorCode('CONFLICT')
    );
    await assert.rejects(
        restoreCancelledScrim(f.db, f.manager, f.otherGuildId, f.scrimId, await f.revision(), f.access)
    );
    const revision = await f.revision();
    const results = await concurrently([
        () => restoreCancelledScrim(f.db, f.manager, f.guildId, f.scrimId, revision, f.access),
        () => restoreCancelledScrim(f.db, f.manager, f.guildId, f.scrimId, revision, f.access)
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal((await f.row()).revision, revision.expectedRevision + 1);
    assert.equal((await f.row()).status, 'preparing');
});

test('취소 뒤 경매 근거가 어긋나면 기존 자료를 덮어쓰지 않고 복구를 거절한다', async (t) => {
    const f = await auctionFixture(t);
    await cancel(f);
    await f.db.update(schema.auctions).set({ status: 'setup' }).where(eq(schema.auctions.scrimId, f.scrimId));
    const before = await f.row();
    const operation = await getScrimOperations(f.db, f.manager, f.guildId, f.scrimId, f.access);
    assert.match(operation.restore?.blockedReason ?? '', /경매 상태/);
    await assert.rejects(restore(f), errorCode('CONFLICT'));
    assert.deepEqual(await f.row(), before);
});

test('게시 예약 실패는 취소 복구의 내전·경매 상태를 모두 롤백한다', async (t) => {
    const f = await auctionFixture(t);
    await f.db
        .insert(schema.guildDiscordSettings)
        .values({ guildId: f.guildId, recruitmentChannelId: '900' });
    await cancel(f);
    const before = await f.row();
    const auctions = await f.db.select().from(schema.auctions);
    await f.pool.query(`
        CREATE FUNCTION reject_restore_publication() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION '검증용 게시 예약 실패'; END $$;
        CREATE TRIGGER reject_restore_publication BEFORE INSERT OR UPDATE ON discord_publication_jobs
        FOR EACH ROW EXECUTE FUNCTION reject_restore_publication();
    `);
    await assert.rejects(restore(f));
    assert.deepEqual(await f.row(), before);
    assert.deepEqual(await f.db.select().from(schema.auctions), auctions);
});
