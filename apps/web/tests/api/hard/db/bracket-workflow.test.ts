import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { eq } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { bracketSeats } from '../../../../src/lib/features/scrims/bracket.ts';
import { confirmManualFormation } from '../../../../src/lib/server/scrims/manual.ts';
import { confirmBracket, createResolvedMatches, getBracket, placeBracketTeam, resetBracket, setBracketBestOf, unlockBracket } from '../../../../src/lib/server/scrims/bracket.ts';
import { advanceScrim, endScrimEarly, revertScrim } from '../../../../src/lib/server/scrims/workflow.ts';
import { createFormationFixture, errorCode } from '../../support/domain-fixtures.ts';

async function ready(t: TestContext, count = 2) {
	const f = await createFormationFixture(t, count);
	await f.fill();
	await confirmManualFormation(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
	const view = async () => (await getBracket(f.db, null, f.guildId, f.scrimId))!;
	const seed = async () => {
		for (const [index, seat] of bracketSeats((await view()).matches).entries()) await placeBracketTeam(f.db, f.manager, f.guildId, f.scrimId,
			{ ...await f.revision(), seat: seat.key, teamId: f.teams[index]!.id }, f.access);
	};
	const start = async () => {
		await seed();
		await confirmBracket(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
		await advanceScrim(f.db, f.manager, f.guildId, f.scrimId, { ...await f.revision(), key: 'start' }, f.access);
	};
	return { ...f, view, seed, start };
}

for (const count of [2, 3, 4]) test(`${count}팀 대진은 양 팀이 정해진 Match만 생성한다`, async (t) => {
	const f = await ready(t, count);
	assert.equal((await f.view()).matches.length, count - 1);
	assert.equal((await f.view()).bestOf.final, count === 2 ? 3 : 5);
	await f.start();
	const matches = await f.db.select().from(schema.matches);
	assert.equal(matches.length, count === 4 ? 2 : 1);
	assert.ok(matches.every((match) => match.status === 'in_progress' && match.isHardFearless));
	assert.equal((await f.row()).status, 'in_progress');
	assert.equal((await f.db.select().from(schema.games)).length, 0);
});

test('팀 재배치와 초기화는 중복 시드를 없애고 BO 설정을 보존한다', async (t) => {
	const f = await ready(t, 3);
	await assert.rejects(confirmBracket(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access), errorCode('CONFLICT'));
	await setBracketBestOf(f.db, f.manager, f.guildId, f.scrimId, { ...await f.revision(), stage: 'final', bestOf: 1 }, f.access);
	await f.seed();
	const seats = bracketSeats((await f.view()).matches);
	await placeBracketTeam(f.db, f.manager, f.guildId, f.scrimId, { ...await f.revision(), seat: seats[1]!.key, teamId: f.teams[0]!.id }, f.access);
	const moved = bracketSeats((await f.view()).matches);
	assert.equal(moved[0]?.teamId, null);
	assert.equal(moved[1]?.teamId, f.teams[0]!.id);
	await resetBracket(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
	assert.ok(bracketSeats((await f.view()).matches).every((seat) => seat.teamId === null));
	assert.equal((await f.view()).bestOf.final, 1);
});

test('대진 확정 후 변경을 막고 확정 해제 뒤 다시 편집할 수 있다', async (t) => {
	const f = await ready(t);
	await f.seed();
	await confirmBracket(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
	await assert.rejects(setBracketBestOf(f.db, f.manager, f.guildId, f.scrimId, { ...await f.revision(), stage: 'final', bestOf: 1 }, f.access), errorCode('CONFLICT'));
	await unlockBracket(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
	await setBracketBestOf(f.db, f.manager, f.guildId, f.scrimId, { ...await f.revision(), stage: 'final', bestOf: 1 }, f.access);
	assert.equal((await f.view()).confirmed, false);
	assert.equal((await f.view()).bestOf.final, 1);
});

test('결과가 없는 시작은 되돌릴 수 있지만 Game이 있으면 삭제하지 않는다', async (t) => {
	const f = await ready(t);
	await f.start();
	await revertScrim(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
	assert.equal((await f.row()).status, 'ready');
	assert.equal((await f.db.select().from(schema.matches)).length, 0);
	await advanceScrim(f.db, f.manager, f.guildId, f.scrimId, { ...await f.revision(), key: 'start' }, f.access);
	const [match] = await f.db.select().from(schema.matches);
	const [game] = await f.db.insert(schema.games).values({ scrimId: f.scrimId, matchId: match!.id, gameNumber: 1, blueTeamSlot: 'a' }).returning();
	await assert.rejects(revertScrim(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access), errorCode('CONFLICT'));
	assert.equal((await f.db.select().from(schema.games))[0]?.id, game!.id);
});

test('중도 종료와 재개는 Match 이전 상태와 Game을 보존한다', async (t) => {
	const f = await ready(t, 4);
	await f.start();
	const before = await f.db.select().from(schema.matches);
	const [game] = await f.db.insert(schema.games).values({ scrimId: f.scrimId, matchId: before[0]!.id, gameNumber: 1, blueTeamSlot: 'a' }).returning();
	await endScrimEarly(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
	assert.ok((await f.db.select().from(schema.matches)).every((match) => match.status === 'ended_early' && match.statusBeforeScrimEnd === 'in_progress'));
	await revertScrim(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
	assert.ok((await f.db.select().from(schema.matches)).every((match) => match.status === 'in_progress' && match.statusBeforeScrimEnd === null));
	assert.equal((await f.db.select().from(schema.games))[0]?.id, game!.id);
});

for (const count of [3, 4]) test(`${count}팀 승자 확정 후 다음 Match 생성은 멱등이며 완료 내전을 재개할 수 있다`, async (t) => {
	const f = await ready(t, count);
	await f.start();
	await assert.rejects(advanceScrim(f.db, f.manager, f.guildId, f.scrimId, { ...await f.revision(), key: 'complete' }, f.access), errorCode('CONFLICT'));
	// 결과 등록 서비스는 아직 연결 전이다. 여기서는 완료 Match를 소비하는 대진 함수만 검증한다.
	for (const match of await f.db.select().from(schema.matches)) await f.db.update(schema.matches).set({ status: 'completed', winnerTeamId: match.teamAId }).where(eq(schema.matches.id, match.id));
	await f.db.transaction(async (tx) => {
		const [row] = await tx.select().from(schema.scrims).where(eq(schema.scrims.id, f.scrimId)).for('update');
		assert.equal(await createResolvedMatches(tx, row!), 1);
		assert.equal(await createResolvedMatches(tx, row!), 0);
	});
	const all = await f.db.select().from(schema.matches);
	assert.equal(all.length, count - 1);
	for (const match of all) await f.db.update(schema.matches).set({ status: 'completed', winnerTeamId: match.teamAId }).where(eq(schema.matches.id, match.id));
	await advanceScrim(f.db, f.manager, f.guildId, f.scrimId, { ...await f.revision(), key: 'complete' }, f.access);
	assert.equal((await f.row()).status, 'completed');
	await revertScrim(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
	assert.equal((await f.row()).status, 'in_progress');
});
