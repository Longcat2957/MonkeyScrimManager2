import assert from 'node:assert/strict';
import test from 'node:test';
import { guildDiscordChannels, guildDiscordRoles, guildDiscordSettings, guildMembers, guilds } from '../src/lib/server/db/schema.ts';
import type { Database } from '../src/lib/server/db/types.ts';
import { createDiscordClient, DiscordError, type DiscordClient, type DiscordGuild, type DiscordGuildChannel, type DiscordGuildRole, type DiscordMember } from '../src/lib/server/discord/client.ts';
import { DomainError } from '../src/lib/server/errors.ts';
import { canPostToDiscordChannel, getGuildDiscordSettings, setGuildDiscordSetting } from '../src/lib/server/guild/settings.ts';

const guildId = '123456789012345678';
const userId = '223456789012345678';
const roleId = '323456789012345678';
const botId = '423456789012345678';
const botRoleId = '523456789012345678';
const channelId = '623456789012345678';
const managedRoleId = '723456789012345678';
const anotherRoleId = '823456789012345678';
const categoryId = '923456789012345678';
const actor = { userId, isServiceAdmin: false };
const postPermissions = (1n << 10n) | (1n << 11n);
const roles: DiscordGuildRole[] = [
	{ id: guildId, name: '@everyone', position: 0, permissions: 0n, managed: false },
	{ id: roleId, name: '운영진', position: 3, permissions: 32n, managed: false },
	{ id: botRoleId, name: '봇', position: 1, permissions: postPermissions, managed: true },
	{ id: managedRoleId, name: '관리 역할', position: 4, permissions: 0n, managed: true },
	{ id: anotherRoleId, name: '다른 운영진', position: 2, permissions: 0n, managed: false }
];
const guild: DiscordGuild = { id: guildId, name: '서버', iconHash: null, ownerId: '999999999999999999', roles };
const member: DiscordMember = { user: { id: userId, username: 'tester', globalName: null, avatarHash: null }, roleIds: [roleId] };
const bot: DiscordMember = { user: { id: botId, username: 'bot', globalName: null, avatarHash: null }, roleIds: [botRoleId] };
const channel: DiscordGuildChannel = { id: channelId, type: 0, name: '모집', position: 0, parentId: categoryId, overwrites: [] };
const category: DiscordGuildChannel = { id: categoryId, type: 4, name: '내전', position: 0, parentId: null, overwrites: [] };

function client(overrides: Partial<DiscordClient> = {}): DiscordClient {
	return {
		listGuilds: async () => [guild], getGuild: async () => guild,
		getMember: async (_guildId, id) => id === botId ? bot : member,
		getCurrentUserId: async () => botId, listRoles: async () => roles,
		listChannels: async () => [category, channel], ...overrides
	};
}

function database(initialOperatorRoleId: string | null = null) {
	const settings = { guildId, operatorRoleId: initialOperatorRoleId, recruitmentChannelId: null as string | null, entryChannelId: null as string | null, resultChannelId: null as string | null };
	const membership = { id: guildId, name: '서버', isActive: true, manageGuild: true, roleIds: [roleId], syncedAt: new Date() };
	const writes: { table: unknown; values?: unknown; kind: string }[] = [];
	const db = {
		transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
		query: { guildDiscordSettings: { findFirst: async () => ({ ...settings }) } },
		insert: (table: unknown) => ({ values: (values: unknown) => {
			const save = () => {
				writes.push({ table, values, kind: 'insert' });
				if (table === guildMembers) Object.assign(membership, values);
				if (table === guildDiscordSettings) Object.assign(settings, values);
			};
			return {
				onConflictDoUpdate: async () => save(),
				then: (resolve: (value: unknown) => unknown) => { save(); return Promise.resolve(resolve(undefined)); }
			};
		} }),
		delete: (table: unknown) => ({ where: async () => { writes.push({ table, kind: 'delete' }); } }),
		update: (table: unknown) => ({ set: (values: unknown) => ({ where: async () => { writes.push({ table, values, kind: 'update' }); } }) }),
		select: () => ({ from: (table: unknown) => {
			const query = {
				where: () => query, innerJoin: () => query, leftJoin: () => query,
				for: async () => table === guilds ? [{ id: guildId }] : [],
				limit: async () => [{ ...membership, operatorRoleId: settings.operatorRoleId }]
			};
			return query;
		} })
	};
	return { db: db as unknown as Database, settings, writes };
}

const expectStatus = (status: number) => (error: unknown) => {
	assert.ok(error instanceof DiscordError || error instanceof DomainError);
	assert.equal(error.status, status);
	return true;
};

test('게시 권한은 채널 보기와 메시지 전송을 모두 요구하고 서버 관리만으로 우회하지 않는다', () => {
	assert.equal(canPostToDiscordChannel(guild, bot, channel), true);
	assert.equal(canPostToDiscordChannel(guild, member, channel), false);
	assert.equal(canPostToDiscordChannel(guild, bot, { ...channel, type: 4 }), false);
	for (const missing of [1n << 10n, 1n << 11n]) {
		assert.equal(canPostToDiscordChannel(guild, bot, { ...channel, overwrites: [{ id: guildId, type: 0, allow: 0n, deny: missing }] }), false);
	}
});

test('역할 allow가 역할 deny보다 우선하고 멤버 overwrite가 마지막에 적용된다', () => {
	const botWithRoles = { ...bot, roleIds: [botRoleId, roleId] };
	const withRoleOverwrites: DiscordGuildChannel = { ...channel, overwrites: [
		{ id: guildId, type: 0, allow: 0n, deny: postPermissions },
		{ id: botRoleId, type: 0, allow: postPermissions, deny: 0n },
		{ id: roleId, type: 0, allow: 0n, deny: postPermissions }
	] };
	assert.equal(canPostToDiscordChannel(guild, botWithRoles, withRoleOverwrites), true);
	assert.equal(canPostToDiscordChannel(guild, botWithRoles, { ...withRoleOverwrites, overwrites: [
		...withRoleOverwrites.overwrites, { id: botId, type: 1, allow: 0n, deny: 1n << 11n }
	] }), false);
	assert.equal(canPostToDiscordChannel(guild, bot, { ...channel, overwrites: [
		{ id: guildId, type: 0, allow: 0n, deny: postPermissions },
		{ id: botId, type: 1, allow: postPermissions, deny: 0n }
	] }), true);
});

test('Discord ADMINISTRATOR와 서버 소유자는 채널 overwrite를 우회한다', () => {
	const denied = { ...channel, overwrites: [{ id: botId, type: 1 as const, allow: 0n, deny: postPermissions }] };
	assert.equal(canPostToDiscordChannel({ ...guild, ownerId: botId }, bot, denied), true);
	assert.equal(canPostToDiscordChannel({ ...guild, roles: [{ id: botRoleId, permissions: 8n }] }, bot, denied), true);
});

test('미래 timeout은 게시를 막고 만료·해제·소유자·ADMINISTRATOR 예외를 구분한다', () => {
	const timedOut = { ...bot, communicationDisabledUntil: '2999-01-01T00:00:00.000Z' };
	assert.equal(canPostToDiscordChannel(guild, timedOut, channel), false);
	assert.equal(canPostToDiscordChannel(guild, { ...bot, communicationDisabledUntil: '2000-01-01T00:00:00.000Z' }, channel), true);
	assert.equal(canPostToDiscordChannel(guild, { ...bot, communicationDisabledUntil: null }, channel), true);
	assert.equal(canPostToDiscordChannel({ ...guild, ownerId: botId }, timedOut, channel), true);
	assert.equal(canPostToDiscordChannel({ ...guild, roles: [{ id: botRoleId, permissions: 8n }] }, timedOut, channel), true);
});

test('Discord member timeout 시각은 선택 필드이며 올바른 ISO 시각만 받는다', async () => {
	const payload = { user: { id: userId, username: 'tester', avatar: null }, roles: [] };
	for (const value of [null, '2999-01-01T00:00:00.000000+00:00']) {
		const discord = createDiscordClient({ token: 'test-token', fetch: async () => Response.json({ ...payload, communication_disabled_until: value }) });
		assert.equal((await discord.getMember(guildId, userId))?.communicationDisabledUntil, value);
	}
	for (const value of [123, true, 'tomorrow', '2999-01-01', '2999-99-99T00:00:00Z', '2999-02-31T00:00:00Z']) {
		const discord = createDiscordClient({ token: 'test-token', fetch: async () => Response.json({ ...payload, communication_disabled_until: value }) });
		await assert.rejects(discord.getMember(guildId, userId), expectStatus(502));
	}
	const withoutTimeout = createDiscordClient({ token: 'test-token', fetch: async () => Response.json(payload) });
	assert.equal((await withoutTimeout.getMember(guildId, userId))?.communicationDisabledUntil, undefined);
});

test('채널 응답의 길드·overwrite·중복 식별자를 검증하고 포럼은 게시 선택지에서 제외한다', async () => {
	const item = { id: channelId, guild_id: guildId, type: 0, name: '모집', position: 0, parent_id: null, permission_overwrites: [] };
	for (const value of [
		[{ ...item, guild_id: userId }], [item, item], [{ ...item, permission_overwrites: [{ id: roleId, type: 0, allow: 1, deny: '0' }] }],
		[{ ...item, permission_overwrites: [{ id: roleId, type: 3, allow: '0', deny: '0' }] }]
	]) {
		const discord = createDiscordClient({ token: 'test-token', fetch: async () => Response.json(value) });
		await assert.rejects(discord.listChannels(guildId), expectStatus(502));
	}
	const discord = createDiscordClient({ token: 'test-token', fetch: async () => Response.json([item, { ...item, id: categoryId, type: 15 }]) });
	assert.deepEqual((await discord.listChannels(guildId)).map((channel) => channel.id), [channelId]);
});

test('역할 목록에는 everyone이 있어야 하며 봇 사용자 응답을 확인한다', async () => {
	const discord = createDiscordClient({ token: 'test-token', fetch: async () => Response.json([{ id: roleId, name: '역할', permissions: '0', position: 0, managed: false }]) });
	await assert.rejects(discord.listRoles(guildId), expectStatus(502));
	const notBot = createDiscordClient({ token: 'test-token', fetch: async () => Response.json({ id: userId, bot: false }) });
	await assert.rejects(notBot.getCurrentUserId(), expectStatus(502));
});

test('설정 조회는 실제 선택지를 동기화하고 관리 역할·삭제된 선택값을 화면에서 제외한다', async () => {
	const storage = database();
	storage.settings.resultChannelId = '111111111111111111';
	const result = await getGuildDiscordSettings(storage.db, actor, guildId, { discord: client() });
	assert.deepEqual(result.roles.map((role) => role.id), [roleId, anotherRoleId]);
	assert.deepEqual(result.channels, [{ id: channelId, name: '모집', category: '내전', botCanPost: true }]);
	assert.equal(result.actorRoleIds, null);
	assert.equal(result.settings.resultChannelId, null);
	assert.equal(storage.settings.resultChannelId, '111111111111111111');
	assert.equal(storage.writes.filter((write) => write.kind === 'delete' && [guildDiscordRoles, guildDiscordChannels].includes(write.table as typeof guildDiscordRoles)).length, 2);
});

test('단일 설정 저장은 다른 키를 보존하고 봇이 보낼 수 있는 채널만 허용한다', async () => {
	const storage = database();
	storage.settings.entryChannelId = channelId;
	await setGuildDiscordSetting(storage.db, actor, guildId, 'resultChannelId', channelId, { discord: client() });
	assert.equal(storage.settings.entryChannelId, channelId);
	assert.equal(storage.settings.resultChannelId, channelId);
	const denied = client({ listChannels: async () => [{ ...channel, overwrites: [{ id: botId, type: 1, allow: 0n, deny: postPermissions }] }] });
	await assert.rejects(setGuildDiscordSetting(storage.db, actor, guildId, 'recruitmentChannelId', channelId, { discord: denied }), expectStatus(409));
	assert.equal(storage.settings.recruitmentChannelId, null);
	await assert.rejects(setGuildDiscordSetting(storage.db, actor, guildId, 'resultChannelId', categoryId, { discord: client() }), expectStatus(404));
});

test('운영자 역할만 가진 실행자는 자기 관리 권한을 없애거나 관리 역할로 바꿀 수 없다', async () => {
	const storage = database(roleId);
	const operatorRoles = roles.map((role) => role.id === roleId ? { ...role, permissions: 0n } : role);
	const operator = client({ getGuild: async () => ({ ...guild, roles: operatorRoles }), listRoles: async () => operatorRoles });
	for (const nextRole of [null, anotherRoleId]) {
		await assert.rejects(setGuildDiscordSetting(storage.db, actor, guildId, 'operatorRoleId', nextRole, { discord: operator }), expectStatus(409));
	}
	await assert.rejects(setGuildDiscordSetting(storage.db, actor, guildId, 'operatorRoleId', managedRoleId, { discord: operator }), expectStatus(404));
	await setGuildDiscordSetting(storage.db, actor, guildId, 'operatorRoleId', roleId, { discord: operator });
	assert.equal(storage.settings.operatorRoleId, roleId);
	const view = await getGuildDiscordSettings(storage.db, actor, guildId, { discord: operator });
	assert.deepEqual(view.actorRoleIds, [roleId]);
});

test('설정 키 허용 목록과 ID 검증은 외부 조회보다 먼저 실행한다', async () => {
	const storage = database();
	const discord = client({ getGuild: async () => { assert.fail('외부 조회하면 안 된다'); } });
	for (const key of ['guildId', '__proto__', 'toString']) {
		await assert.rejects(setGuildDiscordSetting(storage.db, actor, guildId, key, null, { discord }), expectStatus(400));
	}
	await assert.rejects(setGuildDiscordSetting(storage.db, actor, guildId, 'resultChannelId', '../other', { discord }), expectStatus(400));
	assert.equal(storage.writes.length, 0);
});

test('외부 목록 조회 실패를 빈 목록으로 간주해 역할·채널을 지우지 않는다', async () => {
	const storage = database();
	await assert.rejects(getGuildDiscordSettings(storage.db, actor, guildId, { discord: client({
		listChannels: async () => { throw new DiscordError(503, '채널 조회 실패'); }
	}) }), expectStatus(503));
	assert.ok(storage.writes.every((write) => write.table !== guildDiscordRoles && write.table !== guildDiscordChannels));
});

test('초기 관리자 확인 뒤 역할이 사라져도 최신 역할 목록으로 다시 거부한다', async () => {
	const storage = database(roleId);
	const before = roles.map((role) => role.id === roleId ? { ...role, permissions: 0n } : role);
	const discord = client({
		getGuild: async () => ({ ...guild, roles: before }),
		listRoles: async () => before.filter((role) => role.id !== roleId)
	});
	await assert.rejects(setGuildDiscordSetting(storage.db, actor, guildId, 'resultChannelId', channelId, { discord }), expectStatus(403));
	assert.equal(storage.settings.resultChannelId, null);
	assert.ok(storage.writes.every((write) => write.table !== guildDiscordRoles && write.table !== guildDiscordChannels));
});
