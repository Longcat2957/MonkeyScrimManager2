import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { GuildContext } from '../../features/guild/types.ts';
import type { Database, Transaction } from '../db/types.ts';
import { guildDiscordSettings, guildMembers, guilds, users } from '../db/schema.ts';
import type { DiscordClient, DiscordGuild, DiscordMember } from './client.ts';

const ADMINISTRATOR = 1n << 3n;
const MANAGE_GUILD = 1n << 5n;

/** 서버 소유자와 @everyone을 포함한 역할 합집합으로 실효 서버 관리 권한을 계산한다. */
export function canManageDiscordGuild(guild: DiscordGuild, member: DiscordMember): boolean {
    if (guild.ownerId === member.user.id) return true;
    const heldRoles = new Set([guild.id, ...member.roleIds]);
    const permissions = guild.roles.reduce(
        (result, role) => (heldRoles.has(role.id) ? result | role.permissions : result),
        0n
    );
    if ((permissions & ADMINISTRATOR) !== 0n) return true;
    if (member.communicationDisabledUntil && Date.parse(member.communicationDisabledUntil) > Date.now())
        return false;
    return (permissions & MANAGE_GUILD) !== 0n;
}

export function isGuildOperator(
    guild: DiscordGuild,
    member: DiscordMember,
    operatorRoleId: string | null
): boolean {
    return (
        canManageDiscordGuild(guild, member) ||
        (operatorRoleId !== null &&
            operatorRoleId !== guild.id &&
            member.roleIds.includes(operatorRoleId) &&
            guild.roles.some((role) => role.id === operatorRoleId))
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
    if (!member || member.isBot) {
        // 현재 소속만 제거하고 사용자·참가자·경기 기록은 보존한다.
        await db
            .delete(guildMembers)
            .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, userId)));
        return null;
    }
    const guild = await discord.getGuild(guildId);
    if (!guild) {
        await db.update(guilds).set({ isActive: false, syncedAt: new Date() }).where(eq(guilds.id, guildId));
        return null;
    }
    const syncedAt = new Date();
    return db.transaction(async (tx) => {
        await tx
            .insert(guilds)
            .values({
                id: guild.id,
                name: guild.name,
                iconHash: guild.iconHash,
                isActive: true,
                syncedAt
            })
            .onConflictDoUpdate({
                target: guilds.id,
                set: { name: guild.name, iconHash: guild.iconHash, isActive: true, syncedAt }
            });
        const settings = await tx.query.guildDiscordSettings.findFirst({
            where: eq(guildDiscordSettings.guildId, guildId)
        });
        const manageGuild = canManageDiscordGuild(guild, member);
        const isAdmin = isGuildOperator(guild, member, settings?.operatorRoleId ?? null);
        const [saved] = await tx
            .insert(users)
            .values(member.user)
            .onConflictDoUpdate({
                target: users.id,
                set: {
                    username: member.user.username,
                    globalName: member.user.globalName,
                    avatarHash: member.user.avatarHash
                },
                setWhere: isNull(users.withdrawnAt)
            })
            .returning({ id: users.id });
        if (!saved) {
            // Gateway·권한 조회는 탈퇴한 프로필이나 멤버십을 다시 만들지 않는다.
            await tx
                .delete(guildMembers)
                .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, userId)));
            return null;
        }
        const currentRoles = new Set(guild.roles.map((role) => role.id));
        const permissions = {
            nickname: member.nickname ?? null,
            isAdmin,
            manageGuild,
            roleIds: member.roleIds.filter((id) => currentRoles.has(id)),
            syncedAt
        };
        await tx
            .insert(guildMembers)
            .values({ guildId, userId, ...permissions })
            .onConflictDoUpdate({
                target: [guildMembers.guildId, guildMembers.userId],
                set: permissions
            });
        return { id: guild.id, name: guild.name, isAdmin };
    });
}

/** 전체 명단 조회가 끝난 뒤 초기 설정 트랜잭션에서 일반 멤버만 일괄 저장한다. */
export async function saveGuildMembers(
    tx: Transaction,
    guild: DiscordGuild,
    members: DiscordMember[]
): Promise<number> {
    const people = members
        .filter((member) => !member.isBot)
        .sort((left, right) => left.user.id.localeCompare(right.user.id));
    const settings = await tx.query.guildDiscordSettings.findFirst({
        where: eq(guildDiscordSettings.guildId, guild.id)
    });
    const syncedAt = new Date();
    const currentRoles = new Set(guild.roles.map((role) => role.id));
    let savedCount = 0;
    for (let start = 0; start < people.length; start += 1_000) {
        const batch = people.slice(start, start + 1_000);
        const saved = await tx
            .insert(users)
            .values(batch.map((member) => member.user))
            .onConflictDoUpdate({
                target: users.id,
                set: {
                    username: sql`excluded.username`,
                    globalName: sql`excluded.global_name`,
                    avatarHash: sql`excluded.avatar_hash`
                },
                setWhere: isNull(users.withdrawnAt)
            })
            .returning({ id: users.id });
        const savedIds = new Set(saved.map((user) => user.id));
        const withheld = batch
            .filter((member) => !savedIds.has(member.user.id))
            .map((member) => member.user.id);
        if (withheld.length)
            await tx
                .delete(guildMembers)
                .where(and(eq(guildMembers.guildId, guild.id), inArray(guildMembers.userId, withheld)));
        const eligible = batch.filter((member) => savedIds.has(member.user.id));
        if (!eligible.length) continue;
        await tx
            .insert(guildMembers)
            .values(
                eligible.map((member) => ({
                    guildId: guild.id,
                    userId: member.user.id,
                    nickname: member.nickname ?? null,
                    manageGuild: canManageDiscordGuild(guild, member),
                    isAdmin: isGuildOperator(guild, member, settings?.operatorRoleId ?? null),
                    roleIds: member.roleIds.filter((roleId) => currentRoles.has(roleId)),
                    syncedAt
                }))
            )
            .onConflictDoUpdate({
                target: [guildMembers.guildId, guildMembers.userId],
                set: {
                    nickname: sql`excluded.nickname`,
                    manageGuild: sql`excluded.manage_guild`,
                    isAdmin: sql`excluded.is_admin`,
                    roleIds: sql`excluded.role_ids`,
                    syncedAt
                }
            });
        savedCount += eligible.length;
    }
    return savedCount;
}
