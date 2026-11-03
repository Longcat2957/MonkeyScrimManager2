import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client, Pool } from 'pg';
import * as schema from '../src/lib/server/db/schema.ts';
import type { Actor } from '../src/lib/server/auth/types.ts';
import type { DiscordClient } from '../src/lib/server/discord/client.ts';
import { DomainError } from '../src/lib/server/errors.ts';
import { assignAuctionCurrent, assignAuctionUnsold, awardAuctionLot, drawAuctionLot, getAuction, passAuctionLot, reopenAuctionSetup, resetAuction, restoreAuctionUnsold, revertAuctionLot, saveAuctionSetup, shuffleAuctionQueue, startAuction } from '../src/lib/server/scrims/auction.ts';
import { chooseFormationMethod, revertScrim } from '../src/lib/server/scrims/workflow.ts';
import type { AuctionView } from '../src/lib/features/scrims/formation.ts';

const enabled = Boolean(process.env.DATABASE_URL?.trim());
const errorCode = (code: DomainError['code']) => (error: unknown) => error instanceof DomainError && error.code === code;

async function fixture() {
	const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
	const name = `msm2_auction_test_${randomUUID().replaceAll('-', '')}`;
	const migration = await readFile(new URL('../drizzle/0000_initial_schema.sql', import.meta.url), 'utf8');
	await client.connect();
	try {
		await client.query('BEGIN');
		await client.query(`CREATE SCHEMA "${name}"`);
		await client.query(`SET LOCAL search_path TO "${name}"`);
		await client.query(migration.replaceAll('"public".', `"${name}".`).replace(/\bpublic\./g, `"${name}".`));
		await client.query('COMMIT');
	} catch (error) {
		await client.query('ROLLBACK');
		await client.end();
		throw error;
	}
	const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, options: `-c search_path=${name}` });
	const db = drizzle({ client: pool, schema });
	const cleanup = async () => {
		try { await pool.end(); await client.query(`DROP SCHEMA "${name}" CASCADE`); }
		finally { await client.end(); }
	};
	try {
		const prefix = BigInt(Date.now()) * 10_000n;
		const guildId = String(prefix);
		const manager: Actor = { userId: String(prefix + 1n), isServiceAdmin: false };
		const viewer: Actor = { userId: String(prefix + 2n), isServiceAdmin: true };
		const discord: DiscordClient = {
			listGuilds: async () => [],
			getGuild: async (id) => ({ id, name: '경매 검증', iconHash: null, ownerId: manager.userId, roles: [{ id, permissions: 0n }] }),
			getMember: async (_guildId, userId) => ({ user: { id: userId, username: `test-${userId}`, globalName: null, avatarHash: null }, roleIds: [] })
		};
		await db.insert(schema.guilds).values({ id: guildId, name: '경매 검증', isActive: true });
		await db.insert(schema.users).values([{ id: manager.userId, username: 'manager' }, { id: viewer.userId, username: 'viewer' }]);
		const [scrim] = await db.insert(schema.scrims).values({ guildId, title: '경매 검증', status: 'preparing', formationMethod: 'auction', teamCount: 2 }).returning();
		const teams = await db.insert(schema.scrimTeams).values([1, 2].map((ordinal) => ({ scrimId: scrim!.id, ordinal, name: `${ordinal}팀` }))).returning();
		const participants = await db.insert(schema.scrimParticipants).values(Array.from({ length: 10 }, (_, index) => ({ scrimId: scrim!.id, displayName: `참가자 ${index + 1}` }))).returning();
		await db.insert(schema.scrimParticipantRegistrations).values(participants.map((participant) => ({ scrimParticipantId: participant.id, status: 'selected' as const })));
		const access = { discord };
		const row = async () => (await db.select().from(schema.scrims).where(eq(schema.scrims.id, scrim!.id)))[0]!;
		const revision = async () => ({ expectedRevision: (await row()).revision });
		const view = async () => (await getAuction(db, null, guildId, scrim!.id))!;
		return { db, guildId, manager, viewer, access, scrimId: scrim!.id, teams, participants, row, revision, view, cleanup };
	} catch (error) { await cleanup(); throw error; }
}

function assertCandidatePartition(view: AuctionView) {
	const ids = [...view.teams.flatMap((team) => team.members.map((member) => member.player.participantId)), ...view.queue.map((player) => player.participantId), ...view.unsold.map((player) => player.participantId), ...(view.openLot ? [view.openLot.participantId] : [])];
	assert.equal(ids.length, view.players.length);
	assert.equal(new Set(ids).size, ids.length);
}

test('경매의 공개 조회·권한·원장·후보·복구·완료를 실제 DB에서 검증한다', { skip: !enabled }, async () => {
	const f = await fixture();
	const { db, manager, viewer, guildId, scrimId, access, participants, teams, revision, view } = f;
	try {
		assert.equal((await view()).status, 'setup');
		assert.equal((await db.select().from(schema.auctions)).length, 0);
		await assert.rejects(startAuction(db, null, guildId, scrimId, await revision(), access), errorCode('UNAUTHENTICATED'));
		await assert.rejects(startAuction(db, viewer, guildId, scrimId, await revision(), access), errorCode('FORBIDDEN'));
		const setup = [{ captainId: participants[0]!.id, startPoints: 100 }, { captainId: participants[1]!.id, startPoints: 100 }];
		await saveAuctionSetup(db, manager, guildId, scrimId, { ...await revision(), teams: [setup[0], { ...setup[1], captainId: null }] }, access);
		await assert.rejects(startAuction(db, manager, guildId, scrimId, await revision(), access), errorCode('CONFLICT'));
		await saveAuctionSetup(db, manager, guildId, scrimId, { ...await revision(), teams: setup }, access);
		await saveAuctionSetup(db, manager, guildId, scrimId, { ...await revision(), teams: [setup[1], setup[0]] }, access);
		await startAuction(db, manager, guildId, scrimId, await revision(), access);
		let state = await view();
		assertCandidatePartition(state);
		assert.deepEqual((await view()).queue, state.queue);
		await assert.rejects(saveAuctionSetup(db, manager, guildId, scrimId, { ...await revision(), teams: setup }, access), errorCode('CONFLICT'));
		await shuffleAuctionQueue(db, manager, guildId, scrimId, await revision(), access);
		assert.deepEqual(new Set((await view()).queue.map((player) => player.participantId)), new Set(state.queue.map((player) => player.participantId)));
		await drawAuctionLot(db, manager, guildId, scrimId, await revision(), access);
		state = await view();
		const firstId = state.openLot!.participantId;
		const firstLotId = state.openLotId!;
		await assert.rejects(awardAuctionLot(db, manager, guildId, scrimId, { ...await revision(), lotId: randomUUID(), teamId: teams[0]!.id, price: 1 }, access), errorCode('CONFLICT'));
		await assert.rejects(awardAuctionLot(db, manager, guildId, scrimId, { ...await revision(), lotId: firstLotId, teamId: teams[0]!.id, price: 101 }, access), errorCode('CONFLICT'));
		await passAuctionLot(db, manager, guildId, scrimId, { ...await revision(), lotId: firstLotId }, access);
		assert.equal((await view()).unsold[0]?.participantId, firstId);
		await restoreAuctionUnsold(db, manager, guildId, scrimId, { ...await revision(), participantId: firstId }, access);
		assert.notEqual((await view()).openLotId, firstLotId);
		await revertAuctionLot(db, manager, guildId, scrimId, await revision(), access);
		state = await view();
		assert.equal(state.openLot?.participantId, firstId);
		assertCandidatePartition(state);
		assert.equal(state.history[0]?.voided, true);
		await assignAuctionCurrent(db, manager, guildId, scrimId, { ...await revision(), lotId: state.openLotId!, teamId: teams[0]!.id }, access);
		state = await view();
		assert.equal(state.teams[0]?.remainingPoints, 100);
		assert.equal(state.history.at(-1)?.result, 'manual');
		assert.equal(state.history.at(-1)?.price, null);
		await revertAuctionLot(db, manager, guildId, scrimId, await revision(), access);
		state = await view();
		await awardAuctionLot(db, manager, guildId, scrimId, { ...await revision(), lotId: state.openLotId!, teamId: teams[0]!.id, price: 0 }, access);
		assert.equal((await view()).history.at(-1)?.price, 0);
		await drawAuctionLot(db, manager, guildId, scrimId, await revision(), access);
		const secondId = (await view()).openLot!.participantId;
		await revertAuctionLot(db, manager, guildId, scrimId, await revision(), access);
		state = await view();
		assert.equal(state.openLot!.participantId, firstId);
		assert.equal(state.queue[0]?.participantId, secondId);
		assertCandidatePartition(state);
		await passAuctionLot(db, manager, guildId, scrimId, { ...await revision(), lotId: state.openLotId! }, access);
		await assert.rejects(assignAuctionUnsold(db, manager, guildId, scrimId, { ...await revision(), participantId: firstId, teamId: randomUUID() }, access), errorCode('NOT_FOUND'));
		assert.equal((await view()).openLot, null);
		await assignAuctionUnsold(db, manager, guildId, scrimId, { ...await revision(), participantId: firstId, teamId: teams[0]!.id }, access);
		await drawAuctionLot(db, manager, guildId, scrimId, await revision(), access);
		await resetAuction(db, manager, guildId, scrimId, await revision(), access);
		state = await view();
		assertCandidatePartition(state);
		assert.ok(state.history.every((entry) => entry.voided));
		assert.equal(state.queue.length, 8);
		assert.equal(state.openLot, null);
		await reopenAuctionSetup(db, manager, guildId, scrimId, await revision(), access);
		state = await view();
		assert.equal(state.status, 'setup');
		assert.deepEqual(state.teams.map((team) => team.captainId), [participants[1]!.id, participants[0]!.id]);
		assert.ok(state.history.length > 0);
		await startAuction(db, manager, guildId, scrimId, await revision(), access);
		for (let index = 0; index < 8; index++) {
			await drawAuctionLot(db, manager, guildId, scrimId, await revision(), access);
			state = await view();
			if (index === 4) await assert.rejects(assignAuctionCurrent(db, manager, guildId, scrimId, { ...await revision(), lotId: state.openLotId!, teamId: teams[0]!.id }, access), errorCode('CONFLICT'));
			await awardAuctionLot(db, manager, guildId, scrimId, { ...await revision(), lotId: state.openLotId!, teamId: teams[Math.floor(index / 4)]!.id, price: 1 }, access);
			assertCandidatePartition(await view());
		}
		state = await view();
		assert.equal(state.status, 'completed');
		assert.equal((await f.row()).status, 'ready');
		assert.deepEqual(state.teams.map((team) => team.remainingPoints), [96, 96]);
		assert.ok((await db.select().from(schema.scrimParticipants)).every((entry) => entry.teamId && entry.position === null));
		assert.equal((await db.select().from(schema.scrimBracketNodes)).length, 1);
		await assert.rejects(resetAuction(db, manager, guildId, scrimId, await revision(), access), errorCode('CONFLICT'));
		await revertScrim(db, manager, guildId, scrimId, await revision(), access);
		await revertAuctionLot(db, manager, guildId, scrimId, await revision(), access);
		assertCandidatePartition(await view());
		assert.equal((await db.select().from(schema.scrimBracketNodes)).length, 0);
		await chooseFormationMethod(db, manager, guildId, scrimId, { ...await revision(), method: null }, access);
		assert.equal((await db.select().from(schema.auctions))[0]?.status, 'cancelled');
		assert.equal((await db.select().from(schema.auctionAcquisitions).where(isNull(schema.auctionAcquisitions.voidedAt))).length, 0);
		assert.ok((await db.select().from(schema.scrimParticipants)).every((entry) => entry.teamId === null));
		await chooseFormationMethod(db, manager, guildId, scrimId, { ...await revision(), method: 'auction' }, access);
		assert.equal((await view()).status, 'setup');
		assert.ok((await view()).history.length > 0);
	} finally { await f.cleanup(); }
});

test('동일 후보에 대한 동시 낙찰과 오래된 revision을 거부한다', { skip: !enabled }, async () => {
	const f = await fixture();
	const { db, manager, guildId, scrimId, access, participants, teams, revision, view } = f;
	try {
		await saveAuctionSetup(db, manager, guildId, scrimId, { ...await revision(), teams: teams.map((_team, index) => ({ captainId: participants[index]!.id, startPoints: 1000 })) }, access);
		await startAuction(db, manager, guildId, scrimId, await revision(), access);
		await drawAuctionLot(db, manager, guildId, scrimId, await revision(), access);
		const state = await view();
		const stale = await revision();
		const results = await Promise.allSettled(teams.map((team) => awardAuctionLot(db, manager, guildId, scrimId, { ...stale, lotId: state.openLotId!, teamId: team.id, price: 100 }, access)));
		assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
		assert.ok(results.some((result) => result.status === 'rejected' && errorCode('CONFLICT')(result.reason)));
		assert.equal((await db.select().from(schema.auctionAcquisitions).where(and(eq(schema.auctionAcquisitions.scrimId, scrimId), isNull(schema.auctionAcquisitions.voidedAt)))).length, 1);
		await assert.rejects(drawAuctionLot(db, manager, guildId, scrimId, stale, access), errorCode('CONFLICT'));
		assertCandidatePartition(await view());
	} finally { await f.cleanup(); }
});
