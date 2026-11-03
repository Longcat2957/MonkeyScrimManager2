import assert from 'node:assert/strict';
import test from 'node:test';
import { isDiscordId, type DiscordGuild, type DiscordGuildChannel, type DiscordMember } from '../../../src/lib/server/discord/client.ts';
import { canManageDiscordGuild, isGuildOperator } from '../../../src/lib/server/discord/membership.ts';
import { canPostToDiscordChannel } from '../../../src/lib/server/guild/settings.ts';

const guildId = '710000000000000001';
const userId = '710000000000000002';
const roleId = '710000000000000003';
const otherRoleId = '710000000000000004';
const now = Date.parse('2026-11-03T00:00:00Z');
const post = (1n << 10n) | (1n << 11n);
const guild: DiscordGuild = { id: guildId, name: '서버', iconHash: null, ownerId: '710000000000000009', roles: [{ id: guildId, permissions: 0n }, { id: roleId, permissions: 0n }] };
const member: DiscordMember = { user: { id: userId, username: '멤버', globalName: null, avatarHash: null }, roleIds: [roleId] };
const channel: DiscordGuildChannel = { id: '710000000000000005', type: 0, name: '모집', position: 0, parentId: null, overwrites: [] };

for (const [name, value, valid] of [
	['일반 ID', userId, true], ['최댓값', '18446744073709551615', true], ['0', '0', false], ['음수', '-1', false],
	['선행 0', '01', false], ['범위 초과', '18446744073709551616', false], ['경로', '../users', false], ['숫자 타입', 123, false]
] as const) {
	test(`Discord 식별자: ${name}`, () => assert.equal(isDiscordId(value), valid));
}

for (const [name, permissions, expected] of [['일반', 0n, false], ['관리자', 8n, true], ['서버 관리', 32n, true], ['큰 비트와 서버 관리', (1n << 60n) | 32n, true], ['큰 비트만', 1n << 60n, false]] as const) {
	test(`실효 권한 합집합: ${name}`, () => {
		assert.equal(canManageDiscordGuild({ ...guild, roles: [{ id: guildId, permissions }] }, member), expected);
		assert.equal(canManageDiscordGuild({ ...guild, roles: [{ id: roleId, permissions }] }, member), expected);
	});
}

test('소유자는 관리할 수 있지만 보유하지 않은 역할은 권한을 주지 않는다', () => {
	assert.equal(canManageDiscordGuild({ ...guild, ownerId: userId }, member), true);
	assert.equal(canManageDiscordGuild({ ...guild, roles: [{ id: otherRoleId, permissions: 8n }] }, member), false);
});

test('운영 역할은 현재 존재·보유해야 하며 @everyone은 사용할 수 없다', () => {
	assert.equal(isGuildOperator(guild, member, roleId), true);
	assert.equal(isGuildOperator(guild, { ...member, roleIds: [] }, roleId), false);
	assert.equal(isGuildOperator({ ...guild, roles: [] }, member, roleId), false);
	assert.equal(isGuildOperator(guild, { ...member, roleIds: [guildId] }, guildId), false);
});

for (const [offset, allowed] of [[1, false], [0, true], [-1, true]] as const) {
	test(`timeout 만료 경계 ${offset}ms: 서버 관리·게시 권한`, (t) => {
		t.mock.method(Date, 'now', () => now);
		const timed = { ...member, communicationDisabledUntil: new Date(now + offset).toISOString() };
		const permitted = { ...guild, roles: [{ id: roleId, permissions: post | 32n }] };
		assert.equal(canManageDiscordGuild(permitted, timed), allowed);
		assert.equal(canPostToDiscordChannel(permitted, timed, channel), allowed);
	});
}

test('소유자·ADMINISTRATOR는 timeout 예외이고 운영 역할 자체는 유지한다', (t) => {
	t.mock.method(Date, 'now', () => now);
	const timed = { ...member, communicationDisabledUntil: new Date(now + 1).toISOString() };
	const denied: DiscordGuildChannel = { ...channel, overwrites: [{ id: userId, type: 1, allow: 0n, deny: post }] };
	for (const permitted of [{ ...guild, ownerId: userId }, { ...guild, roles: [{ id: roleId, permissions: 8n }] }]) {
		assert.equal(canManageDiscordGuild(permitted, timed), true);
		assert.equal(canPostToDiscordChannel(permitted, timed, denied), true);
	}
	assert.equal(isGuildOperator(guild, timed, roleId), true);
});

test('게시에는 보기·보내기 권한이 모두 필요하며 관리 권한만으로는 부족하다', () => {
	assert.equal(canPostToDiscordChannel({ ...guild, roles: [{ id: roleId, permissions: post }] }, member, channel), true);
	for (const permissions of [32n, 1n << 10n, 1n << 11n]) {
		assert.equal(canPostToDiscordChannel({ ...guild, roles: [{ id: roleId, permissions }] }, member, channel), false);
	}
	assert.equal(canPostToDiscordChannel({ ...guild, ownerId: userId }, member, { ...channel, type: 4 }), false);
	assert.equal(canPostToDiscordChannel({ ...guild, ownerId: userId }, member, { ...channel, type: 5 }), true);
});

test('채널 권한은 everyone → 역할 deny/allow → 멤버 overwrite 순서다', () => {
	const permissions = { ...guild, roles: [...guild.roles, { id: otherRoleId, permissions: 0n }] };
	const twoRoles = { ...member, roleIds: [roleId, otherRoleId] };
	const overwritten: DiscordGuildChannel = { ...channel, overwrites: [
		{ id: guildId, type: 0, allow: 0n, deny: post },
		{ id: roleId, type: 0, allow: post, deny: 0n },
		{ id: otherRoleId, type: 0, allow: 0n, deny: post }
	] };
	assert.equal(canPostToDiscordChannel(permissions, twoRoles, overwritten), true);
	assert.equal(canPostToDiscordChannel(permissions, twoRoles, { ...overwritten, overwrites: [...overwritten.overwrites,
		{ id: userId, type: 1, allow: 0n, deny: 1n << 11n }] }), false);
	assert.equal(canPostToDiscordChannel(guild, member, { ...channel, overwrites: [
		{ id: guildId, type: 0, allow: 0n, deny: post }, { id: userId, type: 1, allow: post, deny: 0n }
	] }), true);
});
