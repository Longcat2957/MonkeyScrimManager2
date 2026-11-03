import { and, eq } from 'drizzle-orm';
import type { GuildContext } from '../../features/guild/types.ts';
import type { Database } from '../db/types.ts';
import { guildDiscordSettings, guildMembers, guilds, users } from '../db/schema.ts';
import type { DiscordClient, DiscordGuild, DiscordMember } from './client.ts';

const ADMINISTRATOR = 1n << 3n;
const MANAGE_GUILD = 1n << 5n;

/** 서버 소유자와 @everyone을 포함한 역할 합집합으로 실효 서버 관리 권한을 계산한다. */
export function canManageDiscordGuild(guild: DiscordGuild, member: DiscordMember): boolean {
	if (guild.ownerId === member.user.id) return true;
	const heldRoles = new Set([guild.id, ...member.roleIds]);
	const permissions = guild.roles.reduce((result, role) => heldRoles.has(role.id) ? result | role.permissions : result, 0n);
	if ((permissions & ADMINISTRATOR) !== 0n) return true;
	if (member.communicationDisabledUntil && Date.parse(member.communicationDisabledUntil) > Date.now()) return false;
	return (permissions & MANAGE_GUILD) !== 0n;
}

export function isGuildOperator(guild: DiscordGuild, member: DiscordMember, operatorRoleId: string | null): boolean {
	return canManageDiscordGuild(guild, member) || (
		operatorRoleId !== null && operatorRoleId !== guild.id &&
		member.roleIds.includes(operatorRoleId) && guild.roles.some((role) => role.id === operatorRoleId)
	);
}

/** 권한 검사 때마다 Discord를 확인한다. 저장된 isAdmin은 현재 접근을 허용하는 근거가 아니다. */
export async function synchronizeGuildMembership(
	db: Database,
	discord: DiscordClient,
	userId: string,
	guildId: string
): Promise<GuildContext | null> {
	const member = await discord.getMember(guildId, userId);
	if (!member) {
		// 현재 소속만 제거하고 사용자·참가자·경기 기록은 보존한다.
		await db.delete(guildMembers).where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, userId)));
		return null;
	}
	const guild = await discord.getGuild(guildId);
	if (!guild) {
		await db.update(guilds).set({ isActive: false, syncedAt: new Date() }).where(eq(guilds.id, guildId));
		return null;
	}
	const syncedAt = new Date();
	return db.transaction(async (tx) => {
		await tx.insert(guilds).values({
			id: guild.id, name: guild.name, iconHash: guild.iconHash, isActive: true, syncedAt
		}).onConflictDoUpdate({
			target: guilds.id,
			set: { name: guild.name, iconHash: guild.iconHash, isActive: true, syncedAt }
		});
		const settings = await tx.query.guildDiscordSettings.findFirst({ where: eq(guildDiscordSettings.guildId, guildId) });
		const manageGuild = canManageDiscordGuild(guild, member);
		const isAdmin = isGuildOperator(guild, member, settings?.operatorRoleId ?? null);
		await tx.insert(users).values(member.user).onConflictDoUpdate({
			target: users.id,
			set: { username: member.user.username, globalName: member.user.globalName, avatarHash: member.user.avatarHash }
		});
		const currentRoles = new Set(guild.roles.map((role) => role.id));
		const permissions = { isAdmin, manageGuild, roleIds: member.roleIds.filter((id) => currentRoles.has(id)), syncedAt };
		await tx.insert(guildMembers).values({ guildId, userId, ...permissions }).onConflictDoUpdate({
			target: [guildMembers.guildId, guildMembers.userId], set: permissions
		});
		return { id: guild.id, name: guild.name, isAdmin };
	});
}
