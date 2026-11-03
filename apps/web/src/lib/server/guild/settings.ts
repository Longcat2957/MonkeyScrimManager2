import { and, eq, sql } from 'drizzle-orm';
import type { DiscordChannel, DiscordRole, GuildDiscordSettingKey, GuildDiscordSettings } from '../../features/guild/types.ts';
import { requireUser } from '../auth/guards.ts';
import type { Actor } from '../auth/types.ts';
import type { Database, Transaction } from '../db/types.ts';
import { guildDiscordChannels, guildDiscordRoles, guildDiscordSettings, guildMembers, guilds } from '../db/schema.ts';
import { DiscordError, isDiscordId, type DiscordClient, type DiscordGuild, type DiscordGuildChannel, type DiscordGuildRole, type DiscordMember } from '../discord/client.ts';
import { canManageDiscordGuild, isGuildOperator } from '../discord/membership.ts';
import { DomainError } from '../errors.ts';
import { assertGuildAccess, getGuildAccessDependencies, requireGuildAdmin } from './access.ts';

const ADMINISTRATOR = 1n << 3n;
const VIEW_CHANNEL = 1n << 10n;
const SEND_MESSAGES = 1n << 11n;
const SETTING_KEYS: readonly GuildDiscordSettingKey[] = ['operatorRoleId', 'recruitmentChannelId', 'entryChannelId', 'resultChannelId'];

export type GuildDiscordView = {
	roles: DiscordRole[];
	channels: DiscordChannel[];
	settings: GuildDiscordSettings;
	actorRoleIds: string[] | null;
};

type DiscordSnapshot = {
	checkedAt: number;
	guild: DiscordGuild;
	actor: DiscordMember;
	roles: DiscordGuildRole[];
	channels: (DiscordChannel & { position: number })[];
};

/** Discord의 @everyone → 역할 합집합 → 멤버 덮어쓰기 순서를 적용한다. */
export function canPostToDiscordChannel(guild: DiscordGuild, member: DiscordMember, channel: DiscordGuildChannel): boolean {
	if (channel.type !== 0 && channel.type !== 5) return false;
	if (guild.ownerId === member.user.id) return true;
	const roleIds = new Set([guild.id, ...member.roleIds]);
	let permissions = guild.roles.reduce((value, role) => roleIds.has(role.id) ? value | role.permissions : value, 0n);
	if ((permissions & ADMINISTRATOR) !== 0n) return true;
	// 소유자·ADMINISTRATOR를 제외한 timeout 멤버는 메시지를 보낼 수 없다.
	if (member.communicationDisabledUntil && Date.parse(member.communicationDisabledUntil) > Date.now()) return false;
	const everyone = channel.overwrites.find((overwrite) => overwrite.type === 0 && overwrite.id === guild.id);
	if (everyone) permissions = (permissions & ~everyone.deny) | everyone.allow;
	let allow = 0n;
	let deny = 0n;
	for (const overwrite of channel.overwrites) {
		if (overwrite.type === 0 && overwrite.id !== guild.id && roleIds.has(overwrite.id)) {
			allow |= overwrite.allow;
			deny |= overwrite.deny;
		}
	}
	permissions = (permissions & ~deny) | allow;
	const personal = channel.overwrites.find((overwrite) => overwrite.type === 1 && overwrite.id === member.user.id);
	if (personal) permissions = (permissions & ~personal.deny) | personal.allow;
	return (permissions & (VIEW_CHANNEL | SEND_MESSAGES)) === (VIEW_CHANNEL | SEND_MESSAGES);
}

function settingKey(value: string): GuildDiscordSettingKey {
	if (!SETTING_KEYS.includes(value as GuildDiscordSettingKey)) throw new DomainError('INVALID_INPUT', '바꿀 수 없는 설정이에요');
	return value as GuildDiscordSettingKey;
}

function settingsFromRow(row: GuildDiscordSettings | undefined): GuildDiscordSettings {
	return {
		operatorRoleId: row?.operatorRoleId ?? null,
		recruitmentChannelId: row?.recruitmentChannelId ?? null,
		entryChannelId: row?.entryChannelId ?? null,
		resultChannelId: row?.resultChannelId ?? null
	};
}

async function fetchSnapshot(discord: DiscordClient, guildId: string, actorId: string): Promise<DiscordSnapshot> {
	const checkedAt = Date.now();
	if (!discord.listRoles || !discord.listChannels || !discord.getCurrentUserId) {
		throw new DiscordError(503, 'Discord 연동 설정을 확인할 수 없어요');
	}
	const [guild, actor, roles, channels, botId] = await Promise.all([
		discord.getGuild(guildId), discord.getMember(guildId, actorId), discord.listRoles(guildId),
		discord.listChannels(guildId), discord.getCurrentUserId()
	]);
	if (!guild || !actor) throw new DomainError('NOT_FOUND', '서버를 찾을 수 없어요');
	const bot = await discord.getMember(guildId, botId);
	if (!bot) throw new DiscordError(503, '봇의 서버 권한을 확인할 수 없어요');
	const currentGuild = { ...guild, roles };
	const categories = new Map(channels.filter((channel) => channel.type === 4).map((channel) => [channel.id, channel.name]));
	return {
		checkedAt,
		guild: currentGuild,
		actor,
		roles: roles.filter((role) => role.id !== guildId && !role.managed).sort((a, b) => b.position - a.position || a.id.localeCompare(b.id)),
		channels: channels.filter((channel) => channel.type === 0 || channel.type === 5).map((channel) => ({
			id: channel.id, name: channel.name, position: channel.position,
			category: channel.parentId ? categories.get(channel.parentId) ?? null : null,
			botCanPost: canPostToDiscordChannel(currentGuild, bot, channel)
		})).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
	};
}

async function lockSettings(tx: Transaction, actor: Actor, guildId: string, snapshot: DiscordSnapshot): Promise<GuildDiscordSettings> {
	const [guild] = await tx.select({ id: guilds.id }).from(guilds).where(eq(guilds.id, guildId)).for('update');
	if (!guild) throw new DomainError('NOT_FOUND', '서버를 찾을 수 없어요');
	if (Date.now() - snapshot.checkedAt > 60_000) throw new DomainError('SERVICE_UNAVAILABLE', '서버 권한을 다시 확인해 주세요');
	await assertGuildAccess(tx, actor, guildId, true);
	const row = await tx.query.guildDiscordSettings.findFirst({ where: eq(guildDiscordSettings.guildId, guildId) });
	const settings = settingsFromRow(row);
	// 외부 조회 중 운영자 설정이나 Discord 역할이 바뀌었어도 현재 조건으로 다시 판정한다.
	if (!isGuildOperator(snapshot.guild, snapshot.actor, settings.operatorRoleId)) {
		throw new DomainError('FORBIDDEN', '서버를 관리할 권한이 없어요');
	}
	return settings;
}

async function synchronizeChoices(tx: Transaction, guildId: string, snapshot: DiscordSnapshot, settings: GuildDiscordSettings): Promise<void> {
	const syncedAt = new Date();
	await tx.delete(guildDiscordRoles).where(eq(guildDiscordRoles.guildId, guildId));
	if (snapshot.roles.length) await tx.insert(guildDiscordRoles).values(snapshot.roles.map((role) => ({
		guildId, roleId: role.id, name: role.name, position: role.position, syncedAt
	})));
	await tx.delete(guildDiscordChannels).where(eq(guildDiscordChannels.guildId, guildId));
	if (snapshot.channels.length) await tx.insert(guildDiscordChannels).values(snapshot.channels.map((channel) => ({
		guildId, channelId: channel.id, name: channel.name, categoryName: channel.category,
		position: channel.position, botCanPost: channel.botCanPost, syncedAt
	})));
	const validRoleIds = new Set(snapshot.guild.roles.map((role) => role.id));
	await tx.update(guildMembers).set({
		manageGuild: canManageDiscordGuild(snapshot.guild, snapshot.actor),
		isAdmin: isGuildOperator(snapshot.guild, snapshot.actor, settings.operatorRoleId),
		roleIds: snapshot.actor.roleIds.filter((id) => validRoleIds.has(id)), syncedAt
	}).where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, snapshot.actor.user.id)));
}

export async function getGuildDiscordSettings(
	db: Database,
	actor: Actor | null,
	guildId: string,
	options: { discord?: DiscordClient } = {}
): Promise<GuildDiscordView> {
	const user = requireUser(actor);
	const dependencies = await getGuildAccessDependencies({ db, ...options });
	await requireGuildAdmin(user, guildId, dependencies);
	const snapshot = await fetchSnapshot(dependencies.discord, guildId, user.userId);
	return db.transaction(async (tx) => {
		const stored = await lockSettings(tx, user, guildId, snapshot);
		await synchronizeChoices(tx, guildId, snapshot, stored);
		const settings = { ...stored };
		// 삭제되거나 봇이 볼 수 없는 선택지는 표시에서 제외하되 저장된 설정을 임의로 지우지 않는다.
		if (!snapshot.roles.some((role) => role.id === settings.operatorRoleId)) settings.operatorRoleId = null;
		for (const key of ['recruitmentChannelId', 'entryChannelId', 'resultChannelId'] as const) {
			if (!snapshot.channels.some((channel) => channel.id === settings[key])) settings[key] = null;
		}
		return {
			roles: snapshot.roles.map(({ id, name }) => ({ id, name })),
			channels: snapshot.channels.map(({ id, name, category, botCanPost }) => ({ id, name, category, botCanPost })),
			settings,
			actorRoleIds: canManageDiscordGuild(snapshot.guild, snapshot.actor) ? null : snapshot.actor.roleIds
		};
	});
}

export async function setGuildDiscordSetting(
	db: Database,
	actor: Actor | null,
	guildId: string,
	inputKey: string,
	value: string | null,
	options: { discord?: DiscordClient } = {}
): Promise<void> {
	const user = requireUser(actor);
	const key = settingKey(inputKey);
	if (value !== null && !isDiscordId(value)) throw new DomainError('INVALID_INPUT', '올바른 역할이나 채널을 골라 주세요');
	const dependencies = await getGuildAccessDependencies({ db, ...options });
	await requireGuildAdmin(user, guildId, dependencies);
	const snapshot = await fetchSnapshot(dependencies.discord, guildId, user.userId);
	await db.transaction(async (tx) => {
		const settings = await lockSettings(tx, user, guildId, snapshot);
		if (key === 'operatorRoleId') {
			if (value !== null && !snapshot.roles.some((role) => role.id === value)) throw new DomainError('NOT_FOUND', '역할을 찾을 수 없어요');
			if (!isGuildOperator(snapshot.guild, snapshot.actor, value)) throw new DomainError('CONFLICT', '이 역할로 바꾸면 내 관리 권한이 사라져요');
		} else if (value !== null) {
			const channel = snapshot.channels.find((item) => item.id === value);
			if (!channel) throw new DomainError('NOT_FOUND', '채널을 찾을 수 없어요');
			if (!channel.botCanPost) throw new DomainError('CONFLICT', '봇이 이 채널에 글을 쓸 수 없어요');
		}
		await synchronizeChoices(tx, guildId, snapshot, { ...settings, [key]: value });
		await tx.insert(guildDiscordSettings).values({ guildId, [key]: value }).onConflictDoUpdate({
			target: guildDiscordSettings.guildId, set: { [key]: value }
		});
		if (key === 'operatorRoleId') {
			// 멤버 목록의 표시 캐시만 갱신한다. 실제 관리 요청은 계속 Discord를 다시 확인한다.
			await tx.update(guildMembers).set({
				isAdmin: value === null ? guildMembers.manageGuild : sql`${guildMembers.manageGuild} or ${value} = any(${guildMembers.roleIds})`
			}).where(eq(guildMembers.guildId, guildId));
		}
	});
}
