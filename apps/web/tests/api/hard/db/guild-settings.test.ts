import assert from 'node:assert/strict';
import test from 'node:test';
import { and, eq } from 'drizzle-orm';
import { getGuildDiscordSettings, setGuildDiscordSetting } from '../../../../src/lib/server/guild/settings.ts';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { DomainError } from '../../../../src/lib/server/errors.ts';
import { createAccessFixture } from '../../support/access-fixtures.ts';

const domain = (code: DomainError['code']) => (error: unknown) => error instanceof DomainError && error.code === code;

test('역할·채널 조회는 실제 선택지와 게시 권한을 저장하고 관리 역할과 카테고리를 제외한다', async (t) => {
	const f = await createAccessFixture(t);
	const view = await getGuildDiscordSettings(f.db, f.owner, f.ids.guild, { discord: f.discord });
	assert.deepEqual(view.roles, [{ id: f.ids.role, name: '운영 역할' }]);
	assert.deepEqual(view.channels.map(({ id, category, botCanPost }) => ({ id, category, botCanPost })), [
		{ id: f.ids.channel, category: '운영', botCanPost: true },
		{ id: f.ids.otherChannel, category: null, botCanPost: true }
	]);
	assert.equal(view.actorRoleIds, null);
	const roles = await f.db.select().from(schema.guildDiscordRoles);
	const channels = await f.db.select().from(schema.guildDiscordChannels);
	assert.deepEqual(roles.map((row) => row.roleId), [f.ids.role]);
	assert.equal(channels.length, 2);
	assert.ok(channels.every((row) => row.guildId === f.ids.guild && row.botCanPost));
});

test('한 설정 키 변경과 해제는 같은 서버의 다른 설정과 다른 서버 설정을 보존한다', async (t) => {
	const f = await createAccessFixture(t);
	await f.db.insert(schema.guildDiscordSettings).values([
		{ guildId: f.ids.guild, entryChannelId: f.ids.otherChannel },
		{ guildId: f.ids.otherGuild, recruitmentChannelId: f.ids.otherChannel }
	]);
	await setGuildDiscordSetting(f.db, f.owner, f.ids.guild, 'recruitmentChannelId', f.ids.channel, { discord: f.discord });
	const saved = await f.db.query.guildDiscordSettings.findFirst({ where: eq(schema.guildDiscordSettings.guildId, f.ids.guild) });
	assert.equal(saved!.recruitmentChannelId, f.ids.channel);
	assert.equal(saved!.entryChannelId, f.ids.otherChannel);
	await setGuildDiscordSetting(f.db, f.owner, f.ids.guild, 'recruitmentChannelId', null, { discord: f.discord });
	assert.equal((await f.db.query.guildDiscordSettings.findFirst({ where: eq(schema.guildDiscordSettings.guildId, f.ids.guild) }))!.entryChannelId, f.ids.otherChannel);
	assert.equal((await f.db.query.guildDiscordSettings.findFirst({ where: eq(schema.guildDiscordSettings.guildId, f.ids.otherGuild) }))!.recruitmentChannelId, f.ids.otherChannel);
});

test('삭제된 선택지는 화면에서 숨기되 저장된 설정을 임의로 삭제하지 않는다', async (t) => {
	const f = await createAccessFixture(t);
	await f.db.insert(schema.guildDiscordSettings).values({ guildId: f.ids.guild, operatorRoleId: f.ids.role, resultChannelId: f.ids.channel });
	f.roles.set(f.ids.guild, f.roles.get(f.ids.guild)!.filter((role) => role.id !== f.ids.role));
	f.channels.set(f.ids.guild, []);
	const view = await getGuildDiscordSettings(f.db, f.owner, f.ids.guild, { discord: f.discord });
	assert.equal(view.settings.operatorRoleId, null);
	assert.equal(view.settings.resultChannelId, null);
	const stored = await f.db.query.guildDiscordSettings.findFirst({ where: eq(schema.guildDiscordSettings.guildId, f.ids.guild) });
	assert.equal(stored!.operatorRoleId, f.ids.role);
	assert.equal(stored!.resultChannelId, f.ids.channel);
});

test('게시 불가·외부 서버 채널은 저장하지 않는다', async (t) => {
	const f = await createAccessFixture(t);
	f.channels.get(f.ids.guild)!.find((channel) => channel.id === f.ids.channel)!.overwrites = [{ id: f.ids.guild, type: 0, allow: 0n, deny: 1n << 11n }];
	await assert.rejects(setGuildDiscordSetting(f.db, f.owner, f.ids.guild, 'resultChannelId', f.ids.channel, { discord: f.discord }), domain('CONFLICT'));
	const foreignId = String(BigInt(f.ids.channel) + 1_000n);
	f.channels.get(f.ids.otherGuild)!.push({ id: foreignId, type: 0, name: '다른 서버 채널', position: 3, parentId: null, overwrites: [] });
	await assert.rejects(setGuildDiscordSetting(f.db, f.owner, f.ids.guild, 'resultChannelId', foreignId, { discord: f.discord }), domain('NOT_FOUND'));
	assert.equal((await f.db.select().from(schema.guildDiscordSettings)).length, 0);
});

test('운영 역할만 가진 사용자는 자신의 관리 권한을 제거할 수 없다', async (t) => {
	const f = await createAccessFixture(t);
	await f.db.insert(schema.guildDiscordSettings).values({ guildId: f.ids.guild, operatorRoleId: f.ids.role });
	const view = await getGuildDiscordSettings(f.db, f.member, f.ids.guild, { discord: f.discord });
	assert.deepEqual(view.actorRoleIds, [f.ids.role]);
	await assert.rejects(setGuildDiscordSetting(f.db, f.member, f.ids.guild, 'operatorRoleId', null, { discord: f.discord }), domain('CONFLICT'));
	assert.equal((await f.db.query.guildDiscordSettings.findFirst({ where: eq(schema.guildDiscordSettings.guildId, f.ids.guild) }))!.operatorRoleId, f.ids.role);
});

test('운영 역할 변경은 멤버 표시 권한을 해당 서버에서만 갱신한다', async (t) => {
	const f = await createAccessFixture(t);
	await setGuildDiscordSetting(f.db, f.owner, f.ids.guild, 'operatorRoleId', f.ids.role, { discord: f.discord });
	const local = await f.db.query.guildMembers.findFirst({ where: and(eq(schema.guildMembers.guildId, f.ids.guild), eq(schema.guildMembers.userId, f.member.userId)) });
	const remote = await f.db.query.guildMembers.findFirst({ where: and(eq(schema.guildMembers.guildId, f.ids.otherGuild), eq(schema.guildMembers.userId, f.member.userId)) });
	assert.equal(local!.isAdmin, true);
	assert.equal(remote!.isAdmin, false);
	await setGuildDiscordSetting(f.db, f.owner, f.ids.guild, 'operatorRoleId', null, { discord: f.discord });
	assert.equal((await f.db.query.guildMembers.findFirst({ where: and(eq(schema.guildMembers.guildId, f.ids.guild), eq(schema.guildMembers.userId, f.member.userId)) }))!.isAdmin, false);
});

test('외부 조회 사이 운영 역할이 삭제되면 쓰기 직전 다시 거절한다', async (t) => {
	const f = await createAccessFixture(t);
	await f.db.insert(schema.guildDiscordSettings).values({ guildId: f.ids.guild, operatorRoleId: f.ids.role });
	const withoutOperator = f.roles.get(f.ids.guild)!.filter((role) => role.id !== f.ids.role);
	await assert.rejects(setGuildDiscordSetting(f.db, f.member, f.ids.guild, 'resultChannelId', f.ids.channel, {
		discord: { ...f.discord, listRoles: async () => withoutOperator }
	}), domain('FORBIDDEN'));
	assert.equal((await f.db.query.guildDiscordSettings.findFirst({ where: eq(schema.guildDiscordSettings.guildId, f.ids.guild) }))!.resultChannelId, null);
	assert.equal((await f.db.select().from(schema.guildDiscordChannels)).length, 0);
});

test('선택지 저장 중 DB 오류가 발생하면 이전 선택지와 설정이 모두 유지된다', async (t) => {
	const f = await createAccessFixture(t);
	await getGuildDiscordSettings(f.db, f.owner, f.ids.guild, { discord: f.discord });
	await f.db.insert(schema.guildDiscordSettings).values({ guildId: f.ids.guild, resultChannelId: f.ids.otherChannel });
	const rolesBefore = await f.db.select().from(schema.guildDiscordRoles);
	const channelsBefore = await f.db.select().from(schema.guildDiscordChannels);
	f.roles.get(f.ids.guild)!.find((role) => role.id === f.ids.role)!.name = '롤백할 새 이름';
	await f.pool.query(`CREATE FUNCTION reject_channel_insert() RETURNS trigger LANGUAGE plpgsql AS $$
		BEGIN RAISE EXCEPTION '검증용 채널 저장 실패'; END $$`);
	await f.pool.query('CREATE TRIGGER reject_channel_insert BEFORE INSERT ON guild_discord_channels FOR EACH ROW EXECUTE FUNCTION reject_channel_insert()');
	await assert.rejects(setGuildDiscordSetting(f.db, f.owner, f.ids.guild, 'resultChannelId', f.ids.channel, { discord: f.discord }),
		(error: unknown) => error instanceof Error && (error.cause as { code?: string } | undefined)?.code === 'P0001');
	assert.deepEqual(await f.db.select().from(schema.guildDiscordRoles), rolesBefore);
	assert.deepEqual(await f.db.select().from(schema.guildDiscordChannels), channelsBefore);
	assert.equal((await f.db.query.guildDiscordSettings.findFirst({ where: eq(schema.guildDiscordSettings.guildId, f.ids.guild) }))!.resultChannelId, f.ids.otherChannel);
});
