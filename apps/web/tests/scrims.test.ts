import assert from 'node:assert/strict';
import test from 'node:test';
import { getMockBracket } from '../src/lib/mocks/bracket.ts';
import { createMockScrim, findMockScrimRecord, registerMock, setMockParticipantStatus, withdrawMock } from '../src/lib/mocks/scrims.ts';
import { getMockManualFormation } from '../src/lib/mocks/teams.ts';
import { advanceMockScrim, endMockScrimEarly, getMockScrimOperations, revertMockScrim } from '../src/lib/mocks/workflow.ts';

const guildId = 'devGuild001';

// 실출전 10명 중 9명이 이미 선발된 모집을 만든다. 참가자는 devScrim008에서 빌린다.
async function nearlyFullScrim() {
	const scrimId = await createMockScrim(guildId, { title: '자동 선발 테스트', scheduledAt: null, teamCount: 2, reserveCapacity: 2, hardFearless: false });
	const scrim = findMockScrimRecord(guildId, scrimId)!;
	scrim.participants = findMockScrimRecord(guildId, 'devScrim008')!.participants.slice(0, 9).map((participant, index) => ({
		...participant, registrationId: `${scrimId}-r${index}`, userId: `${scrimId}-u${index}`, riotAccountId: `${scrimId}-a${index}`, status: 'selected'
	}));
	return { scrimId, scrim };
}

const register = (scrimId: string, key: string) =>
	registerMock(guildId, scrimId, { userId: key, displayName: key, riotAccountId: `acc-${key}`, riotId: `${key}#KR1`, positions: ['mid'] });

const statusOf = (scrimId: string, userId: string) => findMockScrimRecord(guildId, scrimId)!.participants.find((item) => item.userId === userId)?.status;

test('신청하면 선발 자리가 남았을 때 선발, 찼으면 대기가 되고 빈자리는 먼저 신청한 대기자가 채운다', async () => {
	const { scrimId } = await nearlyFullScrim();
	assert.equal(await register(scrimId, 'tenth'), null);
	assert.equal(await register(scrimId, 'late1'), null);
	assert.equal(await register(scrimId, 'late2'), null);
	assert.equal(statusOf(scrimId, 'tenth'), 'selected');
	assert.equal(statusOf(scrimId, 'late1'), 'standby');

	assert.equal(await withdrawMock(guildId, scrimId, 'tenth'), null);
	assert.equal(statusOf(scrimId, 'late1'), 'selected');
	assert.equal(statusOf(scrimId, 'late2'), 'standby');

	// 운영자가 대기로 돌린 자리는 자동으로 채우지 않고, 제외로 빈 자리만 채운다.
	const late1 = findMockScrimRecord(guildId, scrimId)!.participants.find((item) => item.userId === 'late1')!;
	assert.equal(await setMockParticipantStatus(guildId, scrimId, [late1.registrationId], 'excluded'), null);
	assert.equal(statusOf(scrimId, 'late2'), 'selected');
});

test('모집 마감 때 편성 방식을 고르고, 되돌리면 방식과 편성이 지워진다', async () => {
	const { scrimId, scrim } = await nearlyFullScrim();
	assert.equal(scrim.formationMethod, null);
	assert.equal((await advanceMockScrim(guildId, scrimId, 'close', 'manual'))?.status, 409);
	await register(scrimId, 'tenth');
	assert.equal((await advanceMockScrim(guildId, scrimId, 'close', null))?.status, 400);
	assert.equal(await advanceMockScrim(guildId, scrimId, 'close', 'manual'), null);
	assert.equal(scrim.status, 'preparing');
	assert.equal(scrim.formationMethod, 'manual');

	const formation = (await getMockManualFormation(guildId, scrimId))!;
	assert.deepEqual(formation.teams.map((team) => team.name), ['포로팀', '칼날부리팀']);

	assert.equal((await getMockScrimOperations(guildId, scrimId)).revert?.label, '모집 다시 열기');
	assert.equal(await revertMockScrim(guildId, scrimId), null);
	assert.equal(scrim.status, 'recruit');
	assert.equal(scrim.formationMethod, null);
});

test('결승 1:1에서 중도 종료하면 점수를 남기고, 되돌리면 다시 진행 중이 된다', async () => {
	const scrimId = 'devScrim004';
	const operations = await getMockScrimOperations(guildId, scrimId);
	assert.equal(operations.endEarly, true);
	assert.equal(operations.nextAction?.blockedReason, '모든 경기가 끝나야 해요');
	assert.equal(operations.revert?.blockedReason, '기록된 게임이 있어 되돌릴 수 없어요');

	assert.equal(await endMockScrimEarly(guildId, scrimId), null);
	let final = (await getMockBracket(guildId, scrimId))!.matches[0]!;
	assert.equal(findMockScrimRecord(guildId, scrimId)!.status, 'ended_early');
	assert.deepEqual([final.status, final.scoreA, final.scoreB, final.winner], ['ended_early', 1, 1, null]);

	assert.equal(await revertMockScrim(guildId, scrimId), null);
	final = (await getMockBracket(guildId, scrimId))!.matches[0]!;
	assert.equal(findMockScrimRecord(guildId, scrimId)!.status, 'in_progress');
	assert.equal(final.status, 'in_progress');
});
