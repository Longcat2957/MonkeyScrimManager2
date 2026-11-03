import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { and, asc, eq } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { applyGameMmr, lockMmrSeason, reverseGameMmr } from '../../../../src/lib/server/mmr/service.ts';
import { createGameFixture, concurrently, errorCode } from '../../support/domain-fixtures.ts';

const conflict = errorCode('CONFLICT');

test('동일 Game 동시 반영은 실제 시각 없이 한 회차·열 원장만 생성한다', async (t) => {
	const f = await createGameFixture(t);
	const game = await f.createGame(f.db, 1, f.match.id, 'b');
	assert.equal(game.startedAt, null);
	const results = await concurrently([() => f.apply(game.id), () => f.apply(game.id)]);
	assert.ok(results.every((result) => result.status === 'fulfilled'));
	const values = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
	assert.deepEqual(values.map((value) => value.status).sort(), ['already_applied', 'applied']);
	assert.equal(new Set(values.map((value) => value.applicationId)).size, 1);
	assert.equal((await f.db.select().from(schema.gameMmrApplications)).length, 1);
	assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 10);
	const ratings = await f.ratings();
	assert.equal(ratings.length, 10);
	assert.ok(ratings.every((row) => row.revision === 1));
	assert.equal(ratings[0]!.mmr, 1484);
	assert.equal(ratings[5]!.mmr, 1516);
});

test('시즌이 종료되어도 내전의 고정 시즌에 반영하고 다른 서버 요청은 거절한다', async (t) => {
	const f = await createGameFixture(t);
	const game = await f.createGame(f.db, 1);
	await f.db.update(schema.mmrSeasons).set({ endedAt: new Date('2026-11-03T12:00:00Z') }).where(eq(schema.mmrSeasons.id, f.season.id));
	await f.db.insert(schema.mmrSeasons).values({ guildId: f.guildId, name: '새 시즌' });
	await assert.rejects(f.db.transaction((tx) => applyGameMmr(tx, f.otherGuildId, game.id, null)), errorCode('NOT_FOUND'));
	await f.apply(game.id);
	assert.ok((await f.ratings()).every((row) => row.seasonId === f.season.id));
});

for (const missing of ['game', 'application'] as const) test(`선행 ${missing} 누락 시 다음 슬롯의 MMR은 반영하지 않는다`, async (t) => {
	const f = await createGameFixture(t);
	if (missing === 'application') await f.createGame(f.db, 1);
	const second = await f.createGame(f.db, 2);
	await assert.rejects(f.apply(second.id), conflict);
	assert.equal((await f.ratings()).length, 0);
	assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 0);
});

test('마지막 Game부터 연속 역분개하고 재반영 회차를 이전 재시도와 구분한다', async (t) => {
	const f = await createGameFixture(t);
	const first = await f.createGame(f.db, 1), firstApplication = await f.apply(first.id);
	const second = await f.createGame(f.db, 2), secondApplication = await f.apply(second.id);
	assert.ok(!Number.isInteger((await f.ratings())[0]!.mmr));
	await assert.rejects(f.reverse(first.id, firstApplication.applicationId), conflict);
	await f.reverse(second.id, secondApplication.applicationId);
	await f.reverse(first.id, firstApplication.applicationId);
	assert.ok((await f.ratings()).every((row) => row.mmr === 1500 && row.revision === 4));
	assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 40);
	await f.db.update(schema.games).set({ status: 'completed', winnerSide: 'blue' }).where(eq(schema.games.id, first.id));
	const replacement = await f.apply(first.id);
	assert.notEqual(replacement.applicationId, firstApplication.applicationId);
	assert.equal((await f.reverse(first.id, firstApplication.applicationId)).status, 'already_reversed');
	const applications = await f.db.select().from(schema.gameMmrApplications).where(eq(schema.gameMmrApplications.gameId, first.id)).orderBy(asc(schema.gameMmrApplications.revision));
	assert.deepEqual(applications.map((row) => row.revision), [1, 2]);
	assert.equal(applications[1]!.reversedAt, null);
	assert.ok((await f.ratings()).every((row) => row.revision === 5));
});

test('다른 Match에 남은 후속 반영이 있으면 이전 MMR을 역분개하지 않는다', async (t) => {
	const f = await createGameFixture(t);
	const first = await f.createGame(f.db, 1), application = await f.apply(first.id);
	const [match] = await f.db.insert(schema.matches).values(f.matchValues).returning();
	await f.apply((await f.createGame(f.db, 1, match!.id)).id);
	await assert.rejects(f.reverse(first.id, application.applicationId), conflict);
	assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 20);
});

test('점수가 같은 관리 보정도 이미 반영된 결과의 역분개를 막는다', async (t) => {
	const f = await createGameFixture(t);
	const game = await f.createGame(f.db, 1), application = await f.apply(game.id);
	const rating = (await f.ratings())[0]!;
	await f.db.transaction(async (tx) => {
		await lockMmrSeason(tx, f.guildId, f.season.id);
		await tx.insert(schema.mmrLedgerEntries).values({ seasonId: f.season.id, ratingId: rating.id, revision: rating.revision + 1,
			kind: 'adjustment', beforeMmr: rating.mmr, afterMmr: rating.mmr, reason: '동일 점수 보정' });
		await tx.update(schema.userPositionMmr).set({ revision: rating.revision + 1 }).where(eq(schema.userPositionMmr.id, rating.id));
	});
	await assert.rejects(f.reverse(game.id, application.applicationId), conflict);
	assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 11);
});

test('상위 결과 트랜잭션 실패는 Game·출전·MMR·ROFL 선별 자료를 모두 롤백한다', async (t) => {
	const f = await createGameFixture(t);
	await assert.rejects(f.db.transaction(async (tx) => {
		await lockMmrSeason(tx, f.guildId, f.season.id);
		const game = await f.createGame(tx, 1);
		await applyGameMmr(tx, f.guildId, game.id, null);
		throw new Error('대진 갱신 실패');
	}), /대진 갱신 실패/);
	for (const table of [schema.games, schema.gameParticipants, schema.roflMetadata, schema.roflGameDataV1, schema.roflParticipantDataV1, schema.gameMmrApplications, schema.mmrLedgerEntries, schema.userPositionMmr]) {
		assert.equal((await f.db.select().from(table)).length, 0);
	}
});

test('반영 중 실행자 FK 실패는 새 점수와 반영 회차를 남기지 않는다', async (t) => {
	const f = await createGameFixture(t);
	const game = await f.createGame(f.db, 1);
	await assert.rejects(f.db.transaction((tx) => applyGameMmr(tx, f.guildId, game.id, '존재하지 않는 실행자')));
	for (const table of [schema.gameMmrApplications, schema.mmrLedgerEntries, schema.userPositionMmr]) assert.equal((await f.db.select().from(table)).length, 0);
	assert.equal((await f.apply(game.id)).status, 'applied');
});

test('선행 역분개 없이 채택 ROFL을 바꾼 비정상 자료는 반영·역분개를 거절한다', async (t) => {
	const f = await createGameFixture(t);
	const game = await f.createGame(f.db, 1), application = await f.apply(game.id);
	const [replacement] = await f.db.insert(schema.roflMetadata).values({ fileSha256: randomBytes(32).toString('hex'), fileSizeBytes: 100, formatVersion: 2, gameVersion: '26.21', projectionVersion: 1 }).returning();
	await f.db.delete(schema.gameParticipants).where(eq(schema.gameParticipants.gameId, game.id));
	await f.db.update(schema.games).set({ roflMetadataId: replacement!.id }).where(eq(schema.games.id, game.id));
	await assert.rejects(f.apply(game.id), conflict);
	await assert.rejects(f.reverse(game.id, application.applicationId), conflict);
	assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 10);
});

for (const invalid of ['position', 'participant', 'cancelledMatch', 'cancelledScrim', 'season', 'pending'] as const) test(`${invalid} 조건을 충족하지 못한 Game은 점수를 생성하지 않는다`, async (t) => {
	const f = await createGameFixture(t);
	const game = await f.createGame(f.db, 1);
	const target = and(eq(schema.gameParticipants.gameId, game.id), eq(schema.gameParticipants.scrimParticipantId, f.participants[0]!.id));
	if (invalid === 'position') await f.db.update(schema.gameParticipants).set({ position: null }).where(target);
	if (invalid === 'participant') await f.db.delete(schema.gameParticipants).where(target);
	if (invalid === 'cancelledMatch') await f.db.update(schema.matches).set({ status: 'cancelled' }).where(eq(schema.matches.id, f.match.id));
	if (invalid === 'cancelledScrim') await f.db.update(schema.scrims).set({ status: 'cancelled' }).where(eq(schema.scrims.id, f.scrimId));
	if (invalid === 'season') await f.db.update(schema.scrims).set({ mmrSeasonId: null }).where(eq(schema.scrims.id, f.scrimId));
	if (invalid === 'pending') await f.db.update(schema.games).set({ status: 'pending', winnerSide: null }).where(eq(schema.games.id, game.id));
	await assert.rejects(f.apply(game.id), conflict);
	assert.equal((await f.ratings()).length, 0);
	assert.equal((await f.db.select().from(schema.gameMmrApplications)).length, 0);
});

test('현재 revision 손상과 다른 반영 ID·빈 사유는 기존 원장을 바꾸지 않는다', async (t) => {
	const f = await createGameFixture(t);
	const game = await f.createGame(f.db, 1), application = await f.apply(game.id);
	await assert.rejects(f.reverse(game.id, randomUUID()), errorCode('NOT_FOUND'));
	await assert.rejects(f.db.transaction((tx) => reverseGameMmr(tx, f.guildId, game.id, { applicationId: application.applicationId, actorUserId: null, reason: ' ' })), errorCode('INVALID_INPUT'));
	await f.db.update(schema.userPositionMmr).set({ revision: 2 }).where(eq(schema.userPositionMmr.id, (await f.ratings())[0]!.id));
	await assert.rejects(f.reverse(game.id, application.applicationId), conflict);
	assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 10);
});

test('서로 다른 Match의 동시 결과도 동일 시즌 점수 revision을 연속으로 갱신한다', async (t) => {
	const f = await createGameFixture(t);
	const first = await f.createGame(f.db, 1);
	const [match] = await f.db.insert(schema.matches).values(f.matchValues).returning();
	const second = await f.createGame(f.db, 1, match!.id);
	const results = await concurrently([() => f.apply(first.id), () => f.apply(second.id)]);
	assert.ok(results.every((result) => result.status === 'fulfilled' && result.value.status === 'applied'));
	assert.ok((await f.ratings()).every((rating) => rating.revision === 2));
	assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 20);
	assert.ok(!Number.isInteger((await f.ratings())[0]!.mmr));
});

test('반영 재시도와 역분개가 경쟁해도 유효 반영을 다시 만들지 않는다', async (t) => {
	const f = await createGameFixture(t);
	const game = await f.createGame(f.db, 1), application = await f.apply(game.id);
	const results = await concurrently<unknown>([() => f.apply(game.id), () => f.reverse(game.id, application.applicationId)]);
	assert.equal(results[1]!.status, 'fulfilled');
	const retry = results[0]!;
	if (retry.status === 'fulfilled') assert.equal((retry.value as { status: string }).status, 'already_applied');
	else assert.ok(conflict(retry.reason));
	assert.ok((await f.ratings()).every((rating) => rating.mmr === 1500 && rating.revision === 2));
	assert.equal((await f.db.select().from(schema.gameMmrApplications)).length, 1);
	assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 20);
	assert.equal((await f.db.select().from(schema.games))[0]?.status, 'cancelled');
});
