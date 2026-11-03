import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { type TestContext } from 'node:test';
import { and, eq, isNull } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import type { AuctionView } from '../../../../src/lib/features/scrims/formation.ts';
import { assignAuctionCurrent, assignAuctionUnsold, awardAuctionLot, drawAuctionLot, getAuction, passAuctionLot, reopenAuctionSetup, resetAuction, restoreAuctionUnsold, revertAuctionLot, saveAuctionSetup, shuffleAuctionQueue, startAuction } from '../../../../src/lib/server/scrims/auction.ts';
import { chooseFormationMethod, revertScrim } from '../../../../src/lib/server/scrims/workflow.ts';
import { createFormationFixture, concurrently, errorCode } from '../../support/domain-fixtures.ts';

async function fixture(t: TestContext) {
	const f = await createFormationFixture(t, 2, 'auction');
	const setup = f.teams.map((_, index) => ({ captainId: f.participants[index]!.id, startPoints: 100 }));
	const view = async () => (await getAuction(f.db, null, f.guildId, f.scrimId))!;
	const start = async () => {
		await saveAuctionSetup(f.db, f.manager, f.guildId, f.scrimId, { ...await f.revision(), teams: setup }, f.access);
		await startAuction(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
	};
	const draw = async () => {
		await drawAuctionLot(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
		return (await view()).openLotId!;
	};
	return { ...f, setup, view, start, draw };
}

function assertPartition(view: AuctionView) {
	const ids = [...view.teams.flatMap((team) => team.members.map((member) => member.player.participantId)), ...view.queue.map((player) => player.participantId),
		...view.unsold.map((player) => player.participantId), ...(view.openLot ? [view.openLot.participantId] : [])];
	assert.equal(ids.length, view.players.length);
	assert.equal(new Set(ids).size, ids.length);
}

test('경매 조회는 공개이며 부분 팀장 저장과 관리자 권한을 검증한다', async (t) => {
	const f = await fixture(t);
	assert.equal((await f.view()).status, 'setup');
	assert.equal((await f.db.select().from(schema.auctions)).length, 0);
	await assert.rejects(startAuction(f.db, null, f.guildId, f.scrimId, await f.revision(), f.access), errorCode('UNAUTHENTICATED'));
	await assert.rejects(startAuction(f.db, f.viewer, f.guildId, f.scrimId, await f.revision(), f.access), errorCode('FORBIDDEN'));
	await saveAuctionSetup(f.db, f.manager, f.guildId, f.scrimId, { ...await f.revision(), teams: [f.setup[0], { captainId: null, startPoints: 100 }] }, f.access);
	await assert.rejects(startAuction(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access), errorCode('CONFLICT'));
	await saveAuctionSetup(f.db, f.manager, f.guildId, f.scrimId, { ...await f.revision(), teams: [...f.setup].reverse() }, f.access);
	await startAuction(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
	assert.deepEqual((await f.view()).teams.map((team) => team.captainId), [...f.setup].reverse().map((team) => team.captainId));
	assertPartition(await f.view());
});

test('대기열 섞기는 후보를 유실·중복하지 않고 조회가 순서를 바꾸지 않는다', async (t) => {
	const f = await fixture(t);
	await f.start();
	const before = await f.view();
	assert.deepEqual((await f.view()).queue, before.queue);
	await shuffleAuctionQueue(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
	assert.deepEqual(new Set((await f.view()).queue.map((player) => player.participantId)), new Set(before.queue.map((player) => player.participantId)));
	await assert.rejects(saveAuctionSetup(f.db, f.manager, f.guildId, f.scrimId, { ...await f.revision(), teams: f.setup }, f.access), errorCode('CONFLICT'));
	assertPartition(await f.view());
});

test('잘못된 lot와 예산 초과 낙찰은 후보·포인트·revision을 바꾸지 않는다', async (t) => {
	const f = await fixture(t);
	await f.start();
	const lotId = await f.draw();
	const revision = await f.revision();
	for (const input of [{ lotId: randomUUID(), price: 1 }, { lotId, price: 101 }]) {
		await assert.rejects(awardAuctionLot(f.db, f.manager, f.guildId, f.scrimId, { ...revision, ...input, teamId: f.teams[0]!.id }, f.access), errorCode('CONFLICT'));
	}
	assert.deepEqual(await f.revision(), revision);
	assert.equal((await f.view()).openLotId, lotId);
	assert.deepEqual((await f.view()).teams.map((team) => team.remainingPoints), [100, 100]);
	assert.equal((await f.db.select().from(schema.auctionAcquisitions)).length, 0);
});

for (const manual of [false, true]) test(`${manual ? '수동 영입' : '0점 낙찰'}은 가격 근거를 구분하고 되돌리면 후보를 복원한다`, async (t) => {
	const f = await fixture(t);
	await f.start();
	const lotId = await f.draw();
	const participantId = (await f.view()).openLot!.participantId;
	const input = { ...await f.revision(), lotId, teamId: f.teams[0]!.id };
	if (manual) await assignAuctionCurrent(f.db, f.manager, f.guildId, f.scrimId, input, f.access);
	else await awardAuctionLot(f.db, f.manager, f.guildId, f.scrimId, { ...input, price: 0 }, f.access);
	assert.equal((await f.view()).history.at(-1)?.price, manual ? null : 0);
	assert.equal((await f.view()).teams[0]?.remainingPoints, 100);
	await revertAuctionLot(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
	const restored = await f.view();
	assert.equal(restored.openLot?.participantId, participantId);
	assert.ok(restored.history.every((entry) => entry.voided));
	assertPartition(restored);
});

test('유찰 복귀 후 이전 기록 되돌리기는 후보를 한 상태에만 복원한다', async (t) => {
	const f = await fixture(t);
	await f.start();
	const lotId = await f.draw();
	const participantId = (await f.view()).openLot!.participantId;
	await passAuctionLot(f.db, f.manager, f.guildId, f.scrimId, { ...await f.revision(), lotId }, f.access);
	assert.equal((await f.view()).unsold[0]?.participantId, participantId);
	await restoreAuctionUnsold(f.db, f.manager, f.guildId, f.scrimId, { ...await f.revision(), participantId }, f.access);
	await revertAuctionLot(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
	assert.equal((await f.view()).openLot?.participantId, participantId);
	assert.notEqual((await f.view()).openLotId, lotId);
	assertPartition(await f.view());
});

test('다음 후보를 추첨한 뒤 낙찰을 되돌리면 새 후보를 대기열에 보존한다', async (t) => {
	const f = await fixture(t);
	await f.start();
	const lotId = await f.draw();
	const previous = (await f.view()).openLot!.participantId;
	await awardAuctionLot(f.db, f.manager, f.guildId, f.scrimId, { ...await f.revision(), lotId, teamId: f.teams[0]!.id, price: 10 }, f.access);
	await f.draw();
	const next = (await f.view()).openLot!.participantId;
	await revertAuctionLot(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
	const state = await f.view();
	assert.equal(state.openLot?.participantId, previous);
	assert.equal(state.queue[0]?.participantId, next);
	assert.equal(state.teams[0]?.remainingPoints, 100);
	assertPartition(state);
});

test('유찰 수동 배치와 초기화는 원장을 삭제하지 않고 무효화한다', async (t) => {
	const f = await fixture(t);
	await f.start();
	const lotId = await f.draw();
	const participantId = (await f.view()).openLot!.participantId;
	await passAuctionLot(f.db, f.manager, f.guildId, f.scrimId, { ...await f.revision(), lotId }, f.access);
	await assert.rejects(assignAuctionUnsold(f.db, f.manager, f.guildId, f.scrimId, { ...await f.revision(), participantId, teamId: randomUUID() }, f.access), errorCode('NOT_FOUND'));
	await assignAuctionUnsold(f.db, f.manager, f.guildId, f.scrimId, { ...await f.revision(), participantId, teamId: f.teams[0]!.id }, f.access);
	await f.draw();
	await resetAuction(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
	const state = await f.view();
	assert.equal(state.queue.length, 8);
	assert.equal(state.openLot, null);
	assert.ok(state.history.length > 0 && state.history.every((entry) => entry.voided));
	assertPartition(state);
	await reopenAuctionSetup(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
	assert.equal((await f.view()).status, 'setup');
	assert.deepEqual((await f.view()).teams.map((team) => team.captainId), f.setup.map((team) => team.captainId));
});

test('모든 팀이 다섯 명이면 편성을 완료하고 복귀·방식 변경에도 이력을 보존한다', async (t) => {
	const f = await fixture(t);
	await f.start();
	for (let index = 0; index < 8; index++) {
		const lotId = await f.draw();
		if (index === 4) await assert.rejects(assignAuctionCurrent(f.db, f.manager, f.guildId, f.scrimId, { ...await f.revision(), lotId, teamId: f.teams[0]!.id }, f.access), errorCode('CONFLICT'));
		await awardAuctionLot(f.db, f.manager, f.guildId, f.scrimId, { ...await f.revision(), lotId, teamId: f.teams[Math.floor(index / 4)]!.id, price: 1 }, f.access);
	}
	assert.equal((await f.view()).status, 'completed');
	assert.equal((await f.row()).status, 'ready');
	assert.deepEqual((await f.view()).teams.map((team) => team.remainingPoints), [96, 96]);
	assert.ok((await f.db.select().from(schema.scrimParticipants)).every((row) => row.teamId && row.position === null));
	await assert.rejects(resetAuction(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access), errorCode('CONFLICT'));
	await revertScrim(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
	await revertAuctionLot(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
	assert.equal((await f.db.select().from(schema.scrimBracketNodes)).length, 0);
	await chooseFormationMethod(f.db, f.manager, f.guildId, f.scrimId, { ...await f.revision(), method: null }, f.access);
	assert.equal((await f.db.select().from(schema.auctions))[0]?.status, 'cancelled');
	assert.equal((await f.db.select().from(schema.auctionAcquisitions).where(isNull(schema.auctionAcquisitions.voidedAt))).length, 0);
	assert.ok((await f.db.select().from(schema.scrimParticipants)).every((row) => row.teamId === null));
	await chooseFormationMethod(f.db, f.manager, f.guildId, f.scrimId, { ...await f.revision(), method: 'auction' }, f.access);
	assert.equal((await f.view()).status, 'setup');
	assert.ok((await f.view()).history.length > 0);
});

test('동일 후보 동시 낙찰은 한 영입과 한 번의 포인트 차감만 남긴다', async (t) => {
	const f = await fixture(t);
	await f.start();
	const lotId = await f.draw(), revision = await f.revision();
	const results = await concurrently(f.teams.map((team) => () => awardAuctionLot(f.db, f.manager, f.guildId, f.scrimId, { ...revision, lotId, teamId: team.id, price: 10 }, f.access)));
	assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
	assert.equal(results.filter((result) => result.status === 'rejected' && errorCode('CONFLICT')(result.reason)).length, 1);
	assert.equal((await f.db.select().from(schema.auctionAcquisitions).where(and(eq(schema.auctionAcquisitions.scrimId, f.scrimId), isNull(schema.auctionAcquisitions.voidedAt)))).length, 1);
	assert.equal((await f.view()).teams.reduce((sum, team) => sum + team.remainingPoints, 0), 190);
	await assert.rejects(drawAuctionLot(f.db, f.manager, f.guildId, f.scrimId, revision, f.access), errorCode('CONFLICT'));
	assertPartition(await f.view());
});
