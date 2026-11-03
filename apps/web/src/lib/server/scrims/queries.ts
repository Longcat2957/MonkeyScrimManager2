import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { GuildContext, NextScrim } from '../../features/guild/types.ts';
import { playCapacity } from '../../features/scrims/settings.ts';
import type { MyRegistration, RegistrationAccount, ScrimContext, ScrimListItem, ScrimNextAction, ScrimParticipant, ScrimRegistrationCounts, ScrimRevertAction, ScrimStatus, ScrimStatusFilter } from '../../features/scrims/types.ts';
import type { Actor } from '../auth/types.ts';
import type { Database, Transaction } from '../db/types.ts';
import { guildRiotAccounts, riotAccounts, scrimParticipantPreferences, scrimParticipantRegistrations, scrimParticipants, scrims } from '../db/schema.ts';
import { DomainError } from '../errors.ts';
import { assertGuildView, requireGuildView } from '../guild/access.ts';
import { settingsFromRow, type ScrimAccessDependencies } from './service.ts';
import { requireUuid } from './validation.ts';

const ACTIVE: ScrimStatus[] = ['recruit', 'preparing', 'ready', 'in_progress'];
const FILTERS: Record<Exclude<ScrimStatusFilter, 'all'>, ScrimStatus[]> = {
	recruit: ['recruit'], active: ['preparing', 'ready', 'in_progress'], done: ['completed', 'ended_early', 'cancelled']
};
type ScrimRow = typeof scrims.$inferSelect;

export async function readGuild<T>(db: Database, actor: Actor | null, guildId: string, read: (tx: Transaction, user: Actor | null, guild: GuildContext) => Promise<T>, access?: ScrimAccessDependencies): Promise<T> {
	await requireGuildView(actor, guildId, { ...access, db });
	return db.transaction(async (tx) => {
		const guild = await assertGuildView(tx, actor, guildId);
		return read(tx, actor, guild);
	}, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}

export function toContext(row: ScrimRow, canManage: boolean): ScrimContext & { revision: number } {
	return { id: row.id, title: row.title, status: row.status, scheduledAt: row.expectedStartAt?.toISOString() ?? null,
		teamCount: row.teamCount, formationMethod: row.formationMethod, hardFearless: row.isHardFearless, canManage, revision: row.revision };
}

export async function findScrim(tx: Transaction, guildId: string, scrimId: string) {
	const [row] = await tx.select().from(scrims).where(and(eq(scrims.guildId, guildId), eq(scrims.id, scrimId))).limit(1);
	return row ?? null;
}

async function listItems(tx: Transaction, rows: ScrimRow[], user: Actor | null): Promise<ScrimListItem[]> {
	if (!rows.length) return [];
	const active = await tx.select({ scrimId: scrimParticipants.scrimId, id: scrimParticipantRegistrations.id, userId: scrimParticipants.userId, name: scrimParticipants.displayName, status: scrimParticipantRegistrations.status })
		.from(scrimParticipants).innerJoin(scrimParticipantRegistrations, eq(scrimParticipantRegistrations.scrimParticipantId, scrimParticipants.id))
		.where(and(inArray(scrimParticipants.scrimId, rows.map((row) => row.id)), isNull(scrimParticipantRegistrations.withdrawnAt)))
		.orderBy(sql`case when ${scrimParticipantRegistrations.status} = 'selected' then 0 else 1 end`, asc(scrimParticipantRegistrations.joinedAt), asc(scrimParticipantRegistrations.id));
	return rows.map((row) => {
		const registered = active.filter((registration) => registration.scrimId === row.id);
		return { id: row.id, title: row.title, status: row.status, scheduledAt: row.expectedStartAt?.toISOString() ?? null,
			formationMethod: row.formationMethod, teamCount: row.teamCount, registered: registered.length,
			capacity: playCapacity(row.teamCount) + row.reserveCapacity,
			myRegistration: user ? registered.find((registration) => registration.userId === user.userId)?.status ?? null : null,
			members: registered.slice(0, 5).map((registration) => ({ key: registration.id, name: registration.name, iconUrl: null })) };
	});
}

export async function listScrims(db: Database, actor: Actor | null, guildId: string, options: { status: ScrimStatusFilter; page: number; pageSize: number }, access?: ScrimAccessDependencies) {
	if (!['all', 'recruit', 'active', 'done'].includes(options.status) || !Number.isInteger(options.page) || options.page < 1 || options.page > 100_000 ||
		!Number.isInteger(options.pageSize) || options.pageSize < 1 || options.pageSize > 100) throw new DomainError('INVALID_INPUT', '목록 범위를 다시 확인해 주세요');
	return readGuild(db, actor, guildId, async (tx, user) => {
		const totals = await tx.select({ status: scrims.status, value: count() }).from(scrims).where(eq(scrims.guildId, guildId)).groupBy(scrims.status);
		const counts: Record<ScrimStatusFilter, number> = { all: 0, recruit: 0, active: 0, done: 0 };
		for (const total of totals) {
			counts.all += total.value;
			if (total.status === 'recruit') counts.recruit += total.value;
			else if (FILTERS.active.includes(total.status)) counts.active += total.value;
			else counts.done += total.value;
		}
		const now = new Date().toISOString();
		const rows = await tx.select().from(scrims)
			.where(and(eq(scrims.guildId, guildId), options.status === 'all' ? undefined : inArray(scrims.status, FILTERS[options.status])))
			.orderBy(sql`case when ${scrims.expectedStartAt} >= ${now}::timestamptz then 0 when ${scrims.expectedStartAt} is not null then 1 else 2 end`,
				sql`case when ${scrims.expectedStartAt} >= ${now}::timestamptz then ${scrims.expectedStartAt} end asc`,
				sql`case when ${scrims.expectedStartAt} < ${now}::timestamptz then ${scrims.expectedStartAt} end desc`, desc(scrims.createdAt), asc(scrims.id))
			.limit(options.pageSize).offset((options.page - 1) * options.pageSize);
		return { scrims: await listItems(tx, rows, user), total: counts[options.status], counts };
	}, access);
}

export async function getScrim(db: Database, actor: Actor | null, guildId: string, scrimId: string, access?: ScrimAccessDependencies) {
	requireUuid(scrimId, '내전');
	return readGuild(db, actor, guildId, async (tx, _user, guild) => {
		const row = await findScrim(tx, guildId, scrimId);
		return row ? toContext(row, guild.isAdmin) : null;
	}, access);
}

export async function getScrimSettings(db: Database, actor: Actor | null, guildId: string, scrimId: string, access?: ScrimAccessDependencies) {
	requireUuid(scrimId, '내전');
	return readGuild(db, actor, guildId, async (tx, _user, guild) => {
		if (!guild.isAdmin) throw new DomainError('FORBIDDEN', '내전을 운영할 권한이 없어요');
		const row = await findScrim(tx, guildId, scrimId);
		return row ? settingsFromRow(row) : null;
	}, access);
}

async function registrationCounts(tx: Transaction, row: ScrimRow): Promise<ScrimRegistrationCounts> {
	const counts: ScrimRegistrationCounts = { selected: 0, standby: 0, withdrawn: 0, excluded: 0, playCapacity: playCapacity(row.teamCount), activeCapacity: playCapacity(row.teamCount) + row.reserveCapacity };
	const totals = await tx.select({ status: scrimParticipantRegistrations.status, value: count() }).from(scrimParticipantRegistrations)
		.innerJoin(scrimParticipants, eq(scrimParticipants.id, scrimParticipantRegistrations.scrimParticipantId))
		.where(eq(scrimParticipants.scrimId, row.id)).groupBy(scrimParticipantRegistrations.status);
	for (const total of totals) counts[total.status] = total.value;
	return counts;
}

export async function getScrimDetail(db: Database, actor: Actor | null, guildId: string, scrimId: string, access?: ScrimAccessDependencies) {
	requireUuid(scrimId, '내전');
	return readGuild(db, actor, guildId, async (tx, user, guild) => {
		const row = await findScrim(tx, guildId, scrimId);
		if (!row) return null;
		const entries = await tx.select({ registrationId: scrimParticipantRegistrations.id, participantId: scrimParticipants.id,
			userId: scrimParticipants.userId, displayName: scrimParticipants.displayName, status: scrimParticipantRegistrations.status,
			joinedAt: scrimParticipantRegistrations.joinedAt, riotAccountId: scrimParticipants.riotAccountId, gameName: riotAccounts.gameName, tagLine: riotAccounts.tagLine })
			.from(scrimParticipantRegistrations).innerJoin(scrimParticipants, eq(scrimParticipants.id, scrimParticipantRegistrations.scrimParticipantId))
			.leftJoin(riotAccounts, eq(riotAccounts.id, scrimParticipants.riotAccountId))
			.where(eq(scrimParticipants.scrimId, row.id))
			.orderBy(sql`case when ${scrimParticipantRegistrations.withdrawnAt} is null then 0 else 1 end`, desc(scrimParticipantRegistrations.joinedAt), asc(scrimParticipantRegistrations.id)).limit(1_000);
		const participantIds = [...new Set(entries.map((entry) => entry.participantId))];
		const preferences = participantIds.length ? await tx.select().from(scrimParticipantPreferences).where(inArray(scrimParticipantPreferences.scrimParticipantId, participantIds))
			.orderBy(asc(scrimParticipantPreferences.priority)) : [];
		const participants: (ScrimParticipant & { participantId: string })[] = entries.map((entry) => ({
			registrationId: entry.registrationId, participantId: entry.participantId, userId: entry.userId, displayName: entry.displayName, iconUrl: null,
			riotId: entry.gameName && entry.tagLine ? `${entry.gameName}#${entry.tagLine}` : null,
			positions: preferences.filter((preference) => preference.scrimParticipantId === entry.participantId).map((preference) => preference.position),
			status: entry.status, registeredAt: entry.joinedAt.toISOString()
		}));
		const mine = user ? entries.find((entry) => entry.userId === user.userId && (entry.status === 'selected' || entry.status === 'standby')) : undefined;
		const myRegistration: MyRegistration | null = mine?.riotAccountId ? { id: mine.registrationId, status: mine.status, riotAccountId: mine.riotAccountId,
			positions: preferences.filter((preference) => preference.scrimParticipantId === mine.participantId).map((preference) => preference.position) } : null;
		const counts = await registrationCounts(tx, row);
		return { scrim: toContext(row, guild.isAdmin), settings: guild.isAdmin ? settingsFromRow(row) : null,
			participants, counts, myRegistration, operations: recruitmentOperations(row, guild.isAdmin, counts.selected) };
	}, access);
}

export async function listRegistrationAccounts(db: Database, actor: Actor | null, guildId: string): Promise<{ accounts: RegistrationAccount[]; primaryAccountId: string | null }> {
	if (!actor) return { accounts: [], primaryAccountId: null };
	const rows = await db.select({ id: riotAccounts.id, gameName: riotAccounts.gameName, tagLine: riotAccounts.tagLine, isPrimary: guildRiotAccounts.isPrimary }).from(guildRiotAccounts)
		.innerJoin(riotAccounts, eq(riotAccounts.id, guildRiotAccounts.riotAccountId))
		.where(and(eq(guildRiotAccounts.guildId, guildId), eq(guildRiotAccounts.userId, actor.userId))).orderBy(desc(guildRiotAccounts.isPrimary), asc(riotAccounts.id)).limit(100);
	const accounts = rows.filter((row) => row.gameName && row.tagLine).map((row) => ({ id: row.id, riotId: `${row.gameName}#${row.tagLine}` }));
	return { accounts, primaryAccountId: rows.find((row) => row.isPrimary && row.gameName && row.tagLine)?.id ?? accounts[0]?.id ?? null };
}

/** 모집 단계에서 실제로 지원하는 조작만 노출한다. 편성·대진은 각 서비스 연결 시 확장한다. */
export function recruitmentOperations(row: Pick<ScrimRow, 'status' | 'teamCount' | 'formationMethod'>, canManage: boolean, selected: number): { nextAction: ScrimNextAction | null; revert: ScrimRevertAction | null; endEarly: boolean } {
	if (!canManage) return { nextAction: null, revert: null, endEarly: false };
	return {
		nextAction: row.status === 'recruit' ? { key: 'close', label: '모집 마감', blockedReason: selected === playCapacity(row.teamCount) ? null : `선발 인원이 ${playCapacity(row.teamCount)}명이어야 해요 (현재 ${selected}명)` } : null,
		revert: row.status === 'preparing' && !row.formationMethod ? { label: '모집 다시 열기', message: '모집을 다시 열고 참가 신청을 받아요.', blockedReason: null } : null,
		endEarly: false
	};
}

export async function listActiveScrims(db: Database, actor: Actor | null, guildId: string, access?: ScrimAccessDependencies): Promise<ScrimListItem[]> {
	return readGuild(db, actor, guildId, async (tx, user) => {
		const rows = await tx.select().from(scrims).where(and(eq(scrims.guildId, guildId), inArray(scrims.status, ACTIVE)))
			.orderBy(sql`${scrims.expectedStartAt} asc nulls last`, desc(scrims.createdAt), asc(scrims.id)).limit(100);
		return listItems(tx, rows, user);
	}, access);
}

export async function findNextScrim(db: Database, actor: Actor | null, guildId: string): Promise<Omit<NextScrim, 'artUrl'> | null> {
	const active = await listActiveScrims(db, actor, guildId);
	const priority = ['selected', 'standby'];
	const mine = active.filter((item) => item.myRegistration && priority.includes(item.myRegistration))
		.sort((a, b) => priority.indexOf(a.myRegistration!) - priority.indexOf(b.myRegistration!) ||
			Number(b.status === 'in_progress') - Number(a.status === 'in_progress'))[0];
	const open = active.find((item) => item.status === 'recruit' && !item.myRegistration && item.registered < item.capacity);
	const chosen = mine ?? open;
	if (!chosen) return null;
	const row = await getScrim(db, actor, guildId, chosen.id);
	return row ? { kind: mine ? 'mine' : 'open', scrim: chosen, hardFearless: row.hardFearless } : null;
}
