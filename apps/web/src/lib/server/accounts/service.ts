import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { requireUser } from '../auth/guards.ts';
import type { Actor } from '../auth/types.ts';
import type { Database, Transaction } from '../db/types.ts';
import { guildRiotAccounts, riotAccounts, scrimParticipantRegistrations, scrimParticipants, scrims, users } from '../db/schema.ts';
import { isDiscordId } from '../discord/client.ts';
import { DomainError } from '../errors.ts';
import { assertGuildAccess, requireGuildAdmin, requireGuildMember } from '../guild/access.ts';
import { ACTIVE_SCRIM_STATUSES, resolveRiotAccount, type AccountDependencies } from './queries.ts';

function accountId(value: string): string {
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
		throw new DomainError('INVALID_INPUT', '계정을 다시 확인해 주세요');
	}
	return value;
}

async function authorize(db: Database, actor: Actor | null, guildId: string, userId: string, dependencies: AccountDependencies) {
	const user = requireUser(actor);
	if (!isDiscordId(userId)) throw new DomainError('NOT_FOUND', '멤버를 찾을 수 없어요');
	await requireGuildAdmin(user, guildId, { db, discord: dependencies.discord });
	if (user.userId !== userId) await requireGuildMember({ userId, isServiceAdmin: false }, guildId, { db, discord: dependencies.discord });
	return user;
}

/** 신청과 동일하게 사용자 → 계정 ID 순서로 잠근다. 외래키 검사의 KEY SHARE는 막지 않는다. */
async function lockAccounts(tx: Transaction, actor: Actor, guildId: string, userId: string, puuid?: string) {
	const userIds = [...new Set([actor.userId, userId])].sort();
	const lockedUsers = await tx.select({ id: users.id }).from(users).where(inArray(users.id, userIds)).orderBy(asc(users.id)).for('no key update');
	if (!lockedUsers.some((user) => user.id === actor.userId)) throw new DomainError('UNAUTHENTICATED', '다시 로그인해 주세요');
	if (!lockedUsers.some((user) => user.id === userId)) throw new DomainError('NOT_FOUND', '멤버를 찾을 수 없어요');
	await assertGuildAccess(tx, actor, guildId, true);
	await assertGuildAccess(tx, { userId, isServiceAdmin: false }, guildId);
	const ownIds = tx.select({ id: guildRiotAccounts.riotAccountId }).from(guildRiotAccounts)
		.where(and(eq(guildRiotAccounts.guildId, guildId), eq(guildRiotAccounts.userId, userId)));
	const identities = await tx.select().from(riotAccounts).where(or(inArray(riotAccounts.id, ownIds), puuid ? eq(riotAccounts.puuid, puuid) : undefined))
		.orderBy(asc(riotAccounts.id)).for('no key update');
	const links = await tx.select().from(guildRiotAccounts)
		.where(and(eq(guildRiotAccounts.guildId, guildId), eq(guildRiotAccounts.userId, userId)))
		.orderBy(asc(guildRiotAccounts.riotAccountId)).for('update');
	return { identities, links };
}

async function requireNoActiveUse(tx: Transaction, guildId: string, id: string) {
	// 계정 연결은 서버별로 분리하므로 이 서버의 활성 신청만 검사한다.
	const active = await tx.select({ id: scrims.id }).from(scrims)
		.innerJoin(scrimParticipants, eq(scrimParticipants.scrimId, scrims.id))
		.innerJoin(scrimParticipantRegistrations, eq(scrimParticipantRegistrations.scrimParticipantId, scrimParticipants.id))
		.where(and(eq(scrims.guildId, guildId), eq(scrimParticipants.riotAccountId, id),
			inArray(scrims.status, [...ACTIVE_SCRIM_STATUSES]), isNull(scrimParticipantRegistrations.withdrawnAt)))
		.orderBy(asc(scrims.id)).for('update', { of: scrims });
	if (active.length) throw new DomainError('CONFLICT', '이 서버의 진행 중인 내전에 쓰이는 계정은 연결을 바꿀 수 없어요');
}

export async function linkRiotAccount(
	db: Database, actor: Actor | null, guildId: string, userId: string, riotId: string, dependencies: AccountDependencies = {}
): Promise<void> {
	const user = await authorize(db, actor, guildId, userId, dependencies);
	const lookup = await resolveRiotAccount(user, riotId, dependencies);
	await db.transaction(async (tx) => {
		const { identities, links } = await lockAccounts(tx, user, guildId, userId, lookup.puuid);
		let target = identities.find((account) => account.puuid === lookup.puuid);
		if (!target) {
			await tx.insert(riotAccounts).values({ puuid: lookup.puuid }).onConflictDoNothing({ target: riotAccounts.puuid });
			[target] = await tx.select().from(riotAccounts).where(eq(riotAccounts.puuid, lookup.puuid)).for('no key update');
		}
		if (!target) throw new DomainError('CONFLICT', '계정 연결을 다시 시도해 주세요');
		const [existing] = await tx.select().from(guildRiotAccounts)
			.where(and(eq(guildRiotAccounts.guildId, guildId), eq(guildRiotAccounts.riotAccountId, target.id))).for('update');
		if (existing && existing.userId !== userId) throw new DomainError('CONFLICT', '이 서버에서 이미 다른 사용자에게 연결된 계정이에요');
		if (existing) return;
		await requireNoActiveUse(tx, guildId, target.id);
		await tx.update(riotAccounts).set({ gameName: lookup.gameName, tagLine: lookup.tagLine, platform: lookup.region.toLowerCase() })
			.where(eq(riotAccounts.id, target.id));
		await tx.insert(guildRiotAccounts).values({ guildId, riotAccountId: target.id, userId,
			isPrimary: !links.some((link) => link.isPrimary), linkedByUserId: user.userId, linkedAt: new Date() });
	});
}

export async function setPrimaryRiotAccount(
	db: Database, actor: Actor | null, guildId: string, userId: string, id: string, dependencies: AccountDependencies = {}
): Promise<void> {
	accountId(id);
	const user = await authorize(db, actor, guildId, userId, dependencies);
	await db.transaction(async (tx) => {
		const { links } = await lockAccounts(tx, user, guildId, userId);
		const target = links.find((account) => account.riotAccountId === id);
		if (!target) throw new DomainError('NOT_FOUND', '이 서버에 연결된 계정을 찾을 수 없어요');
		if (target.isPrimary) return;
		await tx.update(guildRiotAccounts).set({ isPrimary: false })
			.where(and(eq(guildRiotAccounts.guildId, guildId), eq(guildRiotAccounts.userId, userId)));
		await tx.update(guildRiotAccounts).set({ isPrimary: true })
			.where(and(eq(guildRiotAccounts.guildId, guildId), eq(guildRiotAccounts.riotAccountId, id)));
	});
}

export async function unlinkRiotAccount(
	db: Database, actor: Actor | null, guildId: string, userId: string, id: string, dependencies: AccountDependencies = {}
): Promise<void> {
	accountId(id);
	const user = await authorize(db, actor, guildId, userId, dependencies);
	await db.transaction(async (tx) => {
		const { links } = await lockAccounts(tx, user, guildId, userId);
		const target = links.find((account) => account.riotAccountId === id);
		if (!target) throw new DomainError('NOT_FOUND', '이 서버에 연결된 계정을 찾을 수 없어요');
		await requireNoActiveUse(tx, guildId, id);
		await tx.delete(guildRiotAccounts).where(and(eq(guildRiotAccounts.guildId, guildId), eq(guildRiotAccounts.riotAccountId, id)));
		if (target.isPrimary) {
			const next = links.filter((account) => account.riotAccountId !== id)
				.sort((a, b) => a.linkedAt.getTime() - b.linkedAt.getTime() || a.riotAccountId.localeCompare(b.riotAccountId))[0];
			if (next) await tx.update(guildRiotAccounts).set({ isPrimary: true })
				.where(and(eq(guildRiotAccounts.guildId, guildId), eq(guildRiotAccounts.riotAccountId, next.riotAccountId)));
		}
	});
}
