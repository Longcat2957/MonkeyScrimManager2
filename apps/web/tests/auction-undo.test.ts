import assert from 'node:assert/strict';
import test from 'node:test';
import { listMockGuildAudit, listMockMembers, setMockAuctionSeedPrice } from '../src/lib/mocks/admin.ts';
import { getMockAuctionLedger } from '../src/lib/mocks/auction-ledger.ts';
import { createMockScrim, findMockScrimRecord } from '../src/lib/mocks/scrims.ts';
import {
    assignMockCurrent,
    assignMockUnsold,
    awardMockLot,
    drawMockLot,
    getMockAuction,
    passMockLot,
    resetMockAuction,
    restoreMockUnsold,
    revertMockLot,
    saveMockAuctionSetup,
    startMockAuction
} from '../src/lib/mocks/teams.ts';

const guildId = 'devGuild001';

async function auctionScrim() {
    const id = await createMockScrim(guildId, {
        title: '경매 회귀',
        scheduledAt: null,
        teamCount: 2,
        reserveCapacity: 2,
        hardFearless: false
    });
    const scrim = findMockScrimRecord(guildId, id)!;
    scrim.participants = findMockScrimRecord(guildId, 'devScrim008')!
        .participants.slice(0, 10)
        .map((person, index) => ({
            ...person,
            registrationId: `${id}-r${index}`,
            userId: `${id}-u${index}`,
            riotAccountId: `${id}-a${index}`,
            status: 'selected'
        }));
    scrim.status = 'preparing';
    scrim.formationMethod = 'auction';
    return scrim;
}

for (const kind of ['draw', 'pass', 'award', 'assign_current', 'assign_unsold', 'restore'] as const)
    test(`개발 경매도 직전 ${kind}의 원래 상태를 복원하고 연속 취소를 막는다`, async () => {
        const scrim = await auctionScrim();
        const scrimId = scrim.id;
        const view = async () => (await getMockAuction(guildId, scrimId))!;
        assert.equal(
            await saveMockAuctionSetup(
                guildId,
                scrimId,
                (await view()).teams.map((_, index) => ({
                    captainId: scrim.participants[index]!.registrationId,
                    startPoints: 100
                }))
            ),
            null
        );
        assert.equal(await startMockAuction(guildId, scrimId), null);
        let participantId: string | undefined;
        if (kind !== 'draw') {
            assert.equal(await drawMockLot(guildId, scrimId), null);
            participantId = (await view()).openLot!.participantId;
            if (kind === 'restore' || kind === 'assign_unsold')
                assert.equal(await passMockLot(guildId, scrimId), null);
        }
        const before = await view();
        const teamId = before.teams[0]!.id;
        switch (kind) {
            case 'draw':
                assert.equal(await drawMockLot(guildId, scrimId), null);
                participantId = (await view()).openLot!.participantId;
                break;
            case 'pass':
                assert.equal(await passMockLot(guildId, scrimId), null);
                break;
            case 'award':
                assert.equal(await awardMockLot(guildId, scrimId, teamId, 25), null);
                break;
            case 'assign_current':
                assert.equal(await assignMockCurrent(guildId, scrimId, teamId), null);
                break;
            case 'assign_unsold':
                assert.equal(await assignMockUnsold(guildId, scrimId, participantId!, teamId), null);
                break;
            case 'restore':
                assert.equal(await restoreMockUnsold(guildId, scrimId, participantId!), null);
                break;
        }
        assert.equal((await view()).canRevert, true);
        assert.equal(await revertMockLot(guildId, scrimId), null);
        const after = await view();
        assert.equal(after.canRevert, false);
        assert.equal(after.openLot?.participantId ?? null, before.openLot?.participantId ?? null);
        assert.deepEqual(after.queue, before.queue);
        assert.deepEqual(after.unsold, before.unsold);
        assert.deepEqual(after.teams, before.teams);
        assert.equal((await revertMockLot(guildId, scrimId))?.status, 409);
        if (kind === 'draw') {
            assert.equal(await drawMockLot(guildId, scrimId), null);
            assert.equal((await view()).openLot?.participantId, participantId);
        }
    });

test('개발 경매는 유료 낙찰 평균 묶음대로 호명하고 대기 후보는 이름·참가 ID 순으로만 공개한다', async () => {
    const scrim = await auctionScrim();
    const players = scrim.participants;
    const first = await auctionScrim();
    first.status = 'ready';
    first.participants.forEach((p, index) => (p.userId = players[index]!.userId));
    const second = await auctionScrim();
    second.status = 'ready';
    // 두 번째 원장에서 5번은 40P, 4번은 146P, 3번은 252P에 다시 낙찰된다.
    second.participants[2]!.userId = players[5]!.userId;
    second.participants[4]!.userId = players[4]!.userId;
    second.participants[6]!.userId = players[3]!.userId;
    for (const [index, player] of players.entries()) player.displayName = index === 9 ? '가' : '나';
    const captains = players.slice(0, 2).map((p) => ({ captainId: p.registrationId, startPoints: 100 }));
    assert.equal(await saveMockAuctionSetup(guildId, scrim.id, captains), null);
    assert.equal(await startMockAuction(guildId, scrim.id), null);
    const remaining = [9, 2, 3, 4, 5, 6, 7, 8].map((index) => players[index]!.registrationId);
    for (const group of [
        [6, 3],
        [4, 5],
        [8, 2],
        [7, 9]
    ]) {
        const drawn: string[] = [];
        for (let i = 0; i < group.length; i++) {
            const before = (await getMockAuction(guildId, scrim.id))!;
            assert.deepEqual(
                before.queue.map((p) => p.participantId),
                remaining
            );
            assert.equal(before.openLot, null);
            assert.equal(before.openProfile, null);
            assert.equal(await drawMockLot(guildId, scrim.id), null);
            const id = (await getMockAuction(guildId, scrim.id))!.openLot!.participantId;
            assert.ok(remaining.includes(id));
            remaining.splice(remaining.indexOf(id), 1);
            drawn.push(id);
            assert.equal(await passMockLot(guildId, scrim.id), null);
        }
        assert.deepEqual(drawn.sort(), group.map((index) => players[index]!.registrationId).sort());
    }
});

test('개발 경매 보정가는 다음 호명 순서만 바꾸고 실제 낙찰 기록과 초기값을 보존한다', async (t) => {
    const scrim = await auctionScrim();
    const past = await auctionScrim();
    past.status = 'ready';
    for (let index = 2; index < 10; index++) {
        const userId = `u0${index}`;
        scrim.participants[index]!.userId = userId;
        past.participants[index]!.userId = userId;
    }
    const history = getMockAuctionLedger(guildId);
    const page = { q: '', page: 1, pageSize: 100 };
    t.after(() => {
        for (const userId of ['u02', 'u03', 'u07']) setMockAuctionSeedPrice(guildId, userId, null);
        setMockAuctionSeedPrice(guildId, 'u02', null, 'override');
    });
    setMockAuctionSeedPrice(guildId, 'u02', 3000);
    setMockAuctionSeedPrice(guildId, 'u03', 4000);
    setMockAuctionSeedPrice(guildId, 'u07', 350);
    const auditCount = listMockGuildAudit(guildId, 1, 1).total;
    setMockAuctionSeedPrice(guildId, 'u02', 450, 'override');
    setMockAuctionSeedPrice(guildId, 'u02', 450, 'override');
    const audit = listMockGuildAudit(guildId, 1, 1);
    assert.equal(audit.total, auditCount + 1);
    assert.equal(audit.entries[0]?.kind, 'auction_override_price_changed');
    const { members } = listMockMembers(guildId, page);
    const paid = members.find((member) => member.userId === 'u02')!;
    assert.equal(paid.auctionAveragePrice, 40);
    assert.equal(paid.auctionPurchaseCount, 1);
    assert.equal(paid.auctionSeedPrice, 3000);
    assert.equal(paid.auctionOverridePrice, 450);
    const unpaid = members.find((member) => member.userId === 'u07')!;
    assert.equal(unpaid.auctionAveragePrice, null);
    assert.equal(unpaid.auctionPurchaseCount, 0);

    const captains = scrim.participants.slice(0, 2).map((p) => ({
        captainId: p.registrationId,
        startPoints: 100
    }));
    assert.equal(await saveMockAuctionSetup(guildId, scrim.id, captains), null);
    assert.equal(await startMockAuction(guildId, scrim.id), null);
    setMockAuctionSeedPrice(guildId, 'u02', null, 'override');
    const cleared = listMockMembers(guildId, page).members.find((member) => member.userId === 'u02')!;
    assert.equal(cleared.auctionOverridePrice, null);
    assert.equal(cleared.auctionSeedPrice, 3000);
    assert.deepEqual(getMockAuctionLedger(guildId), history);

    async function firstPair() {
        const ids: (string | null)[] = [];
        for (let index = 0; index < 2; index++) {
            assert.equal(await drawMockLot(guildId, scrim.id), null);
            const view = (await getMockAuction(guildId, scrim.id))!;
            assert.doesNotMatch(
                JSON.stringify(view),
                /"auction(?:Override|Seed|Average)Price"|"auctionPurchaseCount"/
            );
            ids.push(view.openLot!.userId);
            assert.equal(await passMockLot(guildId, scrim.id), null);
        }
        return ids.sort();
    }
    assert.deepEqual(await firstPair(), ['u02', 'u07']);
    assert.equal(await resetMockAuction(guildId, scrim.id), null);
    assert.deepEqual(await firstPair(), ['u06', 'u07']);
});
