import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { cancelMockScrim, findMockScrimRecord, restoreMockCancelledScrim } from '../src/lib/mocks/scrims.ts';
import { getMockBracket, getMockBracketProgress } from '../src/lib/mocks/bracket.ts';
import { getMockMatch, type GameResolvers } from '../src/lib/mocks/matches.ts';
import {
    awardMockLot,
    drawMockLot,
    getMockAuction,
    revertMockLot,
    saveMockAuctionSetup,
    startMockAuction
} from '../src/lib/mocks/teams.ts';
import { endMockScrimEarly, getMockScrimOperations, revertMockScrim } from '../src/lib/mocks/workflow.ts';

import { guildId, mockScrim, skipPreviewDelay } from './support/mock-scrim.ts';

beforeEach(skipPreviewDelay);

for (const stage of ['recruit', 'preparing', 'ready'] as const)
    test(`개발 샘플 ${stage} 취소 복구는 원래 단계와 참가자를 보존한다`, async () => {
        const scrim = await mockScrim();
        scrim.status = stage;
        scrim.formationMethod = stage === 'recruit' ? null : 'manual';
        const before = structuredClone(scrim.participants);
        assert.equal(await cancelMockScrim(guildId, scrim.id), null);
        assert.equal((await getMockScrimOperations(guildId, scrim.id)).restore?.blockedReason, null);
        assert.equal(await restoreMockCancelledScrim(guildId, scrim.id), null);
        assert.equal(scrim.status, stage);
        assert.deepEqual(scrim.participants, before);
        assert.equal(scrim.cancelledFromStatus, null);
    });

test('개발 샘플 경매 취소 복구는 포인트·후보·마지막 행위 되돌리기를 보존한다', async () => {
    const scrim = await mockScrim();
    scrim.status = 'preparing';
    scrim.formationMethod = 'auction';
    const players = (await getMockAuction(guildId, scrim.id))!.players;
    await saveMockAuctionSetup(
        guildId,
        scrim.id,
        [0, 5].map((index) => ({ captainId: players[index]!.participantId, startPoints: 100 }))
    );
    await startMockAuction(guildId, scrim.id);
    await drawMockLot(guildId, scrim.id);
    const open = (await getMockAuction(guildId, scrim.id))!;
    await awardMockLot(guildId, scrim.id, open.teams[0]!.id, 25);
    const before = (await getMockAuction(guildId, scrim.id))!;
    assert.equal(await cancelMockScrim(guildId, scrim.id), null);
    assert.equal((await getMockAuction(guildId, scrim.id))!.status, 'cancelled');
    assert.equal(await restoreMockCancelledScrim(guildId, scrim.id), null);
    assert.deepEqual(await getMockAuction(guildId, scrim.id), before);
    assert.equal(await revertMockLot(guildId, scrim.id), null);
    assert.equal(
        (await getMockAuction(guildId, scrim.id))!.openLot?.participantId,
        open.openLot!.participantId
    );
});

test('개발 샘플의 근거 없는 과거 취소는 복구하지 않으며 새 진행 취소는 편성 준비로 복구한다', async () => {
    const scrim = await mockScrim();
    scrim.status = 'cancelled';
    assert.match(
        (await getMockScrimOperations(guildId, scrim.id)).restore?.blockedReason ?? '',
        /취소 전 단계/
    );
    assert.equal((await restoreMockCancelledScrim(guildId, scrim.id))?.status, 409);
    scrim.status = 'in_progress';
    scrim.formationMethod = 'manual';
    const participants = structuredClone(scrim.participants);
    assert.equal((await getMockScrimOperations(guildId, scrim.id)).cancelGameCount, 0);
    assert.equal(await cancelMockScrim(guildId, scrim.id), null);
    assert.equal((await getMockScrimOperations(guildId, scrim.id)).cancelledGameCount, 0);
    assert.equal(await restoreMockCancelledScrim(guildId, scrim.id), null);
    assert.equal(scrim.status, 'preparing');
    assert.deepEqual(scrim.participants, participants);
});

test('진행 샘플의 전체 취소는 과거 결과를 보존하되 재편성에 다시 주입하지 않는다', async () => {
    const scrim = findMockScrimRecord(guildId, 'devScrim004')!;
    assert.equal((await getMockBracketProgress(guildId, scrim.id))!.recordedGames, 2);
    assert.equal(await cancelMockScrim(guildId, scrim.id), null);
    assert.equal((await getMockScrimOperations(guildId, scrim.id)).cancelledGameCount, 2);
    const resolvers: GameResolvers = {
        champion: (id) => ({ id, name: id, iconUrl: null }),
        item: () => null,
        spell: () => null,
        rune: () => null,
        splash: () => null
    };
    const past = (await getMockMatch(guildId, 'devMatch001', null, resolvers))!;
    assert.equal(past.match.status, 'cancelled');
    assert.deepEqual([past.match.scoreA, past.match.scoreB], [0, 0]);
    assert.deepEqual(past.match.games, []);
    assert.equal(await restoreMockCancelledScrim(guildId, scrim.id), null);
    assert.equal(scrim.status, 'preparing');
    scrim.status = 'ready';
    assert.equal((await getMockBracketProgress(guildId, scrim.id))!.recordedGames, 0);
});

for (const stage of ['unselected', 'manual', 'auction', 'ready'] as const)
    test(`개발 샘플 ${stage} 중도 종료와 재개는 편성 전·대진 준비를 구분한다`, async () => {
        const scrim = await mockScrim();
        scrim.status = stage === 'ready' ? 'ready' : 'preparing';
        scrim.formationMethod = stage === 'unselected' ? null : stage === 'auction' ? 'auction' : 'manual';
        const status = scrim.status;
        const before = await getMockBracket(guildId, scrim.id);
        assert.equal(await endMockScrimEarly(guildId, scrim.id), null);
        assert.equal(scrim.endedEarlyFromStatus, status);
        if (status === 'preparing') assert.equal(await getMockBracket(guildId, scrim.id), null);
        assert.equal(await revertMockScrim(guildId, scrim.id), null);
        assert.equal(scrim.status, status);
        assert.deepEqual(await getMockBracket(guildId, scrim.id), before);
    });
