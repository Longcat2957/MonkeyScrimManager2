import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { and, asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client, Pool } from 'pg';
import * as schema from '../src/lib/server/db/schema.ts';
import type { Transaction } from '../src/lib/server/db/types.ts';
import { DomainError } from '../src/lib/server/errors.ts';
import { applyGameMmr, lockMmrSeason, reverseGameMmr } from '../src/lib/server/mmr/service.ts';
import { MMR_POSITIONS } from '../src/lib/server/mmr/rules.ts';

const database = { skip: !process.env.DATABASE_URL };
const conflict = (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT';

async function createFixture() {
	const name = `msm2_mmr_test_${randomUUID().replaceAll('-', '')}`;
	const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
	await client.connect();
	let pool: Pool | undefined;
	const close = async () => {
		try { if (pool) await pool.end(); await client.query(`DROP SCHEMA IF EXISTS "${name}" CASCADE`); }
		finally { await client.end(); }
	};
	try {
		await client.query('BEGIN');
		await client.query(`CREATE SCHEMA "${name}"`);
		await client.query(`SET LOCAL search_path TO "${name}"`);
		const baseline = await readFile(new URL('../drizzle/0000_initial_schema.sql', import.meta.url), 'utf8');
		await client.query(baseline.replaceAll('"public".', `"${name}".`).replace(/\bpublic\./g, `"${name}".`));
		await client.query('COMMIT');
		pool = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${name}`, max: 4 });
		const db = drizzle({ client: pool, schema });
		const guildId = '830000000000000001', otherGuildId = '830000000000000002';
		const users = Array.from({ length: 10 }, (_, index) => ({ id: String(840000000000000000n + BigInt(index)), username: `출전자 ${index}` }));
		await db.insert(schema.users).values(users);
		await db.insert(schema.guilds).values([{ id: guildId, name: 'MMR 검증' }, { id: otherGuildId, name: '다른 서버' }]);
		const [season] = await db.insert(schema.mmrSeasons).values({ guildId, name: '고정 시즌' }).returning();
		const [scrim] = await db.insert(schema.scrims).values({ guildId, mmrSeasonId: season!.id, title: 'MMR 내전', status: 'in_progress', formationMethod: 'manual' }).returning();
		const teams = await db.insert(schema.scrimTeams).values([1, 2].map((ordinal) => ({ scrimId: scrim!.id, ordinal, name: `${ordinal}팀` }))).returning();
		const matchValues = { scrimId: scrim!.id, teamAId: teams[0]!.id, teamBId: teams[1]!.id, bestOf: 5, isHardFearless: false, status: 'in_progress' as const };
		const [match] = await db.insert(schema.matches).values(matchValues).returning();
		// 현재 팀 편성과 실제 Game 출전이 독립임을 검증하도록 현재 포지션은 비운다.
		const participants = await db.insert(schema.scrimParticipants).values(users.map((user, index) => ({ scrimId: scrim!.id, userId: user.id, displayName: user.username, teamId: teams[index < 5 ? 0 : 1]!.id }))).returning();
		async function createGame(tx: Transaction | typeof db, gameNumber: number, matchId = match!.id, blueTeamSlot: 'a' | 'b' = 'a') {
			const [metadata] = await tx.insert(schema.roflMetadata).values({ fileSha256: randomBytes(32).toString('hex'), fileSizeBytes: 100, formatVersion: 2, gameVersion: '26.21', projectionVersion: 1 }).returning();
			const [game] = await tx.insert(schema.games).values({ scrimId: scrim!.id, matchId, gameNumber, blueTeamSlot, status: 'completed', winnerSide: 'blue', roflMetadataId: metadata!.id }).returning();
			await tx.insert(schema.roflParticipants).values(participants.map((_, index) => ({ roflMetadataId: metadata!.id, participantIndex: index })));
			await tx.insert(schema.gameParticipants).values(participants.map((participant, index) => ({ scrimId: scrim!.id, gameId: game!.id, scrimParticipantId: participant.id,
				displayName: participant.displayName, side: (index < 5) === (blueTeamSlot === 'a') ? 'blue' as const : 'red' as const,
				position: MMR_POSITIONS[index % 5], roflMetadataId: metadata!.id, roflParticipantIndex: index })));
			return game!;
		}
		const apply = (gameId: string) => db.transaction((tx) => applyGameMmr(tx, guildId, gameId, users[0]!.id));
		const reverse = (gameId: string, applicationId: string) => db.transaction(async (tx) => {
			const result = await reverseGameMmr(tx, guildId, gameId, { applicationId, actorUserId: users[0]!.id, reason: '잘못된 결과 취소' });
			if (result.status === 'reversed') await tx.update(schema.games).set({ status: 'cancelled', winnerSide: null }).where(eq(schema.games.id, gameId));
			return result;
		});
		const ratings = () => db.select().from(schema.userPositionMmr).orderBy(asc(schema.userPositionMmr.userId));
		return { db, guildId, otherGuildId, users, season: season!, scrim: scrim!, match: match!, matchValues, participants, createGame, apply, reverse, ratings, close };
	} catch (error) { await client.query('ROLLBACK'); await close(); throw error; }
}

test('시작 시각 없이 동시 반영해도 한 번만 적용하고 서버 경계를 지킨다', database, async () => {
	const f = await createFixture();
	try {
		const game = await f.createGame(f.db, 1, f.match.id, 'b');
		assert.equal(game.startedAt, null);
		await f.db.update(schema.mmrSeasons).set({ endedAt: new Date() }).where(eq(schema.mmrSeasons.id, f.season.id));
		await f.db.insert(schema.mmrSeasons).values({ guildId: f.guildId, name: '새 시즌' });
		const results = await Promise.all([f.apply(game.id), f.apply(game.id)]);
		assert.deepEqual(results.map((row) => row.status).sort(), ['already_applied', 'applied']);
		assert.equal(new Set(results.map((row) => row.applicationId)).size, 1);
		assert.equal((await f.db.select().from(schema.gameMmrApplications)).length, 1);
		assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 10);
		const ratings = await f.ratings();
		assert.equal(ratings.length, 10);
		assert.ok(ratings.every((row) => row.revision === 1 && row.seasonId === f.season.id));
		assert.equal(ratings[0]!.mmr, 1484);
		assert.equal(ratings[5]!.mmr, 1516);
		await assert.rejects(f.db.transaction((tx) => applyGameMmr(tx, f.otherGuildId, game.id, null)), (error: unknown) => error instanceof DomainError && error.code === 'NOT_FOUND');
	} finally { await f.close(); }
});

test('운영 슬롯 순서대로 반영하고 마지막 결과부터 역분개하며 재반영 회차를 보존한다', database, async () => {
	const f = await createFixture();
	try {
		const second = await f.createGame(f.db, 2);
		await assert.rejects(f.apply(second.id), conflict);
		const first = await f.createGame(f.db, 1);
		await assert.rejects(f.apply(second.id), conflict);
		const firstApplication = await f.apply(first.id);
		const secondApplication = await f.apply(second.id);
		assert.equal((await f.apply(first.id)).status, 'already_applied');
		assert.ok(!Number.isInteger((await f.ratings())[0]!.mmr));
		await assert.rejects(f.reverse(first.id, firstApplication.applicationId), conflict);
		assert.equal((await f.reverse(second.id, secondApplication.applicationId)).status, 'reversed');
		assert.equal((await f.reverse(first.id, firstApplication.applicationId)).status, 'reversed');
		assert.ok((await f.ratings()).every((row) => row.mmr === 1500 && row.revision === 4));
		assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 40);
		assert.equal((await f.reverse(first.id, firstApplication.applicationId)).status, 'already_reversed');
		await f.db.update(schema.games).set({ status: 'completed', winnerSide: 'blue' }).where(eq(schema.games.id, first.id));
		const replacement = await f.apply(first.id);
		assert.notEqual(replacement.applicationId, firstApplication.applicationId);
		assert.equal((await f.reverse(first.id, firstApplication.applicationId)).status, 'already_reversed');
		const apps = await f.db.select().from(schema.gameMmrApplications).where(eq(schema.gameMmrApplications.gameId, first.id)).orderBy(asc(schema.gameMmrApplications.revision));
		assert.deepEqual(apps.map((row) => row.revision), [1, 2]);
		assert.equal(apps[1]!.reversedAt, null);
		assert.ok((await f.ratings()).every((row) => row.revision === 5));
	} finally { await f.close(); }
});

test('다른 경기의 후속 반영과 점수가 같은 관리 보정도 과거 역분개를 막는다', database, async () => {
	const f = await createFixture();
	try {
		const first = await f.createGame(f.db, 1);
		const firstApplication = await f.apply(first.id);
		const [otherMatch] = await f.db.insert(schema.matches).values(f.matchValues).returning();
		const second = await f.createGame(f.db, 1, otherMatch!.id);
		const secondApplication = await f.apply(second.id);
		await assert.rejects(f.reverse(first.id, firstApplication.applicationId), conflict);
		await f.reverse(second.id, secondApplication.applicationId);
		const rating = (await f.ratings())[0]!;
		await f.db.transaction(async (tx) => {
			await lockMmrSeason(tx, f.guildId, f.season.id);
			await tx.insert(schema.mmrLedgerEntries).values({ seasonId: f.season.id, ratingId: rating.id, revision: rating.revision + 1, kind: 'adjustment', beforeMmr: rating.mmr, afterMmr: rating.mmr, reason: '동일 점수 보정 검증' });
			await tx.update(schema.userPositionMmr).set({ revision: rating.revision + 1 }).where(eq(schema.userPositionMmr.id, rating.id));
		});
		await assert.rejects(f.reverse(first.id, firstApplication.applicationId), conflict);
		assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 31);
		assert.equal((await f.db.select().from(schema.gameMmrApplications).where(eq(schema.gameMmrApplications.id, firstApplication.applicationId)))[0]!.reversedAt, null);
	} finally { await f.close(); }
});

test('최상위 트랜잭션이 실패하면 결과·출전·MMR 전체가 함께 롤백된다', database, async () => {
	const f = await createFixture();
	try {
		await assert.rejects(f.db.transaction(async (tx) => {
			await lockMmrSeason(tx, f.guildId, f.season.id);
			const game = await f.createGame(tx, 1);
			await applyGameMmr(tx, f.guildId, game.id, null);
			throw new Error('대진 갱신 실패');
		}), /대진 갱신 실패/);
		for (const table of [schema.games, schema.gameParticipants, schema.roflMetadata, schema.gameMmrApplications, schema.mmrLedgerEntries, schema.userPositionMmr]) {
			assert.equal((await f.db.select().from(table)).length, 0);
		}
		const game = await f.createGame(f.db, 1);
		await assert.rejects(f.db.transaction((tx) => applyGameMmr(tx, f.guildId, game.id, '존재하지 않는 실행자')));
		for (const table of [schema.gameMmrApplications, schema.mmrLedgerEntries, schema.userPositionMmr]) assert.equal((await f.db.select().from(table)).length, 0);
		assert.equal((await f.apply(game.id)).status, 'applied');
	} finally { await f.close(); }
});

test('채택 ROFL이 바뀌면 이전 반영을 재사용하거나 다른 반영 회차를 역분개하지 않는다', database, async () => {
	const f = await createFixture();
	try {
		const game = await f.createGame(f.db, 1);
		const application = await f.apply(game.id);
		await assert.rejects(f.reverse(game.id, randomUUID()), (error: unknown) => error instanceof DomainError && error.code === 'NOT_FOUND');
		await assert.rejects(f.db.transaction((tx) => reverseGameMmr(tx, f.guildId, game.id, { applicationId: application.applicationId, actorUserId: null, reason: ' ' })),
			(error: unknown) => error instanceof DomainError && error.code === 'INVALID_INPUT');
		const [replacement] = await f.db.insert(schema.roflMetadata).values({ fileSha256: randomBytes(32).toString('hex'), fileSizeBytes: 100, formatVersion: 2, gameVersion: '26.21', projectionVersion: 1 }).returning();
		// 결과 서비스의 선행 역분개 없이 채택본이 바뀐 비정상 상태를 만들어 방어 조건을 확인한다.
		await f.db.delete(schema.gameParticipants).where(eq(schema.gameParticipants.gameId, game.id));
		await f.db.update(schema.games).set({ roflMetadataId: replacement!.id }).where(eq(schema.games.id, game.id));
		await assert.rejects(f.apply(game.id), conflict);
		await assert.rejects(f.reverse(game.id, application.applicationId), conflict);
		assert.equal((await f.db.select().from(schema.gameMmrApplications)).length, 1);
		assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 10);
	} finally { await f.close(); }
});

test('불확정 포지션·누락 출전·취소 부모·미완료 결과와 현재 원장 불일치는 반영하지 않는다', database, async () => {
	const f = await createFixture();
	try {
		const game = await f.createGame(f.db, 1);
		const target = and(eq(schema.gameParticipants.gameId, game.id), eq(schema.gameParticipants.scrimParticipantId, f.participants[0]!.id));
		await f.db.update(schema.gameParticipants).set({ position: null }).where(target);
		await assert.rejects(f.apply(game.id), conflict);
		await f.db.update(schema.gameParticipants).set({ position: 'top' }).where(target);
		await f.db.update(schema.matches).set({ status: 'cancelled' }).where(eq(schema.matches.id, f.match.id));
		await assert.rejects(f.apply(game.id), conflict);
		await f.db.update(schema.matches).set({ status: 'in_progress' }).where(eq(schema.matches.id, f.match.id));
		await f.db.update(schema.scrims).set({ status: 'cancelled' }).where(eq(schema.scrims.id, f.scrim.id));
		await assert.rejects(f.apply(game.id), conflict);
		await f.db.update(schema.scrims).set({ status: 'in_progress', mmrSeasonId: null }).where(eq(schema.scrims.id, f.scrim.id));
		await assert.rejects(f.apply(game.id), conflict);
		await f.db.update(schema.scrims).set({ mmrSeasonId: f.season.id }).where(eq(schema.scrims.id, f.scrim.id));
		await f.db.update(schema.games).set({ status: 'pending', winnerSide: null }).where(eq(schema.games.id, game.id));
		await assert.rejects(f.apply(game.id), conflict);
		await f.db.update(schema.games).set({ status: 'completed', winnerSide: 'blue' }).where(eq(schema.games.id, game.id));
		const [removed] = await f.db.delete(schema.gameParticipants).where(target).returning();
		await assert.rejects(f.apply(game.id), conflict);
		await f.db.insert(schema.gameParticipants).values(removed!);
		assert.equal((await f.ratings()).length, 0);
		const application = await f.apply(game.id);
		const rating = (await f.ratings())[0]!;
		await f.db.update(schema.userPositionMmr).set({ revision: 2 }).where(eq(schema.userPositionMmr.id, rating.id));
		await assert.rejects(f.reverse(game.id, application.applicationId), conflict);
		assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 10);
	} finally { await f.close(); }
});
