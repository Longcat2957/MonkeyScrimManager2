import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { listMockMembers } from '../src/lib/mocks/admin.ts';
import { guildId, mockScrim, skipPreviewDelay } from './support/mock-scrim.ts';
import {
    assignMockCurrent,
    assignMockCandidate,
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

beforeEach(skipPreviewDelay);

async function auctionScrim() {
    const scrim = await mockScrim({ reserveCapacity: 2 });
    scrim.status = 'preparing';
    scrim.formationMethod = 'auction';
    return scrim;
}

for (const kind of [
    'draw',
    'pass',
    'award',
    'assign_current',
    'assign_unsold',
    'assign_waiting',
    'restore'
] as const)
    test(`개발 경매도 직전 ${kind}의 원래 상태를 복원하고 연속 취소를 막는다`, async () => {
        const scrim = await auctionScrim();
        const scrimId = scrim.id;
        const view = async () => (await getMockAuction(guildId, scrimId))!;
        const captains = scrim.participants.slice(0, 2).map((p) => ({
            captainId: p.registrationId,
            startPoints: 100
        }));
        assert.equal(await saveMockAuctionSetup(guildId, scrimId, captains), null);
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
                assert.equal(await assignMockCandidate(guildId, scrimId, participantId!, teamId), null);
                break;
            case 'assign_waiting': {
                const waiting = before.queue[1]!.participantId;
                assert.equal((await assignMockCandidate(guildId, scrimId, waiting, 'missing'))?.status, 404);
                assert.equal(await assignMockCandidate(guildId, scrimId, waiting, teamId), null);
                const assigned = await view();
                assert.deepEqual(assigned.openLot, before.openLot);
                assert.deepEqual(
                    assigned.queue,
                    before.queue.filter((player) => player.participantId !== waiting)
                );
                const team = assigned.teams[0]!;
                assert.equal(team.remainingPoints, before.teams[0]!.remainingPoints);
                const member = team.members.at(-1)!;
                assert.equal(member.player.participantId, waiting);
                assert.equal(member.via, 'manual');
                assert.equal(member.price, null);
                break;
            }
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

test('개발 경매는 남은 후보를 이름·참가 ID 순으로 공개하고 각 후보를 한 번만 호명한다', async () => {
    const scrim = await auctionScrim();
    const players = scrim.participants;
    for (const [index, player] of players.entries()) player.displayName = index === 9 ? '가' : '나';
    const captains = players.slice(0, 2).map((p) => ({ captainId: p.registrationId, startPoints: 100 }));
    assert.equal(await saveMockAuctionSetup(guildId, scrim.id, captains), null);
    assert.equal(await startMockAuction(guildId, scrim.id), null);
    const remaining = [9, 2, 3, 4, 5, 6, 7, 8].map((index) => players[index]!.registrationId);
    const eligible = [...remaining];
    for (let turn = 0; turn < 8; turn++) {
        const before = (await getMockAuction(guildId, scrim.id))!;
        assert.deepEqual(
            before.queue.map((p) => p.participantId),
            remaining
        );
        assert.equal(before.openLot, null);
        assert.equal(before.openProfile, null);
        assert.equal(await drawMockLot(guildId, scrim.id), null);
        const view = (await getMockAuction(guildId, scrim.id))!;
        assert.doesNotMatch(JSON.stringify(view), /"auctionAveragePrice"|"auctionPurchaseCount"/);
        const id = view.openLot!.participantId;
        assert.ok(remaining.includes(id));
        remaining.splice(remaining.indexOf(id), 1);
        assert.equal(await passMockLot(guildId, scrim.id), null);
    }
    assert.equal(await resetMockAuction(guildId, scrim.id), null);
    assert.equal(await drawMockLot(guildId, scrim.id), null);
    assert.ok(eligible.includes((await getMockAuction(guildId, scrim.id))!.openLot!.participantId));
});

test('개발 멤버 목록은 유료 낙찰 기록이 없으면 평균을 비워 둔다', async () => {
    const past = await auctionScrim();
    past.status = 'ready';
    past.participants[2]!.userId = 'u02';
    past.participants[7]!.userId = 'u07';
    const { members } = listMockMembers(guildId, { q: '', page: 1, pageSize: 100 });
    const paid = members.find((member) => member.userId === 'u02')!;
    assert.equal(paid.auctionAveragePrice, 40);
    assert.equal(paid.auctionPurchaseCount, 1);
    const unpaid = members.find((member) => member.userId === 'u07')!;
    assert.equal(unpaid.auctionAveragePrice, null);
    assert.equal(unpaid.auctionPurchaseCount, 0);
});
