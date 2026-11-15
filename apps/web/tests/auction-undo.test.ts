import assert from 'node:assert/strict';
import test from 'node:test';
import { createMockScrim, findMockScrimRecord } from '../src/lib/mocks/scrims.ts';
import {
    assignMockCurrent,
    assignMockUnsold,
    awardMockLot,
    drawMockLot,
    getMockAuction,
    passMockLot,
    restoreMockUnsold,
    revertMockLot,
    saveMockAuctionSetup,
    startMockAuction
} from '../src/lib/mocks/teams.ts';

const guildId = 'devGuild001';

for (const kind of ['draw', 'pass', 'award', 'assign_current', 'assign_unsold', 'restore'] as const)
    test(`개발 경매도 직전 ${kind}의 원래 상태를 복원하고 연속 취소를 막는다`, async () => {
        const scrimId = await createMockScrim(guildId, {
            title: '경매 되돌리기 회귀',
            scheduledAt: null,
            teamCount: 2,
            reserveCapacity: 2,
            hardFearless: false
        });
        const scrim = findMockScrimRecord(guildId, scrimId)!;
        scrim.participants = findMockScrimRecord(guildId, 'devScrim008')!
            .participants.slice(0, 10)
            .map((person, index) => ({
                ...person,
                registrationId: `${scrimId}-r${index}`,
                userId: `${scrimId}-u${index}`,
                riotAccountId: `${scrimId}-a${index}`,
                status: 'selected'
            }));
        scrim.status = 'preparing';
        scrim.formationMethod = 'auction';
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
    });
