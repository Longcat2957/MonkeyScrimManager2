import assert from 'node:assert/strict';
import test from 'node:test';
import { createDiscordClient, DiscordError } from '../../../src/lib/server/discord/client.ts';
import { discordError } from '../support/error-assertions.ts';

const guildId = '710000000000000001';
const userId = '710000000000000002';
const roleId = '710000000000000003';
const channelId = '710000000000000004';
const payload = { id: guildId, name: '서버', icon: null, owner_id: userId, roles: [{ id: guildId, permissions: '32' }] };
const member = { user: { id: userId, username: '멤버', avatar: null }, roles: [] };
const channel = { id: channelId, guild_id: guildId, type: 0, name: '모집', position: 0, parent_id: null, permission_overwrites: [] };
const client = (value: unknown) => createDiscordClient({ token: 'test-token', fetch: async () => Response.json(value) });

for (const token of ['', 'bad token', 'bad\ntoken']) {
	test(`잘못된 봇 읽기 토큰은 요청하지 않는다: ${JSON.stringify(token)}`, async () => {
		await assert.rejects(createDiscordClient({ token, fetch: async () => { assert.fail('요청하면 안 된다'); } }).listGuilds(), discordError(503));
	});
}

test('길드 목록은 페이지 경계와 헤더를 검증하고 모든 페이지를 반환한다', async () => {
	const page = Array.from({ length: 200 }, (_, index) => ({ id: String(BigInt(guildId) + BigInt(index)), name: '서버', icon: null }));
	let calls = 0;
	const discord = createDiscordClient({ token: 'test-token', fetch: async (input, init) => {
		const url = new URL(String(input));
		assert.equal(url.origin, 'https://discord.com');
		assert.equal(new Headers(init?.headers).get('Authorization'), 'Bot test-token');
		assert.equal(init?.redirect, 'error');
		if (++calls === 2) assert.equal(url.searchParams.get('after'), page[199]!.id);
		return Response.json(calls === 1 ? page : []);
	} });
	assert.equal((await discord.listGuilds()).length, 200);
	assert.equal(calls, 2);
});

test('반복된 목록 페이지를 부분 성공으로 처리하지 않는다', async () => {
	const page = Array.from({ length: 200 }, (_, index) => ({ id: String(BigInt(guildId) + BigInt(index)), name: '서버', icon: null }));
	await assert.rejects(client(page).listGuilds(), discordError(502));
});

for (const [name, value] of [
	['null', null], ['다른 길드', { ...payload, id: userId }], ['잘못된 소유자', { ...payload, owner_id: '../' }],
	['everyone 없음', { ...payload, roles: [] }], ['권한 숫자', { ...payload, roles: [{ id: guildId, permissions: 32 }] }],
	['음수 권한', { ...payload, roles: [{ id: guildId, permissions: '-1' }] }], ['중복 역할', { ...payload, roles: [...payload.roles, ...payload.roles] }]
] as const) {
	test(`길드 응답 검증: ${name}`, async () => assert.rejects(client(value).getGuild(guildId), discordError(502)));
}

test('정상 길드의 권한 문자열은 BigInt이며 잘못된 멤버 귀속은 거절한다', async () => {
	assert.deepEqual((await client(payload).getGuild(guildId))?.roles, [{ id: guildId, permissions: 32n }]);
	await assert.rejects(client({ ...member, user: { ...member.user, id: roleId } }).getMember(guildId, userId), discordError(502));
	const missing = createDiscordClient({ token: 'test-token', fetch: async () => new Response(null, { status: 404 }) });
	assert.equal(await missing.getGuild(guildId), null);
	assert.equal(await missing.getMember(guildId, userId), null);
});

for (const value of [123, true, 'tomorrow', '2999-01-01', '2999-99-99T00:00:00Z', '2999-02-31T00:00:00Z']) {
	test(`멤버 timeout 시각 거절: ${String(value)}`, async () => {
		await assert.rejects(client({ ...member, communication_disabled_until: value }).getMember(guildId, userId), discordError(502));
	});
}

test('멤버 timeout 시각은 선택 필드이고 null·정확한 ISO 형식을 보존한다', async () => {
	assert.equal((await client(member).getMember(guildId, userId))?.communicationDisabledUntil, undefined);
	for (const value of [null, '2999-01-01T00:00:00.000000+00:00']) {
		assert.equal((await client({ ...member, communication_disabled_until: value }).getMember(guildId, userId))?.communicationDisabledUntil, value);
	}
});

for (const [name, value] of [
	['다른 길드', [{ ...channel, guild_id: userId }]], ['중복 채널', [channel, channel]],
	['숫자 allow', [{ ...channel, permission_overwrites: [{ id: roleId, type: 0, allow: 1, deny: '0' }] }]],
	['잘못된 overwrite 종류', [{ ...channel, permission_overwrites: [{ id: roleId, type: 3, allow: '0', deny: '0' }] }]],
	['중복 overwrite', [{ ...channel, permission_overwrites: Array.from({ length: 2 }, () => ({ id: roleId, type: 0, allow: '0', deny: '0' })) }]]
] as const) {
	test(`채널 응답 검증: ${name}`, async () => assert.rejects(client(value).listChannels(guildId), discordError(502)));
}

test('게시 선택지는 텍스트·공지·카테고리만 포함하고 역할 목록은 everyone을 요구한다', async () => {
	assert.deepEqual((await client([channel, { ...channel, id: roleId, type: 15 }]).listChannels(guildId)).map((entry) => entry.id), [channelId]);
	await assert.rejects(client([{ id: roleId, name: '역할', permissions: '0', position: 0, managed: false }]).listRoles(guildId), discordError(502));
	assert.equal((await client([{ id: guildId, name: '@everyone', permissions: '0', position: 0, managed: false }]).listRoles(guildId))[0]!.id, guildId);
	await assert.rejects(client({ id: userId, bot: false }).getCurrentUserId(), discordError(502));
	assert.equal(await client({ id: userId, bot: true }).getCurrentUserId(), userId);
});

for (const [upstream, expected] of [[401, 503], [403, 503], [500, 502]] as const) {
	test(`Discord ${upstream} 오류에서 토큰과 외부 본문을 숨긴다`, async () => {
		const discord = createDiscordClient({ token: 'private-token', fetch: async () => new Response('private-body', { status: upstream }) });
		await assert.rejects(discord.getGuild(guildId), (error: unknown) => {
			discordError(expected)(error);
			assert.ok(error instanceof Error);
			assert.doesNotMatch(error.message, /private-/);
			return true;
		});
	});
}

test('Discord 429는 초 단위 재시도 값을 올림한다', async () => {
	const discord = createDiscordClient({ token: 'test-token', fetch: async () => new Response(null, { status: 429, headers: { 'Retry-After': '1.5' } }) });
	await assert.rejects(discord.listGuilds(), (error: unknown) => {
		assert.ok(error instanceof DiscordError);
		assert.equal(error.status, 429);
		assert.equal(error.retryAfterSeconds, 2);
		return true;
	});
});

test('실제 대기 없이 중단된 signal을 주입하여 timeout 매핑을 확인한다', async (t) => {
	const controller = new AbortController();
	t.mock.method(AbortSignal, 'timeout', () => controller.signal);
	const discord = createDiscordClient({ token: 'test-token', fetch: async (_input, init) => {
		controller.abort();
		init!.signal!.throwIfAborted();
		return Response.json([]);
	} });
	await assert.rejects(discord.listGuilds(), discordError(504));
});
