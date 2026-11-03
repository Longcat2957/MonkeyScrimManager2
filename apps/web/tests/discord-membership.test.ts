import assert from 'node:assert/strict';
import test from 'node:test';
import { guildMembers, guilds, users } from '../src/lib/server/db/schema.ts';
import type { Database } from '../src/lib/server/db/types.ts';
import { createDiscordClient, DiscordError, isDiscordId, type DiscordClient, type DiscordGuild, type DiscordMember } from '../src/lib/server/discord/client.ts';
import { canManageDiscordGuild, isGuildOperator } from '../src/lib/server/discord/membership.ts';
import { assertGuildAccess, requireGuildAdmin, requireGuildMember } from '../src/lib/server/guild/access.ts';
import { listAccessibleGuilds } from '../src/lib/server/guild/queries.ts';
import { DomainError } from '../src/lib/server/errors.ts';

const guildId = '123456789012345678';
const userId = '223456789012345678';
const roleId = '323456789012345678';
const actor = { userId, isServiceAdmin: false };
const guild: DiscordGuild = {
	id: guildId, name: '테스트 서버', iconHash: null, ownerId: '423456789012345678',
	roles: [{ id: guildId, permissions: 0n }, { id: roleId, permissions: 0n }]
};
const member: DiscordMember = { user: { id: userId, username: 'tester', globalName: null, avatarHash: null }, roleIds: [roleId] };

function discordStub(overrides: Partial<DiscordClient> = {}): DiscordClient {
	return { listGuilds: async () => [guild], getGuild: async () => guild, getMember: async () => member, ...overrides };
}

function databaseStub(options: { operatorRoleId?: string | null; membership?: unknown } = {}) {
	const writes: { kind: string; table: unknown; values?: unknown }[] = [];
	const db = {
		transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
		query: { guildDiscordSettings: { findFirst: async () => ({ operatorRoleId: options.operatorRoleId ?? null }) } },
		insert: (table: unknown) => ({ values: (values: unknown) => ({
			onConflictDoUpdate: async () => { writes.push({ kind: 'upsert', table, values }); },
			onConflictDoNothing: async () => { writes.push({ kind: 'insert', table, values }); }
		}) }),
		update: (table: unknown) => ({ set: (values: unknown) => ({ where: async () => { writes.push({ kind: 'update', table, values }); } }) }),
		delete: (table: unknown) => ({ where: async () => { writes.push({ kind: 'delete', table }); } }),
		select: () => ({ from: () => ({ innerJoin: () => ({ leftJoin: () => ({ where: () => ({ limit: async () => options.membership ? [options.membership] : [] }) }) }) }) })
	};
	return { db: db as unknown as Database, writes };
}

function expectStatus(status: number) {
	return (error: unknown) => {
		assert.ok(error instanceof DiscordError || error instanceof DomainError);
		assert.equal(error.status, status);
		return true;
	};
}

test('서버 소유자·모든 역할·@everyone의 관리 권한을 큰 정수로 계산한다', () => {
	assert.equal(canManageDiscordGuild(guild, member), false);
	assert.equal(canManageDiscordGuild({ ...guild, ownerId: userId }, member), true);
	for (const permission of [8n, 32n, (1n << 60n) | 32n]) {
		assert.equal(canManageDiscordGuild({ ...guild, roles: [{ id: guildId, permissions: permission }] }, member), true);
		assert.equal(canManageDiscordGuild({ ...guild, roles: [{ id: roleId, permissions: permission }] }, member), true);
	}
	assert.equal(canManageDiscordGuild({ ...guild, roles: [{ id: roleId, permissions: 1n << 60n }] }, member), false);
	assert.equal(canManageDiscordGuild({ ...guild, roles: [{ id: '523456789012345678', permissions: 8n }] }, member), false);
});

test('운영자 역할은 실제로 존재하고 현재 보유해야 하며 @everyone은 설정할 수 없다', () => {
	assert.equal(isGuildOperator(guild, member, roleId), true);
	assert.equal(isGuildOperator(guild, { ...member, roleIds: [] }, roleId), false);
	assert.equal(isGuildOperator({ ...guild, roles: [] }, member, roleId), false);
	assert.equal(isGuildOperator(guild, { ...member, roleIds: [guildId] }, guildId), false);
});

test('timeout 중에는 일반 서버 관리 권한이 없고 소유자·ADMINISTRATOR 예외는 유지한다', () => {
	const timedOut = { ...member, communicationDisabledUntil: new Date(Date.now() + 60_000).toISOString() };
	const managerGuild = { ...guild, roles: [{ id: roleId, permissions: 32n }] };
	assert.equal(canManageDiscordGuild(managerGuild, timedOut), false);
	assert.equal(canManageDiscordGuild({ ...managerGuild, ownerId: userId }, timedOut), true);
	assert.equal(canManageDiscordGuild({ ...guild, roles: [{ id: roleId, permissions: 8n }] }, timedOut), true);
	assert.equal(isGuildOperator(managerGuild, timedOut, roleId), true);
});

test('Discord ID는 unsigned 64비트 문자열만 허용한다', () => {
	for (const value of [userId, '18446744073709551615']) assert.equal(isDiscordId(value), true);
	for (const value of ['0', '-1', '01', '18446744073709551616', '../users', 123]) assert.equal(isDiscordId(value), false);
});

test('봇 토큰이 없으면 외부 요청 없이 503으로 실패한다', async () => {
	const client = createDiscordClient({ token: '', fetch: async () => { assert.fail('요청하면 안 된다'); } });
	await assert.rejects(client.listGuilds(), expectStatus(503));
});

test('봇 길드 목록은 페이지를 모두 검증하고 중복 페이지를 거부한다', async () => {
	const page = Array.from({ length: 200 }, (_, index) => ({ id: String(BigInt(guildId) + BigInt(index)), name: '서버', icon: null }));
	let requests = 0;
	const client = createDiscordClient({ token: 'test-token', fetch: async (url, options) => {
		assert.equal(new Headers(options?.headers).get('Authorization'), 'Bot test-token');
		assert.equal(options?.redirect, 'error');
		requests += 1;
		if (requests === 2) assert.match(String(url), new RegExp(`after=${page[199].id}$`));
		return Response.json(requests === 1 ? page : []);
	} });
	assert.equal((await client.listGuilds()).length, 200);
	assert.equal(requests, 2);
	const repeating = createDiscordClient({ token: 'test-token', fetch: async () => Response.json(page) });
	await assert.rejects(repeating.listGuilds(), expectStatus(502));
});

test('길드·멤버 응답의 식별자와 권한 비트가 올바르지 않으면 거부한다', async () => {
	const payload = { id: guildId, name: '서버', icon: null, owner_id: userId, roles: [{ id: guildId, permissions: '32' }] };
	for (const invalid of [
		null,
		{ ...payload, id: userId }, { ...payload, owner_id: '../' },
		{ ...payload, roles: [] }, { ...payload, roles: [{ id: guildId, permissions: 32 }] },
		{ ...payload, roles: [{ id: guildId, permissions: '-1' }] }
	]) {
		const client = createDiscordClient({ token: 'test-token', fetch: async () => Response.json(invalid) });
		await assert.rejects(client.getGuild(guildId), expectStatus(502));
	}
	const client = createDiscordClient({ token: 'test-token', fetch: async () => Response.json({
		user: { id: roleId, username: 'tester', avatar: null }, roles: []
	}) });
	await assert.rejects(client.getMember(guildId, userId), expectStatus(502));
});

test('권한 오류·호출 제한·시간 초과에서 원본 응답과 토큰을 노출하지 않는다', async () => {
	for (const upstream of [401, 403, 500]) {
		const client = createDiscordClient({ token: 'secret-token', fetch: async () => new Response('secret-token upstream detail', { status: upstream }) });
		await assert.rejects(client.getGuild(guildId), (error: unknown) => {
			assert.ok(error instanceof DiscordError);
			assert.equal(error.status, upstream === 500 ? 502 : 503);
			assert.doesNotMatch(error.message, /secret-token|upstream detail/);
			return true;
		});
	}
	const limited = createDiscordClient({ token: 'test-token', fetch: async () => new Response('', { status: 429, headers: { 'Retry-After': '1.5' } }) });
	await assert.rejects(limited.listGuilds(), (error: unknown) => {
		assert.ok(error instanceof DiscordError);
		assert.equal(error.status, 429);
		assert.equal(error.retryAfterSeconds, 2);
		return true;
	});
	const timeout = createDiscordClient({ token: 'test-token', timeoutMs: 1, fetch: async (_url, options) => {
		await new Promise((resolve) => setTimeout(resolve, 5));
		options?.signal?.throwIfAborted();
		return Response.json([]);
	} });
	await assert.rejects(timeout.listGuilds(), expectStatus(504));
});

test('관리자 권한을 매번 갱신하므로 직전 관리자와 서비스 운영자도 권한 철회 후 거부한다', async () => {
	const storage = databaseStub();
	let manage = true;
	const discord = discordStub({ getGuild: async () => ({ ...guild, roles: [{ id: guildId, permissions: manage ? 32n : 0n }] }) });
	assert.equal((await requireGuildAdmin(actor, guildId, { ...storage, discord })).isAdmin, true);
	manage = false;
	await assert.rejects(requireGuildAdmin({ ...actor, isServiceAdmin: true }, guildId, { ...storage, discord }), expectStatus(403));
	const membership = storage.writes.filter((write) => write.table === guildMembers).at(-1)?.values as { isAdmin: boolean; manageGuild: boolean };
	assert.equal(membership.isAdmin, false);
	assert.equal(membership.manageGuild, false);
});

test('탈퇴하면 현재 소속만 지우고 사용자와 기록은 지우지 않는다', async () => {
	const storage = databaseStub();
	await assert.rejects(requireGuildMember(actor, guildId, {
		...storage, discord: discordStub({ getMember: async () => null })
	}), expectStatus(404));
	assert.deepEqual(storage.writes.filter((write) => write.kind === 'delete').map((write) => write.table), [guildMembers]);
	assert.ok(storage.writes.every((write) => write.table !== users));
});

test('Discord 조회 실패에서는 저장된 관리자 권한으로 우회하거나 소속을 삭제하지 않는다', async () => {
	const storage = databaseStub({ operatorRoleId: roleId });
	await assert.rejects(requireGuildAdmin(actor, guildId, { ...storage, discord: discordStub({
		getMember: async () => { throw new DiscordError(503, '확인 실패'); }
	}) }), expectStatus(503));
	assert.equal(storage.writes.length, 0);
});

test('쓰기 트랜잭션은 현재 운영자 역할 설정·활성 여부·조회 시각을 다시 확인한다', async () => {
	const membership = {
		id: guildId, name: '서버', isActive: true, isAdmin: true, manageGuild: false,
		roleIds: [roleId], operatorRoleId: roleId, syncedAt: new Date()
	};
	assert.equal((await assertGuildAccess(databaseStub({ membership }).db, actor, guildId, true)).isAdmin, true);
	for (const [change, status] of [
		[{ operatorRoleId: null }, 403], [{ isActive: false }, 404], [{ syncedAt: null }, 503],
		[{ syncedAt: new Date(Date.now() - 61_000) }, 503]
	] as const) {
		await assert.rejects(assertGuildAccess(databaseStub({ membership: { ...membership, ...change } }).db, actor, guildId, true), expectStatus(status));
	}
});

test('전체 길드 목록 조회 실패에서는 길드 활성 상태를 바꾸지 않는다', async () => {
	const storage = databaseStub();
	await assert.rejects(listAccessibleGuilds(actor, { ...storage, discord: discordStub({
		listGuilds: async () => { throw new DiscordError(503, '목록 실패'); }
	}) }), expectStatus(503));
	assert.equal(storage.writes.length, 0);
});

test('길드 목록 조회는 동시 요청을 네 개로 제한하고 실제 소속만 반환한다', async () => {
	const storage = databaseStub();
	const allGuilds = Array.from({ length: 9 }, (_, index) => ({ ...guild, id: String(BigInt(guildId) + BigInt(index)) }));
	let running = 0;
	let maximum = 0;
	const result = await listAccessibleGuilds(actor, { ...storage, discord: discordStub({
		listGuilds: async () => allGuilds,
		getGuild: async (id) => allGuilds.find((item) => item.id === id)!,
		getMember: async (id) => {
			running += 1;
			maximum = Math.max(maximum, running);
			await new Promise((resolve) => setTimeout(resolve, 2));
			running -= 1;
			return id === guildId ? member : null;
		}
	}) });
	assert.equal(maximum, 4);
	assert.deepEqual(result, [{ id: guildId, name: guild.name }]);
	assert.ok(storage.writes.some((write) => write.table === guilds));
	assert.deepEqual(await listAccessibleGuilds(null), []);
});
