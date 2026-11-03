import { and, eq } from 'drizzle-orm';
import type { GuildContext } from '../../features/guild/types.ts';
import { requireUser } from '../auth/guards.ts';
import type { Actor } from '../auth/types.ts';
import type { Database, Transaction } from '../db/types.ts';
import { guildDiscordSettings, guildMembers, guilds } from '../db/schema.ts';
import { createDiscordClient, DiscordError, isDiscordId, type DiscordClient } from '../discord/client.ts';
import { synchronizeGuildMembership } from '../discord/membership.ts';
import { DomainError } from '../errors.ts';

export type GuildAccessDependencies = { db: Database; discord: DiscordClient };

/** 공개 열람은 Discord 로그인이나 외부 API 가용성에 의존하지 않는다. */
export async function assertGuildView(
	db: Database | Transaction,
	actor: Actor | null,
	guildId: string
): Promise<GuildContext> {
	if (!isDiscordId(guildId)) throw new DomainError('NOT_FOUND', '서버를 찾을 수 없어요');
	const guild = await db.query.guilds.findFirst({ where: and(eq(guilds.id, guildId), eq(guilds.isActive, true)) });
	if (!guild) throw new DomainError('NOT_FOUND', '서버를 찾을 수 없어요');
	let isAdmin = false;
	if (actor) {
		const [membership] = await db.select({
			manageGuild: guildMembers.manageGuild, roleIds: guildMembers.roleIds,
			syncedAt: guildMembers.syncedAt, operatorRoleId: guildDiscordSettings.operatorRoleId
		}).from(guildMembers)
			.leftJoin(guildDiscordSettings, eq(guildDiscordSettings.guildId, guildMembers.guildId))
			.where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, actor.userId))).limit(1);
		// 화면에 보여 주는 운영 기능의 힌트이며, 쓰기는 항상 실시간 권한 검사와 트랜잭션 검사를 거친다.
		if (membership?.syncedAt && Date.now() - membership.syncedAt.getTime() <= 60_000) {
			isAdmin = membership.manageGuild || (membership.operatorRoleId !== null &&
				membership.operatorRoleId !== guildId && membership.roleIds.includes(membership.operatorRoleId));
		}
	}
	return { id: guild.id, name: guild.name, isAdmin };
}

export async function requireGuildView(
	actor: Actor | null,
	guildId: string,
	dependencies: { db?: Database } = {}
): Promise<GuildContext> {
	const db = dependencies.db ?? (await import('../db/index.ts')).getDb();
	return assertGuildView(db, actor, guildId);
}

/** 실제 런타임 설정은 호출할 때 읽어 빌드나 순수 규칙 테스트에서 연결을 만들지 않는다. */
export async function getGuildAccessDependencies(overrides: Partial<GuildAccessDependencies> = {}): Promise<GuildAccessDependencies> {
	let discord = overrides.discord;
	if (!discord) {
		const { DISCORD_BOT_TOKEN } = await import('$app/env/private');
		if (!DISCORD_BOT_TOKEN?.trim()) throw new DiscordError(503, 'Discord 연동을 사용할 수 없어요');
		discord = createDiscordClient({ token: DISCORD_BOT_TOKEN });
	}
	const db = overrides.db ?? (await import('../db/index.ts')).getDb();
	return { db, discord };
}

export async function requireGuildMember(
	actor: Actor | null,
	guildId: string,
	dependencies?: Partial<GuildAccessDependencies>
): Promise<GuildContext> {
	const user = requireUser(actor);
	if (!isDiscordId(guildId)) throw new DomainError('NOT_FOUND', '서버를 찾을 수 없어요');
	if (!isDiscordId(user.userId)) throw new DomainError('UNAUTHENTICATED', '다시 로그인해 주세요');
	const { db, discord } = await getGuildAccessDependencies(dependencies);
	const guild = await synchronizeGuildMembership(db, discord, user.userId, guildId);
	// 다른 서버의 존재 여부를 구분해서 알려 주지 않는다.
	if (!guild) throw new DomainError('NOT_FOUND', '서버를 찾을 수 없어요');
	return guild;
}

export async function requireGuildAdmin(
	actor: Actor | null,
	guildId: string,
	dependencies?: Partial<GuildAccessDependencies>
): Promise<GuildContext> {
	const guild = await requireGuildMember(actor, guildId, dependencies);
	if (!guild.isAdmin) throw new DomainError('FORBIDDEN', '서버를 관리할 권한이 없어요');
	return guild;
}
/** 외부 조회를 끝낸 쓰기 트랜잭션 안에서 현재 소속과 운영자 역할 설정을 다시 확인한다. */
export async function assertGuildAccess(
	db: Database | Transaction,
	actor: Actor | null,
	guildId: string,
	requireAdmin = false
): Promise<GuildContext> {
	const user = requireUser(actor);
	const [membership] = await db.select({
		id: guilds.id, name: guilds.name, isActive: guilds.isActive,
		manageGuild: guildMembers.manageGuild, roleIds: guildMembers.roleIds,
		syncedAt: guildMembers.syncedAt, operatorRoleId: guildDiscordSettings.operatorRoleId
	}).from(guildMembers)
		.innerJoin(guilds, eq(guilds.id, guildMembers.guildId))
		.leftJoin(guildDiscordSettings, eq(guildDiscordSettings.guildId, guildMembers.guildId))
		.where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, user.userId))).limit(1);
	if (!membership?.isActive) throw new DomainError('NOT_FOUND', '서버를 찾을 수 없어요');
	if (!membership.syncedAt || Date.now() - membership.syncedAt.getTime() > 60_000) {
		throw new DomainError('SERVICE_UNAVAILABLE', '서버 권한을 다시 확인해 주세요');
	}
	const isAdmin = membership.manageGuild || (
		membership.operatorRoleId !== null && membership.operatorRoleId !== guildId && membership.roleIds.includes(membership.operatorRoleId)
	);
	if (requireAdmin && !isAdmin) throw new DomainError('FORBIDDEN', '서버를 관리할 권한이 없어요');
	return { id: membership.id, name: membership.name, isAdmin };
}
