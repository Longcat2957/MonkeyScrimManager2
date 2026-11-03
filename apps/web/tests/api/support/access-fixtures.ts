import { randomBytes, randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import type { Actor } from '../../../src/lib/server/auth/types.ts';
import type { AccountDependencies } from '../../../src/lib/server/accounts/queries.ts';
import * as schema from '../../../src/lib/server/db/schema.ts';
import type { DiscordClient, DiscordGuild, DiscordGuildChannel, DiscordGuildRole, DiscordMember } from '../../../src/lib/server/discord/client.ts';
import { createTestDatabase } from './database.ts';

/** 외부 반환값만 메모리에 두며 소속·권한·설정 저장은 실제 PostgreSQL에서 처리한다. */
export async function createAccessFixture(t: TestContext) {
	const database = await createTestDatabase(t, { maxConnections: 4 });
	const { db } = database;
	let nextId = 1_000_000_000_000_000_000n + BigInt(`0x${randomBytes(7).toString('hex')}`);
	const id = () => String(nextId++);
	const ids = { guild: id(), otherGuild: id(), owner: id(), member: id(), otherMember: id(), outsider: id(), bot: id(), role: id(), botRole: id(), channel: id(), otherChannel: id(), category: id(), managedRole: id() };
	const actor = (userId: string): Actor => ({ userId, isServiceAdmin: false });
	const owner = actor(ids.owner);
	const member = actor(ids.member);
	const otherMember = actor(ids.otherMember);
	const profile = (userId: string) => ({ id: userId, username: `사용자-${userId}`, globalName: null, avatarHash: null });
	await db.insert(schema.users).values([ids.owner, ids.member, ids.otherMember, ids.outsider, ids.bot].map(profile));
	await db.insert(schema.guilds).values([{ id: ids.guild, name: '검증 서버' }, { id: ids.otherGuild, name: '다른 서버' }]);
	const roles = new Map<string, DiscordGuildRole[]>();
	const guilds = new Map<string, DiscordGuild>();
	const members = new Map<string, Map<string, DiscordMember>>();
	const channels = new Map<string, DiscordGuildChannel[]>();
	for (const guildId of [ids.guild, ids.otherGuild]) {
		const guildRoles: DiscordGuildRole[] = [
			{ id: guildId, name: '@everyone', permissions: 0n, position: 0, managed: false },
			{ id: ids.role, name: '운영 역할', permissions: 0n, position: 3, managed: false },
			{ id: ids.botRole, name: '게시 봇', permissions: (1n << 10n) | (1n << 11n), position: 1, managed: true },
			{ id: ids.managedRole, name: '관리 역할', permissions: 0n, position: 2, managed: true }
		];
		roles.set(guildId, guildRoles);
		guilds.set(guildId, { id: guildId, name: guildId === ids.guild ? '검증 서버' : '다른 서버', iconHash: null, ownerId: ids.owner, roles: guildRoles });
		members.set(guildId, new Map<string, DiscordMember>([ids.owner, ids.member, ids.otherMember, ids.bot].map((userId): [string, DiscordMember] => [userId, {
			user: profile(userId), roleIds: userId === ids.bot ? [ids.botRole] : userId === ids.member ? [ids.role] : []
		}])));
		channels.set(guildId, [
			{ id: ids.category, name: '운영', type: 4, position: 0, parentId: null, overwrites: [] },
			{ id: ids.channel, name: '모집', type: 0, position: 1, parentId: ids.category, overwrites: [] },
			{ id: ids.otherChannel, name: '결과', type: 5, position: 2, parentId: null, overwrites: [] }
		]);
		await db.insert(schema.guildMembers).values([ids.owner, ids.member, ids.otherMember].map((userId) => ({
			guildId, userId, manageGuild: userId === ids.owner, isAdmin: userId === ids.owner,
			roleIds: userId === ids.member ? [ids.role] : [], syncedAt: new Date()
		})));
	}
	const discord: DiscordClient = {
		listGuilds: async () => [...guilds.values()].map(({ id, name, iconHash }) => ({ id, name, iconHash })),
		getGuild: async (guildId) => guilds.get(guildId) ?? null,
		getMember: async (guildId, userId) => members.get(guildId)?.get(userId) ?? null,
		getCurrentUserId: async () => ids.bot,
		listRoles: async (guildId) => roles.get(guildId) ?? [],
		listChannels: async (guildId) => channels.get(guildId) ?? []
	};
	const riot: NonNullable<AccountDependencies['riot']> = {
		getAccountByRiotId: async ({ gameName, tagLine }) => ({ puuid: `account_${gameName}`, gameName, tagLine }),
		getActiveRegion: async (puuid) => ({ puuid, game: 'lol', region: 'kr' })
	};
	async function seedAccount(guildId = ids.guild, userId = ids.member, primary = true) {
		const [account] = await db.insert(schema.riotAccounts).values({ puuid: randomUUID(), gameName: '계정', tagLine: 'KR1', platform: 'kr' }).returning();
		await db.insert(schema.guildRiotAccounts).values({ guildId, userId, riotAccountId: account!.id, isPrimary: primary, linkedByUserId: ids.owner });
		return account!;
	}
	return { ...database, ids, owner, member, otherMember, profile, guilds, members, roles, channels, discord, dependencies: { discord, riot }, seedAccount };
}
