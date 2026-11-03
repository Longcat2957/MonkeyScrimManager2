import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { playCapacity, TEAM_NAMES } from '../../features/scrims/settings.ts';
import type { LolPosition } from '../../features/guild/types.ts';
import type { ScrimSettings } from '../../features/scrims/types.ts';
import { requireUser } from '../auth/guards.ts';
import type { Actor } from '../auth/types.ts';
import type { Database, Transaction } from '../db/types.ts';
import { auctions, games, guildRiotAccounts, mmrSeasons, riotAccounts, scrimParticipantPreferences, scrimParticipantRegistrations, scrimParticipants, scrims, scrimTeams, users } from '../db/schema.ts';
import { DomainError } from '../errors.ts';
import { assertGuildAccess, requireGuildAdmin, requireGuildMember, type GuildAccessDependencies } from '../guild/access.ts';
import { assertCapacity, assertEditableSettings, assertRevision, promotionIds, requireRecruitment, requireRevision, requireUuid, validateRegistration, validateSelection, validateSettings } from './validation.ts';

type ScrimRow = typeof scrims.$inferSelect;
export type RevisionInput = { expectedRevision: number };
export type RegistrationInput = { riotAccountId: string; positions: readonly LolPosition[] };
export type ScrimAccessDependencies = Pick<GuildAccessDependencies, 'discord'>;

export function settingsFromRow(row: ScrimRow): ScrimSettings {
	return { title: row.title, scheduledAt: row.expectedStartAt?.toISOString() ?? null, teamCount: row.teamCount, reserveCapacity: row.reserveCapacity, hardFearless: row.isHardFearless };
}

export async function lockScrim(tx: Transaction, actor: Actor, guildId: string, scrimId: string, manager: boolean, expectedRevision?: number): Promise<ScrimRow> {
	const [row] = await tx.select().from(scrims).where(and(eq(scrims.id, scrimId), eq(scrims.guildId, guildId))).for('update');
	if (!row) throw new DomainError('NOT_FOUND', '내전을 찾을 수 없어요');
	await assertGuildAccess(tx, actor, guildId, manager);
	if (expectedRevision !== undefined) assertRevision(row.revision, expectedRevision);
	return row;
}

export async function bumpRevision(tx: Transaction, scrimId: string): Promise<void> {
	await tx.update(scrims).set({ revision: sql`${scrims.revision} + 1` }).where(eq(scrims.id, scrimId));
}

async function registrations(tx: Transaction, scrimId: string) {
	return tx.select({ id: scrimParticipantRegistrations.id, participantId: scrimParticipants.id, userId: scrimParticipants.userId, status: scrimParticipantRegistrations.status, joinedAt: scrimParticipantRegistrations.joinedAt })
		.from(scrimParticipantRegistrations).innerJoin(scrimParticipants, eq(scrimParticipants.id, scrimParticipantRegistrations.scrimParticipantId))
		.where(and(eq(scrimParticipants.scrimId, scrimId), isNull(scrimParticipantRegistrations.withdrawnAt)))
		.orderBy(asc(scrimParticipantRegistrations.joinedAt), asc(scrimParticipantRegistrations.id));
}

async function promoteStandby(tx: Transaction, row: ScrimRow): Promise<void> {
	const ids = promotionIds(row.teamCount, await registrations(tx, row.id));
	if (ids.length) await tx.update(scrimParticipantRegistrations).set({ status: 'selected' }).where(inArray(scrimParticipantRegistrations.id, ids));
}

/** 계정 연결·해제와 같은 사용자 → 계정 → 내전 순서로 잠근다. */
async function lockRegistrationAccounts(tx: Transaction, actor: Actor, guildId: string, scrimId: string, nextAccountId?: string) {
	const [user] = await tx.select().from(users).where(eq(users.id, actor.userId)).for('no key update');
	if (!user) throw new DomainError('UNAUTHENTICATED', '다시 로그인해 주세요');
	const [participant] = await tx.select().from(scrimParticipants).where(and(eq(scrimParticipants.scrimId, scrimId), eq(scrimParticipants.userId, actor.userId)));
	const accountIds = [...new Set([participant?.riotAccountId, nextAccountId].filter((id): id is string => !!id))].sort();
	const accounts = accountIds.length ? await tx.select().from(riotAccounts).where(inArray(riotAccounts.id, accountIds)).orderBy(asc(riotAccounts.id)).for('update') : [];
	if (nextAccountId) {
		const [link] = await tx.select().from(guildRiotAccounts).where(and(eq(guildRiotAccounts.guildId, guildId), eq(guildRiotAccounts.riotAccountId, nextAccountId), eq(guildRiotAccounts.userId, actor.userId))).for('update');
		if (!accounts.some((account) => account.id === nextAccountId) || !link) throw new DomainError('INVALID_INPUT', '이 서버에서 본인에게 연결된 Riot 계정을 골라 주세요', { riotAccountId: '이 서버에서 본인에게 연결된 Riot 계정을 골라 주세요' });
	}
	return { user, participant };
}

async function requireUnusedAccount(tx: Transaction, scrimId: string, accountId: string, participantId?: string): Promise<void> {
	const [other] = await tx.select({ id: scrimParticipants.id }).from(scrimParticipants)
		.where(and(eq(scrimParticipants.scrimId, scrimId), eq(scrimParticipants.riotAccountId, accountId), participantId ? ne(scrimParticipants.id, participantId) : undefined)).limit(1);
	if (other) throw new DomainError('CONFLICT', '이 Riot 계정은 이 내전의 다른 참가자가 사용한 계정이에요');
}

async function replacePreferences(tx: Transaction, participantId: string, positions: readonly LolPosition[]): Promise<void> {
	await tx.delete(scrimParticipantPreferences).where(eq(scrimParticipantPreferences.scrimParticipantId, participantId));
	await tx.insert(scrimParticipantPreferences).values(positions.map((position, index) => ({ scrimParticipantId: participantId, position, priority: index + 1 })));
}

export async function createScrim(db: Database, actor: Actor | null, guildId: string, input: ScrimSettings & { requestId: string }, access?: ScrimAccessDependencies): Promise<string> {
	const user = requireUser(actor);
	const settings = validateSettings(input);
	const requestId = requireUuid(input.requestId, '요청');
	await requireGuildAdmin(user, guildId, { ...access, db });
	return db.transaction(async (tx) => {
		await tx.select({ id: users.id }).from(users).where(eq(users.id, user.userId)).for('no key update');
		await assertGuildAccess(tx, user, guildId, true);
		const [existing] = await tx.select({ id: scrims.id, guildId: scrims.guildId }).from(scrims)
			.where(and(eq(scrims.createdByUserId, user.userId), eq(scrims.creationRequestId, requestId))).limit(1);
		if (existing) {
			if (existing.guildId !== guildId) throw new DomainError('CONFLICT', '다른 생성 요청과 겹쳤어요. 다시 시도해 주세요');
			return existing.id;
		}
		const [season] = await tx.select({ id: mmrSeasons.id }).from(mmrSeasons).where(and(eq(mmrSeasons.guildId, guildId), isNull(mmrSeasons.endedAt))).limit(1);
		const [created] = await tx.insert(scrims).values({ guildId, createdByUserId: user.userId, creationRequestId: requestId, mmrSeasonId: season?.id ?? null,
			title: settings.title, expectedStartAt: settings.scheduledAt ? new Date(settings.scheduledAt) : null,
			teamCount: settings.teamCount, reserveCapacity: settings.reserveCapacity, isHardFearless: settings.hardFearless }).returning({ id: scrims.id });
		return created!.id;
	});
}

export async function createRegistration(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: RegistrationInput, access?: ScrimAccessDependencies): Promise<void> {
	const user = requireUser(actor);
	requireUuid(scrimId, '내전');
	const next = validateRegistration(input);
	await requireGuildMember(user, guildId, { ...access, db });
	await db.transaction(async (tx) => {
		const { user: profile, participant } = await lockRegistrationAccounts(tx, user, guildId, scrimId, next.riotAccountId);
		const row = await lockScrim(tx, user, guildId, scrimId, false);
		requireRecruitment(row.status);
		const active = await registrations(tx, row.id);
		const current = active.find((registration) => registration.userId === user.userId);
		if (current) throw new DomainError('CONFLICT', '이미 신청했어요');
		if (active.length >= playCapacity(row.teamCount) + row.reserveCapacity) throw new DomainError('CONFLICT', '신청 정원이 찼어요');
		await requireUnusedAccount(tx, row.id, next.riotAccountId, participant?.id);
		let participantId = participant?.id;
		if (participantId) {
			await tx.update(scrimParticipants).set({ riotAccountId: next.riotAccountId, displayName: profile.globalName ?? profile.username, teamId: null, position: null }).where(eq(scrimParticipants.id, participantId));
		} else {
			const [created] = await tx.insert(scrimParticipants).values({ scrimId: row.id, userId: user.userId, riotAccountId: next.riotAccountId, displayName: profile.globalName ?? profile.username }).returning({ id: scrimParticipants.id });
			participantId = created!.id;
		}
		await replacePreferences(tx, participantId, next.positions);
		await tx.insert(scrimParticipantRegistrations).values({ scrimParticipantId: participantId, joinedByUserId: user.userId,
			status: active.filter((registration) => registration.status === 'selected').length < playCapacity(row.teamCount) ? 'selected' : 'standby' });
		await bumpRevision(tx, row.id);
	});
}

export async function updateRegistration(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: RegistrationInput, access?: ScrimAccessDependencies): Promise<void> {
	const user = requireUser(actor);
	requireUuid(scrimId, '내전');
	const next = validateRegistration(input);
	await requireGuildMember(user, guildId, { ...access, db });
	await db.transaction(async (tx) => {
		const { participant } = await lockRegistrationAccounts(tx, user, guildId, scrimId, next.riotAccountId);
		const row = await lockScrim(tx, user, guildId, scrimId, false);
		requireRecruitment(row.status);
		const mine = (await registrations(tx, row.id)).find((registration) => registration.userId === user.userId);
		if (!participant || !mine) throw new DomainError('NOT_FOUND', '신청 기록을 찾을 수 없어요');
		await requireUnusedAccount(tx, row.id, next.riotAccountId, participant.id);
		await tx.update(scrimParticipants).set({ riotAccountId: next.riotAccountId }).where(eq(scrimParticipants.id, participant.id));
		await replacePreferences(tx, participant.id, next.positions);
		await bumpRevision(tx, row.id);
	});
}

export async function withdrawRegistration(db: Database, actor: Actor | null, guildId: string, scrimId: string, access?: ScrimAccessDependencies): Promise<void> {
	const user = requireUser(actor);
	requireUuid(scrimId, '내전');
	await requireGuildMember(user, guildId, { ...access, db });
	await db.transaction(async (tx) => {
		await lockRegistrationAccounts(tx, user, guildId, scrimId);
		const row = await lockScrim(tx, user, guildId, scrimId, false);
		requireRecruitment(row.status);
		const mine = (await registrations(tx, row.id)).find((registration) => registration.userId === user.userId);
		if (!mine) throw new DomainError('NOT_FOUND', '이미 철회된 신청이에요');
		await tx.update(scrimParticipantRegistrations).set({ status: 'withdrawn', withdrawnAt: new Date(), withdrawnByUserId: user.userId, withdrawalReason: '본인 철회' }).where(eq(scrimParticipantRegistrations.id, mine.id));
		await tx.update(scrimParticipants).set({ teamId: null, position: null }).where(eq(scrimParticipants.id, mine.participantId));
		await promoteStandby(tx, row);
		await bumpRevision(tx, row.id);
	});
}

export async function setParticipantStatus(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: RevisionInput & { registrationIds: readonly string[]; status: 'selected' | 'standby' | 'excluded' }, access?: ScrimAccessDependencies): Promise<void> {
	const user = requireUser(actor);
	requireUuid(scrimId, '내전');
	const expectedRevision = requireRevision(input.expectedRevision);
	const next = validateSelection(input.registrationIds, input.status);
	await requireGuildAdmin(user, guildId, { ...access, db });
	await db.transaction(async (tx) => {
		const row = await lockScrim(tx, user, guildId, scrimId, true, expectedRevision);
		requireRecruitment(row.status);
		const active = await registrations(tx, row.id);
		const targets = active.filter((registration) => next.registrationIds.includes(registration.id));
		if (targets.length !== next.registrationIds.length) throw new DomainError('CONFLICT', '다른 사람이 먼저 참가 신청을 변경했어요');
		assertCapacity(settingsFromRow(row), active.map((registration) => next.registrationIds.includes(registration.id) ? { ...registration, status: next.status } : registration));
		await tx.update(scrimParticipantRegistrations).set({ status: next.status, ...(next.status === 'excluded' ? { withdrawnAt: new Date(), withdrawnByUserId: user.userId, withdrawalReason: '운영자 제외' } : {}) })
			.where(inArray(scrimParticipantRegistrations.id, next.registrationIds));
		if (next.status !== 'selected') await tx.update(scrimParticipants).set({ teamId: null, position: null }).where(inArray(scrimParticipants.id, targets.map((target) => target.participantId)));
		// 수동 대기 전환은 유지하며, 제외로 빈 자리만 자동으로 승급한다.
		if (next.status === 'excluded') await promoteStandby(tx, row);
		await bumpRevision(tx, row.id);
	});
}

export async function updateScrimSettings(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: RevisionInput & { settings: ScrimSettings }, access?: ScrimAccessDependencies): Promise<void> {
	const user = requireUser(actor);
	requireUuid(scrimId, '내전');
	const expectedRevision = requireRevision(input.expectedRevision);
	const settings = validateSettings(input.settings);
	await requireGuildAdmin(user, guildId, { ...access, db });
	await db.transaction(async (tx) => {
		const row = await lockScrim(tx, user, guildId, scrimId, true, expectedRevision);
		assertEditableSettings(row.status, settingsFromRow(row), settings);
		assertCapacity(settings, await registrations(tx, row.id));
		await tx.update(scrims).set({ title: settings.title, expectedStartAt: settings.scheduledAt ? new Date(settings.scheduledAt) : null,
			teamCount: settings.teamCount, reserveCapacity: settings.reserveCapacity, isHardFearless: settings.hardFearless, revision: row.revision + 1 }).where(eq(scrims.id, row.id));
		if (row.status === 'recruit') await promoteStandby(tx, { ...row, teamCount: settings.teamCount });
	});
}

export async function closeRecruitment(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: RevisionInput, access?: ScrimAccessDependencies): Promise<void> {
	const user = requireUser(actor);
	requireUuid(scrimId, '내전');
	const expectedRevision = requireRevision(input.expectedRevision);
	await requireGuildAdmin(user, guildId, { ...access, db });
	await db.transaction(async (tx) => {
		const row = await lockScrim(tx, user, guildId, scrimId, true, expectedRevision);
		requireRecruitment(row.status);
		const selected = (await registrations(tx, row.id)).filter((registration) => registration.status === 'selected').length;
		if (selected !== playCapacity(row.teamCount)) throw new DomainError('CONFLICT', `선발 인원이 ${playCapacity(row.teamCount)}명이어야 해요 (현재 ${selected}명)`);
		const teams = await tx.select().from(scrimTeams).where(eq(scrimTeams.scrimId, row.id)).orderBy(asc(scrimTeams.ordinal));
		await tx.update(scrimTeams).set({ isActive: false }).where(eq(scrimTeams.scrimId, row.id));
		for (let index = 0; index < row.teamCount; index += 1) {
			const existing = teams.find((team) => team.ordinal === index + 1);
			if (existing) await tx.update(scrimTeams).set({ isActive: true }).where(eq(scrimTeams.id, existing.id));
			else await tx.insert(scrimTeams).values({ scrimId: row.id, name: TEAM_NAMES[index]!, ordinal: index + 1, isActive: true });
		}
		await tx.update(scrims).set({ status: 'preparing', revision: row.revision + 1 }).where(eq(scrims.id, row.id));
	});
}

export async function reopenRecruitment(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: RevisionInput, access?: ScrimAccessDependencies): Promise<void> {
	const user = requireUser(actor);
	requireUuid(scrimId, '내전');
	const expectedRevision = requireRevision(input.expectedRevision);
	await requireGuildAdmin(user, guildId, { ...access, db });
	await db.transaction(async (tx) => {
		const row = await lockScrim(tx, user, guildId, scrimId, true, expectedRevision);
		if (row.status !== 'preparing') throw new DomainError('CONFLICT', '현재 단계에서는 모집을 다시 열 수 없어요');
		const [auction] = await tx.select({ id: auctions.id }).from(auctions).where(eq(auctions.scrimId, row.id)).limit(1);
		const [game] = await tx.select({ id: games.id }).from(games).where(eq(games.scrimId, row.id)).limit(1);
		if (auction || game) throw new DomainError('CONFLICT', '진행 이력이 있어 모집 단계로 되돌릴 수 없어요');
		await tx.update(scrimParticipants).set({ teamId: null, position: null }).where(eq(scrimParticipants.scrimId, row.id));
		await tx.update(scrims).set({ status: 'recruit', revision: row.revision + 1 }).where(eq(scrims.id, row.id));
	});
}

export async function cancelScrim(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: RevisionInput, access?: ScrimAccessDependencies): Promise<void> {
	const user = requireUser(actor);
	requireUuid(scrimId, '내전');
	const expectedRevision = requireRevision(input.expectedRevision);
	await requireGuildAdmin(user, guildId, { ...access, db });
	await db.transaction(async (tx) => {
		const row = await lockScrim(tx, user, guildId, scrimId, true, expectedRevision);
		if (!['recruit', 'preparing', 'ready'].includes(row.status)) throw new DomainError('CONFLICT', '경기 시작 전 내전만 취소할 수 있어요');
		const [game] = await tx.select({ id: games.id }).from(games).where(eq(games.scrimId, row.id)).limit(1);
		if (game) throw new DomainError('CONFLICT', '기록된 경기가 있어 취소할 수 없어요');
		await tx.update(scrims).set({ status: 'cancelled', revision: row.revision + 1 }).where(eq(scrims.id, row.id));
	});
}
