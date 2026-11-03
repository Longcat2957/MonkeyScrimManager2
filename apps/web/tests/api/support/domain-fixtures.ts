import { randomBytes, randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import { asc, eq } from 'drizzle-orm';
import type { Actor } from '../../../src/lib/server/auth/types.ts';
import type { Database, Transaction } from '../../../src/lib/server/db/types.ts';
import type { DiscordClient } from '../../../src/lib/server/discord/client.ts';
import * as schema from '../../../src/lib/server/db/schema.ts';
import { DomainError } from '../../../src/lib/server/errors.ts';
import { applyGameMmr, reverseGameMmr } from '../../../src/lib/server/mmr/service.ts';
import { MMR_POSITIONS } from '../../../src/lib/server/mmr/rules.ts';
import { ROFL_STAT_FIELDS } from '../../../src/lib/server/rofl/projection.ts';
import { createScrim } from '../../../src/lib/server/scrims/service.ts';
import { moveManualPlayer } from '../../../src/lib/server/scrims/manual.ts';
import { createTestDatabase } from './database.ts';

export const errorCode = (code: DomainError['code']) => (error: unknown) => error instanceof DomainError && error.code === code;
export const champion = (id: string) => ({ id, name: id, iconUrl: null });
export const settings = { title: '정기 내전', scheduledAt: null, teamCount: 2, reserveCapacity: 2, hardFearless: true };

/** 외부 서비스 없이 현재 멤버·관리자 응답만 제공한다. 저장과 권한 검사는 실제 서비스를 통과한다. */
export async function createDomainFixture(t: TestContext, people = 22) {
	const database = await createTestDatabase(t, { maxConnections: 5 });
	const { db } = database;
	const guildId = '810000000000000001', otherGuildId = '810000000000000002';
	const users = Array.from({ length: people }, (_, index) => ({ id: String(820000000000000000n + BigInt(index)), username: `사용자 ${index}` }));
	const actors: Actor[] = users.map((user, index) => ({ userId: user.id, isServiceAdmin: index === 1 }));
	const manager = actors[0]!;
	await db.insert(schema.users).values(users);
	await db.insert(schema.guilds).values([{ id: guildId, name: '공개 서버' }, { id: otherGuildId, name: '다른 서버' }]);
	await db.insert(schema.guildMembers).values(users.map((user, index) => ({ guildId, userId: user.id, manageGuild: index === 0, isAdmin: index === 0, syncedAt: new Date() })));
	const accounts = await db.insert(schema.riotAccounts).values(users.map((_, index) => ({ puuid: `fixture-puuid-${index}`, gameName: `선수${index}`, tagLine: 'KR1' }))).returning();
	await db.insert(schema.guildRiotAccounts).values(accounts.map((account, index) => ({ guildId, userId: users[index]!.id, riotAccountId: account.id, isPrimary: true })));
	const [season] = await db.insert(schema.mmrSeasons).values({ guildId, name: '현재 시즌', startedAt: new Date(0) }).returning();
	const discord: DiscordClient = {
		listGuilds: async () => [],
		getGuild: async (id) => ({ id, name: '공개 서버', iconHash: null, ownerId: manager.userId, roles: [{ id, permissions: 0n }] }),
		getMember: async (id, userId) => id === guildId && users.some((user) => user.id === userId)
			? { user: { id: userId, username: users.find((user) => user.id === userId)!.username, globalName: null, avatarHash: null }, roleIds: [] }
			: null
	};
	return { ...database, guildId, otherGuildId, users, actors, manager, viewer: actors[1]!, accounts, season: season!, access: { discord } };
}

export async function createRecruitmentFixture(t: TestContext, overrides: Partial<typeof settings> = {}) {
	const f = await createDomainFixture(t);
	const input = { ...settings, ...overrides, requestId: randomUUID() };
	const scrimId = await createScrim(f.db, f.manager, f.guildId, input, f.access);
	const row = async () => (await f.db.select().from(schema.scrims).where(eq(schema.scrims.id, scrimId)))[0]!;
	return { ...f, scrimId, input, row, revision: async () => ({ expectedRevision: (await row()).revision }) };
}

export async function createFormationFixture(t: TestContext, teamCount = 2, method: 'manual' | 'auction' = 'manual') {
	const f = await createDomainFixture(t);
	const [scrim] = await f.db.insert(schema.scrims).values({ guildId: f.guildId, mmrSeasonId: f.season.id, title: '팀 편성', teamCount, status: 'preparing', formationMethod: method, isHardFearless: true }).returning();
	const scrimId = scrim!.id;
	const teams = await f.db.insert(schema.scrimTeams).values(Array.from({ length: teamCount }, (_, index) => ({ scrimId, ordinal: index + 1, name: `${index + 1}팀` }))).returning();
	const participants = await f.db.insert(schema.scrimParticipants).values(f.users.slice(0, teamCount * 5).map((user, index) => ({ scrimId, userId: user.id, displayName: user.username, riotAccountId: f.accounts[index]!.id }))).returning();
	const registrations = await f.db.insert(schema.scrimParticipantRegistrations).values(participants.map((participant, index) => ({ scrimParticipantId: participant.id, status: 'selected' as const, joinedAt: new Date(index * 60_000) }))).returning();
	const row = async () => (await f.db.select().from(schema.scrims).where(eq(schema.scrims.id, scrimId)))[0]!;
	const revision = async () => ({ expectedRevision: (await row()).revision });
	const fill = async () => {
		for (const [index, participant] of participants.entries()) await moveManualPlayer(f.db, f.manager, f.guildId, scrimId,
			{ ...await revision(), participantId: participant.id, slot: `${teams[Math.floor(index / 5)]!.id}:${MMR_POSITIONS[index % 5]}` }, f.access);
	};
	return { ...f, scrimId, scrim: scrim!, teams, participants, registrations, row, revision, fill };
}

/** 경기 fixture는 ROFL 업로드 성공을 흉내내지 않는다. 이미 저장된 결과의 소비 서비스를 검증한다. */
export async function createGameFixture(t: TestContext) {
	const f = await createFormationFixture(t);
	await f.db.update(schema.scrims).set({ status: 'in_progress' }).where(eq(schema.scrims.id, f.scrimId));
	const matchValues = { scrimId: f.scrimId, teamAId: f.teams[0]!.id, teamBId: f.teams[1]!.id, bestOf: 5, isHardFearless: true, status: 'in_progress' as const };
	const [match] = await f.db.insert(schema.matches).values(matchValues).returning();
	async function createGame(tx: Database | Transaction, gameNumber: number, matchId = match!.id, blueTeamSlot: 'a' | 'b' = 'a', options: { missingStats?: boolean; winnerSide?: 'blue' | 'red'; startedAt?: Date | null; champion?: string; durationMs?: number } = {}) {
		const winnerSide = options.winnerSide ?? 'blue';
		const [metadata] = await tx.insert(schema.roflMetadata).values({ fileSha256: randomBytes(32).toString('hex'), fileSizeBytes: 100, formatVersion: 2, gameVersion: '26.21', projectionVersion: 1 }).returning();
		await tx.insert(schema.roflGameDataV1).values({ roflMetadataId: metadata!.id, gameLengthMs: options.durationMs ?? 1_200_000, resultStatus: 'consistent', winnerReplayTeamId: winnerSide === 'blue' ? 100 : 200,
			teams: [{ teamId: 100, win: winnerSide === 'blue' }, { teamId: 200, win: winnerSide === 'red' }] });
		const [game] = await tx.insert(schema.games).values({ scrimId: f.scrimId, matchId, gameNumber, blueTeamSlot, status: 'completed', winnerSide, roflMetadataId: metadata!.id, startedAt: options.startedAt ?? null }).returning();
		const loadout: schema.RoflLoadoutV1 = { itemIds: [0, 1001, null, null, null, null, null], summonerSpellIds: [4, null], primaryRuneStyleId: null, secondaryRuneStyleId: null, runeIds: [null, null, null, null, null, null], statRuneIds: [null, null, null] };
		await tx.insert(schema.roflParticipants).values(f.participants.map((_, index) => ({ roflMetadataId: metadata!.id, participantIndex: index })));
		await tx.insert(schema.roflParticipantDataV1).values(f.participants.map((_, index) => ({ roflMetadataId: metadata!.id, participantIndex: index,
			gameName: `기록${index}`, tagLine: 'KR1', champion: options.missingStats ? null : options.champion ?? 'Ahri',
			stats: Object.fromEntries(Object.keys(ROFL_STAT_FIELDS).map((key) => [key, options.missingStats ? null : key === 'kills' && index === 0 ? 0 : 2])) as schema.RoflStatsV1, loadout })));
		await tx.insert(schema.gameParticipants).values(f.participants.map((participant, index) => ({ scrimId: f.scrimId, gameId: game!.id, scrimParticipantId: participant.id,
			riotAccountId: f.accounts[index]!.id, displayName: `당시 이름 ${index}`, riotGameName: `기록${index}`, riotTagLine: 'KR1', side: (index < 5) === (blueTeamSlot === 'a') ? 'blue' as const : 'red' as const,
			position: MMR_POSITIONS[index % 5], roflMetadataId: metadata!.id, roflParticipantIndex: index })));
		return game!;
	}
	const apply = (gameId: string) => f.db.transaction((tx) => applyGameMmr(tx, f.guildId, gameId, f.manager.userId));
	const reverse = (gameId: string, applicationId: string) => f.db.transaction(async (tx) => {
		const result = await reverseGameMmr(tx, f.guildId, gameId, { applicationId, actorUserId: f.manager.userId, reason: '잘못된 결과 취소' });
		if (result.status === 'reversed') await tx.update(schema.games).set({ status: 'cancelled', winnerSide: null }).where(eq(schema.games.id, gameId));
		return result;
	});
	const ratings = () => f.db.select().from(schema.userPositionMmr).orderBy(asc(schema.userPositionMmr.userId), asc(schema.userPositionMmr.position));
	return { ...f, match: match!, matchValues, createGame, apply, reverse, ratings };
}

/** 모든 호출을 같은 gate 뒤에서 시작하며 실제 서비스 트랜잭션과 연결 풀을 사용한다. */
export async function concurrently<T>(actions: readonly (() => Promise<T>)[]) {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => { release = resolve; });
	const jobs = actions.map(async (action) => { await gate; return action(); });
	release();
	return Promise.allSettled(jobs);
}
