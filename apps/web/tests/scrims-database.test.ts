import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { and, asc, count, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client, Pool } from 'pg';
import * as schema from '../src/lib/server/db/schema.ts';
import type { Database } from '../src/lib/server/db/types.ts';
import type { Actor } from '../src/lib/server/auth/types.ts';
import type { DiscordClient } from '../src/lib/server/discord/client.ts';
import { DomainError } from '../src/lib/server/errors.ts';
import { cancelScrim, closeRecruitment, createRegistration, createScrim, reopenRecruitment, setParticipantStatus, updateRegistration, updateScrimSettings, withdrawRegistration } from '../src/lib/server/scrims/service.ts';
import { getScrim, getScrimDetail, getScrimSettings, listActiveScrims, listRegistrationAccounts, listScrims } from '../src/lib/server/scrims/queries.ts';
import { confirmManualFormation, getManualFormation, moveManualPlayer, resetManualFormation } from '../src/lib/server/scrims/manual.ts';
import { confirmBracket, createResolvedMatches, getBracket, placeBracketTeam, resetBracket, setBracketBestOf, unlockBracket } from '../src/lib/server/scrims/bracket.ts';
import { advanceScrim, chooseFormationMethod, endScrimEarly, getScrimOperations, revertScrim } from '../src/lib/server/scrims/workflow.ts';
import { bracketSeats } from '../src/lib/features/scrims/bracket.ts';
import { LANES } from '../src/lib/features/scrims/formation.ts';

const enabled = Boolean(process.env.DATABASE_URL?.trim());
const errorCode = (code: DomainError['code']) => (error: unknown) => error instanceof DomainError && error.code === code;

async function isolatedDatabase(maxConnections: number) {
	const connectionString = process.env.DATABASE_URL;
	const client = new Client({ connectionString, connectionTimeoutMillis: 10_000 });
	const schemaName = `msm2_scrims_test_${randomUUID().replaceAll('-', '')}`;
	const directory = new URL('../drizzle/', import.meta.url);
	const files = (await readdir(directory)).filter((name) => /^\d+_initial_schema\.sql$/.test(name));
	assert.equal(files.length, 1);
	const migration = await readFile(new URL(files[0]!, directory), 'utf8');
	await client.connect();
	try {
		await client.query('BEGIN');
		await client.query(`CREATE SCHEMA "${schemaName}"`);
		await client.query(`SET LOCAL search_path TO "${schemaName}"`);
		await client.query(migration.replaceAll('"public".', `"${schemaName}".`).replace(/\bpublic\./g, `"${schemaName}".`));
		await client.query('COMMIT');
	} catch (error) {
		await client.query('ROLLBACK');
		await client.end();
		throw error;
	}
	// 모든 테스트 연결의 검색 경로를 임시 스키마로 한정한다.
	const pool = new Pool({ connectionString, max: maxConnections, options: `-c search_path=${schemaName}` });
	const db = drizzle({ client: pool, schema });
	return { db, async close() {
		try {
			await pool.end();
			await client.query(`DROP SCHEMA "${schemaName}" CASCADE`);
		} finally { await client.end(); }
	} };
}

test('편성 MMR은 확인된 시즌·사용자의 미반영 포지션만 1500으로 표시한다', { skip: !enabled }, async () => {
	const isolated = await isolatedDatabase(1);
	const db = isolated.db;
	const guildId = '930000000000000001';
	const userId = '930000000000000002';
	try {
		await db.insert(schema.guilds).values({ id: guildId, name: '편성 MMR 검증', isActive: true });
		await db.insert(schema.users).values({ id: userId, username: '선발 사용자' });
		const [season] = await db.insert(schema.mmrSeasons).values({ guildId, name: '검증 시즌' }).returning();
		const rows = await db.insert(schema.scrims).values([
			{ guildId, title: '시즌 지정 편성', status: 'preparing', formationMethod: 'manual', mmrSeasonId: season!.id },
			{ guildId, title: '시즌 미지정 편성', status: 'preparing', formationMethod: 'manual' }
		]).returning();
		const participants = await db.insert(schema.scrimParticipants).values([
			{ scrimId: rows[0]!.id, userId, displayName: '선발 사용자' },
			{ scrimId: rows[0]!.id, userId: null, displayName: '연결 해제 사용자' },
			{ scrimId: rows[1]!.id, userId, displayName: '선발 사용자' }
		]).returning();
		await db.insert(schema.scrimParticipantRegistrations).values(participants.map((participant) => ({ scrimParticipantId: participant.id, status: 'selected' as const })));
		await db.insert(schema.userPositionMmr).values({ seasonId: season!.id, userId, position: 'mid', mmr: 1650.25 });
		const assigned = (await getManualFormation(db, null, guildId, rows[0]!.id))!;
		assert.deepEqual(assigned.players.find((player) => player.userId === userId)?.mmr, { top: 1500, jungle: 1500, mid: 1650.25, bot: 1500, support: 1500 });
		assert.ok(Object.values(assigned.players.find((player) => player.userId === null)!.mmr).every((rating) => rating === null));
		const unassigned = (await getManualFormation(db, null, guildId, rows[1]!.id))!;
		assert.ok(Object.values(unassigned.players[0]!.mmr).every((rating) => rating === null));
		// 조회를 위해 기본 점수 행을 만들거나 기존 점수를 반올림하지 않는다.
		assert.equal((await db.select({ value: count() }).from(schema.userPositionMmr))[0]!.value, 1);
	} finally { await isolated.close(); }
});

test('실제 DB에서 모집·재신청·승급·정원·동시 수정·마감과 취소를 검증하고 전부 롤백한다', { skip: !enabled }, async () => {
	const isolated = await isolatedDatabase(1);
	const database = isolated.db;
	const rollback = new Error('검증 완료 후 테스트 데이터 롤백');
	try {
		await assert.rejects(database.transaction(async (transaction) => {
			// 서비스가 여는 트랜잭션을 바깥 테스트 트랜잭션의 savepoint로 실행한다.
			const db = transaction as unknown as Database;
			const prefix = BigInt(Date.now()) * 10_000n;
			const guildId = String(prefix);
			const actors: Actor[] = Array.from({ length: 14 }, (_, index) => ({ userId: String(prefix + BigInt(index + 1)), isServiceAdmin: false }));
			const manager = actors[0]!;
			const discord: DiscordClient = {
				listGuilds: async () => [],
				getGuild: async (id) => ({ id, name: '모집 DB 검증', iconHash: null, ownerId: manager.userId, roles: [{ id, permissions: 0n }] }),
				getMember: async (_guildId, userId) => ({ user: { id: userId, username: `test-${userId}`, globalName: null, avatarHash: null }, roleIds: [] })
			};
			const access = { discord };
			await db.insert(schema.users).values(actors.map((actor) => ({ id: actor.userId, username: `test-${actor.userId}` })));
			await db.insert(schema.guilds).values({ id: guildId, name: '모집 DB 검증', isActive: true });
			const accounts = await db.insert(schema.riotAccounts).values(actors.map((_actor, index) => ({ puuid: randomUUID(), gameName: `tester${index}`, tagLine: 'KR1' }))).returning();
			await db.insert(schema.guildRiotAccounts).values(actors.map((actor, index) => ({ guildId, userId: actor.userId, riotAccountId: accounts[index]!.id })));
			const accountFor = (actor: Actor) => accounts[actors.indexOf(actor)]!;
			const settings = { title: '모집 검증', scheduledAt: null, teamCount: 2, reserveCapacity: 2, hardFearless: false };
			const requestId = randomUUID();
			const scrimId = await createScrim(db, manager, guildId, { ...settings, requestId }, access);
			assert.equal(await createScrim(db, manager, guildId, { ...settings, requestId }, access), scrimId);
			assert.equal((await db.select({ count: count() }).from(schema.scrims).where(eq(schema.scrims.guildId, guildId)))[0]?.count, 1);
			await assert.rejects(createScrim(db, actors[1]!, guildId, { ...settings, requestId: randomUUID() }, access), errorCode('FORBIDDEN'));
			await assert.rejects(createRegistration(db, manager, guildId, scrimId, { riotAccountId: accountFor(actors[1]!).id, positions: ['mid'] }, access), errorCode('INVALID_INPUT'));
			for (const actor of actors.slice(0, 12)) await createRegistration(db, actor, guildId, scrimId, { riotAccountId: accountFor(actor).id, positions: ['mid', 'top'] }, access);
			await assert.rejects(createRegistration(db, actors[12]!, guildId, scrimId, { riotAccountId: accountFor(actors[12]!).id, positions: ['mid'] }, access), errorCode('CONFLICT'));
			const getRow = async () => (await db.select().from(schema.scrims).where(eq(schema.scrims.id, scrimId)))[0]!;
			const active = async () => db.select({ id: schema.scrimParticipantRegistrations.id, status: schema.scrimParticipantRegistrations.status, userId: schema.scrimParticipants.userId })
				.from(schema.scrimParticipantRegistrations).innerJoin(schema.scrimParticipants, eq(schema.scrimParticipants.id, schema.scrimParticipantRegistrations.scrimParticipantId))
				.where(and(eq(schema.scrimParticipants.scrimId, scrimId), isNull(schema.scrimParticipantRegistrations.withdrawnAt)))
				.orderBy(asc(schema.scrimParticipantRegistrations.joinedAt), asc(schema.scrimParticipantRegistrations.id));
			assert.equal((await active()).filter((entry) => entry.status === 'selected').length, 10);
			assert.equal((await active()).filter((entry) => entry.status === 'standby').length, 2);
			await assert.rejects(updateScrimSettings(db, manager, guildId, scrimId, { settings: { ...settings, reserveCapacity: 1 }, expectedRevision: (await getRow()).revision }, access), errorCode('CONFLICT'));
			await assert.rejects(updateScrimSettings(db, manager, guildId, scrimId, { settings, expectedRevision: 0 }, access), errorCode('CONFLICT'));
			const firstRegistration = (await active()).find((entry) => entry.userId === manager.userId)!;
			const firstStandby = (await active()).find((entry) => entry.status === 'standby')!;
			await withdrawRegistration(db, manager, guildId, scrimId, access);
			assert.equal((await active()).find((entry) => entry.id === firstStandby.id)?.status, 'selected');
			await createRegistration(db, manager, guildId, scrimId, { riotAccountId: accountFor(manager).id, positions: ['support'] }, access);
			const renewed = (await active()).find((entry) => entry.userId === manager.userId)!;
			assert.notEqual(renewed.id, firstRegistration.id);
			assert.equal(renewed.status, 'standby');
			assert.equal((await db.select().from(schema.scrimParticipantRegistrations).where(eq(schema.scrimParticipantRegistrations.id, firstRegistration.id)))[0]?.status, 'withdrawn');
			await updateRegistration(db, manager, guildId, scrimId, { riotAccountId: accountFor(manager).id, positions: ['bot'] }, access);
			await assert.rejects(updateRegistration(db, manager, guildId, scrimId, { riotAccountId: accountFor(actors[1]!).id, positions: ['bot'] }, access), errorCode('INVALID_INPUT'));
			await assert.rejects(setParticipantStatus(db, manager, guildId, scrimId, { registrationIds: [renewed.id, randomUUID()], status: 'excluded', expectedRevision: (await getRow()).revision }, access), errorCode('CONFLICT'));
			assert.equal((await active()).length, 12);
			const detail = await getScrimDetail(db, manager, guildId, scrimId, access);
			assert.ok(detail);
			assert.equal(detail.counts.selected, 10);
			assert.equal(detail.counts.standby, 2);
			assert.equal(detail.counts.withdrawn, 1);
			assert.equal(detail.myRegistration?.id, renewed.id);
			assert.deepEqual(detail.myRegistration?.positions, ['bot']);
			assert.equal(detail.participants.length, 13);
			assert.equal(detail.operations.nextAction?.blockedReason, null);
			assert.equal((await getScrim(db, actors[1]!, guildId, scrimId, access))?.canManage, false);
			await assert.rejects(getScrim(db, manager, String(prefix + 998n), scrimId, access), errorCode('NOT_FOUND'));
			assert.equal((await getScrim(db, null, guildId, scrimId))?.canManage, false);
			assert.equal((await getScrimDetail(db, null, guildId, scrimId))?.myRegistration, null);
			assert.deepEqual(await getScrimSettings(db, manager, guildId, scrimId, access), settings);
			await assert.rejects(getScrimSettings(db, actors[1]!, guildId, scrimId, access), errorCode('FORBIDDEN'));
			const list = await listScrims(db, manager, guildId, { status: 'recruit', page: 1, pageSize: 20 }, access);
			assert.equal(list.total, 1);
			assert.equal(list.counts.recruit, 1);
			assert.equal(list.scrims[0]?.registered, 12);
			assert.equal(list.scrims[0]?.myRegistration, 'standby');
			assert.equal(list.scrims[0]?.members.length, 5);
			assert.equal((await listActiveScrims(db, manager, guildId, access)).length, 1);
			assert.equal((await listRegistrationAccounts(db, manager, guildId)).accounts[0]?.id, accountFor(manager).id);
			assert.deepEqual((await listRegistrationAccounts(db, manager, String(prefix + 998n))).accounts, []);
			assert.equal((await db.select().from(schema.scrimTeams).where(eq(schema.scrimTeams.scrimId, scrimId))).length, 0);
			await closeRecruitment(db, manager, guildId, scrimId, { expectedRevision: (await getRow()).revision }, access);
			assert.equal((await getRow()).status, 'preparing');
			assert.equal((await db.select().from(schema.scrimTeams).where(eq(schema.scrimTeams.scrimId, scrimId))).length, 2);
			await assert.rejects(withdrawRegistration(db, manager, guildId, scrimId, access), errorCode('CONFLICT'));
			await reopenRecruitment(db, manager, guildId, scrimId, { expectedRevision: (await getRow()).revision }, access);
			assert.equal((await getRow()).status, 'recruit');
			await assert.rejects(cancelScrim(db, manager, String(prefix + 999n), scrimId, { expectedRevision: (await getRow()).revision }, access), errorCode('NOT_FOUND'));
			await cancelScrim(db, manager, guildId, scrimId, { expectedRevision: (await getRow()).revision }, access);
			assert.equal((await getRow()).status, 'cancelled');
			assert.equal((await active()).length, 12);
			throw rollback;
		}), (error) => error === rollback);
	} finally {
		await isolated.close();
	}
});

test('두 실제 DB 연결이 마지막 자리에 동시에 신청해도 한 명만 선발한다', { skip: !enabled }, async () => {
	const isolated = await isolatedDatabase(4);
	const db = isolated.db;
	const prefix = BigInt(Date.now()) * 10_000n + 5_000n;
	const guildId = String(prefix);
	const actors: Actor[] = Array.from({ length: 11 }, (_, index) => ({ userId: String(prefix + BigInt(index + 1)), isServiceAdmin: false }));
	const manager = actors[0]!;
	const discord: DiscordClient = {
		listGuilds: async () => [],
		getGuild: async (id) => ({ id, name: '동시 신청 DB 검증', iconHash: null, ownerId: manager.userId, roles: [{ id, permissions: 0n }] }),
		getMember: async (_guildId, userId) => ({ user: { id: userId, username: `test-${userId}`, globalName: null, avatarHash: null }, roleIds: [] })
	};
	const access = { discord };
	let scrimId: string | undefined;
	try {
		await db.insert(schema.users).values(actors.map((actor) => ({ id: actor.userId, username: `test-${actor.userId}` })));
		await db.insert(schema.guilds).values({ id: guildId, name: '동시 신청 DB 검증', isActive: true });
		const accounts = await db.insert(schema.riotAccounts).values(actors.map((_actor, index) => ({ puuid: randomUUID(), gameName: `race${index}`, tagLine: 'KR1' }))).returning();
		await db.insert(schema.guildRiotAccounts).values(actors.map((actor, index) => ({ guildId, userId: actor.userId, riotAccountId: accounts[index]!.id })));
		const accountFor = (actor: Actor) => accounts[actors.indexOf(actor)]!;
		scrimId = await createScrim(db, manager, guildId, { title: '마지막 자리 경쟁 검증', scheduledAt: null, teamCount: 2, reserveCapacity: 0, hardFearless: false, requestId: randomUUID() }, access);
		for (const actor of actors.slice(0, 9)) await createRegistration(db, actor, guildId, scrimId, { riotAccountId: accountFor(actor).id, positions: ['mid'] }, access);
		const targetScrimId = scrimId;
		const results = await Promise.allSettled(actors.slice(9).map((actor) => createRegistration(db, actor, guildId, targetScrimId, { riotAccountId: accountFor(actor).id, positions: ['mid'] }, access)));
		assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
		const rejected = results.find((result) => result.status === 'rejected');
		assert.ok(rejected?.status === 'rejected' && errorCode('CONFLICT')(rejected.reason));
		const [selected] = await db.select({ value: count() }).from(schema.scrimParticipantRegistrations)
			.innerJoin(schema.scrimParticipants, eq(schema.scrimParticipants.id, schema.scrimParticipantRegistrations.scrimParticipantId))
			.where(and(eq(schema.scrimParticipants.scrimId, scrimId), eq(schema.scrimParticipantRegistrations.status, 'selected')));
		assert.equal(selected?.value, 10);
		assert.equal((await db.select().from(schema.scrims).where(eq(schema.scrims.id, scrimId)))[0]?.revision, 10);
	} finally {
		await isolated.close();
	}
});

test('2·3·4팀의 수동 편성·대진·시작·중단·재개를 이력을 지키며 저장한다', { skip: !enabled }, async () => {
	const isolated = await isolatedDatabase(2);
	const db = isolated.db;
	const guildId = '910000000000000001';
	const manager: Actor = { userId: '910000000000000002', isServiceAdmin: false };
	const discord: DiscordClient = {
		listGuilds: async () => [],
		getGuild: async (id) => ({ id, name: '편성 DB 검증', iconHash: null, ownerId: manager.userId, roles: [{ id, permissions: 0n }] }),
		getMember: async (_guildId, userId) => ({ user: { id: userId, username: 'manager', globalName: null, avatarHash: null }, roleIds: [] })
	};
	const access = { discord };
	try {
		for (const teamCount of [2, 3, 4]) {
			const scrimId = await createScrim(db, manager, guildId, { title: `${teamCount}팀 편성 검증`, scheduledAt: null, teamCount, reserveCapacity: 0, hardFearless: true, requestId: randomUUID() }, access);
			const row = async () => (await db.select().from(schema.scrims).where(eq(schema.scrims.id, scrimId)))[0]!;
			const revision = async () => ({ expectedRevision: (await row()).revision });
			const participants = await db.insert(schema.scrimParticipants).values(Array.from({ length: teamCount * 5 }, (_, index) => ({ scrimId, displayName: `선수 ${index}` }))).returning();
			const registrations = await db.insert(schema.scrimParticipantRegistrations).values(participants.map((participant) => ({ scrimParticipantId: participant.id, status: 'selected' as const }))).returning();
			await closeRecruitment(db, manager, guildId, scrimId, await revision(), access);
			await chooseFormationMethod(db, manager, guildId, scrimId, { ...await revision(), method: 'manual' }, access);
			const initial = await getManualFormation(db, null, guildId, scrimId);
			assert.ok(initial);
			assert.deepEqual(initial.assignments, {});
			assert.equal(initial.players[0]?.mmr.mid, null);
			assert.ok(initial.players.every((player) => participants.some((participant) => participant.id === player.participantId)));
			assert.ok(initial.players.every((player) => !registrations.some((registration) => registration.id === player.participantId)));
			assert.equal(await getBracket(db, null, guildId, scrimId), null);
			await assert.rejects(confirmManualFormation(db, manager, guildId, scrimId, await revision(), access), errorCode('CONFLICT'));
			await assert.rejects(moveManualPlayer(db, manager, guildId, scrimId, { ...await revision(), participantId: randomUUID(), slot: null }, access), errorCode('NOT_FOUND'));
			const fill = async () => {
				for (const [index, participant] of participants.entries()) await moveManualPlayer(db, manager, guildId, scrimId, { ...await revision(), participantId: participant.id, slot: `${initial.teams[Math.floor(index / 5)]!.id}:${LANES[index % 5]}` }, access);
			};
			await fill();
			const first = participants[0]!;
			const second = participants[1]!;
			const firstTeamId = initial.teams[0]!.id;
			await moveManualPlayer(db, manager, guildId, scrimId, { ...await revision(), participantId: first.id, slot: `${firstTeamId}:jungle` }, access);
			const swapped = await getManualFormation(db, null, guildId, scrimId);
			assert.equal(swapped?.assignments[first.id], `${firstTeamId}:jungle`);
			assert.equal(swapped?.assignments[second.id], `${firstTeamId}:top`);
			await resetManualFormation(db, manager, guildId, scrimId, await revision(), access);
			assert.deepEqual((await getManualFormation(db, null, guildId, scrimId))?.assignments, {});
			await fill();
			await confirmManualFormation(db, manager, guildId, scrimId, await revision(), access);
			assert.equal((await row()).status, 'ready');
			await assert.rejects(resetManualFormation(db, manager, guildId, scrimId, await revision(), access), errorCode('CONFLICT'));
			let bracket = (await getBracket(db, null, guildId, scrimId))!;
			assert.equal(bracket.matches.length, teamCount - 1);
			assert.equal(bracket.bestOf.final, teamCount === 2 ? 3 : 5);
			assert.equal(bracket.confirmed, false);
			assert.equal(bracket.can.edit, false);
			await assert.rejects(confirmBracket(db, manager, guildId, scrimId, await revision(), access), errorCode('CONFLICT'));
			await setBracketBestOf(db, manager, guildId, scrimId, { ...await revision(), stage: 'final', bestOf: 1 }, access);
			const seats = bracketSeats(bracket.matches);
			const seed = async () => { for (const [index, seat] of seats.entries()) await placeBracketTeam(db, manager, guildId, scrimId, { ...await revision(), seat: seat.key, teamId: initial.teams[index]!.id }, access); };
			await seed();
			await placeBracketTeam(db, manager, guildId, scrimId, { ...await revision(), seat: seats[1]!.key, teamId: firstTeamId }, access);
			bracket = (await getBracket(db, null, guildId, scrimId))!;
			assert.equal(bracketSeats(bracket.matches)[0]?.teamId, null);
			assert.equal(bracketSeats(bracket.matches)[1]?.teamId, firstTeamId);
			await resetBracket(db, manager, guildId, scrimId, await revision(), access);
			bracket = (await getBracket(db, null, guildId, scrimId))!;
			assert.ok(bracketSeats(bracket.matches).every((seat) => seat.teamId === null));
			assert.equal(bracket.bestOf.final, 1);
			await seed();
			await confirmBracket(db, manager, guildId, scrimId, await revision(), access);
			await assert.rejects(setBracketBestOf(db, manager, guildId, scrimId, { ...await revision(), stage: 'final', bestOf: 3 }, access), errorCode('CONFLICT'));
			await unlockBracket(db, manager, guildId, scrimId, await revision(), access);
			await confirmBracket(db, manager, guildId, scrimId, await revision(), access);
			assert.equal((await getScrimOperations(db, manager, guildId, scrimId)).nextAction?.key, 'start');
			await advanceScrim(db, manager, guildId, scrimId, { ...await revision(), key: 'start' }, access);
			const firstMatches = await db.select().from(schema.matches).where(eq(schema.matches.scrimId, scrimId));
			assert.equal(firstMatches.length, teamCount === 4 ? 2 : 1);
			assert.ok(firstMatches.every((match) => match.status === 'in_progress' && match.isHardFearless));
			await assert.rejects(advanceScrim(db, manager, guildId, scrimId, { ...await revision(), key: 'complete' }, access), errorCode('CONFLICT'));
			await revertScrim(db, manager, guildId, scrimId, await revision(), access);
			assert.equal((await row()).status, 'ready');
			assert.equal((await db.select().from(schema.matches).where(eq(schema.matches.scrimId, scrimId))).length, 0);
			await advanceScrim(db, manager, guildId, scrimId, { ...await revision(), key: 'start' }, access);
			await endScrimEarly(db, manager, guildId, scrimId, await revision(), access);
			const interrupted = await db.select().from(schema.matches).where(eq(schema.matches.scrimId, scrimId));
			assert.ok(interrupted.every((match) => match.status === 'ended_early' && match.statusBeforeScrimEnd === 'in_progress'));
			await revertScrim(db, manager, guildId, scrimId, await revision(), access);
			assert.ok((await db.select().from(schema.matches).where(eq(schema.matches.scrimId, scrimId))).every((match) => match.status === 'in_progress' && match.statusBeforeScrimEnd === null));
			const currentMatches = await db.select().from(schema.matches).where(eq(schema.matches.scrimId, scrimId));
			const [game] = await db.insert(schema.games).values({ scrimId, matchId: currentMatches[0]!.id, gameNumber: 1, blueTeamSlot: 'a' }).returning();
			await assert.rejects(revertScrim(db, manager, guildId, scrimId, await revision(), access), errorCode('CONFLICT'));
			assert.equal((await db.select().from(schema.games).where(eq(schema.games.id, game!.id))).length, 1);
			await endScrimEarly(db, manager, guildId, scrimId, await revision(), access);
			await revertScrim(db, manager, guildId, scrimId, await revision(), access);
			assert.equal((await db.select().from(schema.games).where(eq(schema.games.id, game!.id))).length, 1);
			// 다음 라운드 생성은 ROFL 서비스가 같은 내전 잠금 안에서 호출할 계약이다.
			for (const match of currentMatches) await db.update(schema.matches).set({ status: 'completed', winnerTeamId: match.teamAId }).where(eq(schema.matches.id, match.id));
			await db.transaction(async (tx) => { await tx.select().from(schema.scrims).where(eq(schema.scrims.id, scrimId)).for('update'); await createResolvedMatches(tx, await row()); });
			const allMatches = await db.select().from(schema.matches).where(eq(schema.matches.scrimId, scrimId));
			assert.equal(allMatches.length, teamCount - 1);
			for (const match of allMatches.filter((item) => item.status !== 'completed')) await db.update(schema.matches).set({ status: 'completed', winnerTeamId: match.teamAId }).where(eq(schema.matches.id, match.id));
			await advanceScrim(db, manager, guildId, scrimId, { ...await revision(), key: 'complete' }, access);
			assert.equal((await row()).status, 'completed');
			await revertScrim(db, manager, guildId, scrimId, await revision(), access);
			assert.equal((await row()).status, 'in_progress');
		}
	} finally { await isolated.close(); }
});
