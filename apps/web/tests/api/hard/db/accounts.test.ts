import assert from 'node:assert/strict';
import test from 'node:test';
import { and, eq } from 'drizzle-orm';
import { linkRiotAccount, setPrimaryRiotAccount, unlinkRiotAccount } from '../../../../src/lib/server/accounts/service.ts';
import { listGuildMembers, listMyRiotAccounts, lookupRiotAccount } from '../../../../src/lib/server/accounts/queries.ts';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { DomainError } from '../../../../src/lib/server/errors.ts';
import { createAccessFixture } from '../../support/access-fixtures.ts';

const domain = (code: DomainError['code']) => (error: unknown) => error instanceof DomainError && error.code === code;

test('계정 연결은 첫 계정을 대표로 저장하고 재요청에도 식별 행과 연결이 하나다', async (t) => {
	const f = await createAccessFixture(t);
	const observer = await f.pool.connect();
	try {
		await linkRiotAccount(f.db, f.owner, f.ids.guild, f.member.userId, 'First#KR1', f.dependencies);
		await linkRiotAccount(f.db, f.owner, f.ids.guild, f.member.userId, 'First#KR1', f.dependencies);
		const result = await observer.query('SELECT a.game_name, a.platform, l.is_primary FROM riot_accounts a JOIN guild_riot_accounts l ON a.id=l.riot_account_id');
		assert.deepEqual(result.rows, [{ game_name: 'First', platform: 'kr', is_primary: true }]);
		assert.equal((await f.db.select().from(schema.riotAccounts)).length, 1);
		await assert.rejects(lookupRiotAccount(f.db, f.owner, f.ids.guild, 'First#KR1', f.dependencies), domain('CONFLICT'));
	} finally { observer.release(); }
});

test('같은 PUUID는 서버별로 다른 사용자에게 독립적으로 연결할 수 있다', async (t) => {
	const f = await createAccessFixture(t);
	await linkRiotAccount(f.db, f.owner, f.ids.guild, f.member.userId, 'Shared#KR1', f.dependencies);
	await linkRiotAccount(f.db, f.owner, f.ids.otherGuild, f.otherMember.userId, 'Shared#KR1', f.dependencies);
	const accounts = await f.db.select().from(schema.riotAccounts);
	const links = await f.db.select().from(schema.guildRiotAccounts);
	assert.equal(accounts.length, 1);
	assert.equal(links.length, 2);
	assert.ok(links.every((link) => link.riotAccountId === accounts[0]!.id && link.isPrimary));
	assert.deepEqual(new Set(links.map((link) => `${link.guildId}:${link.userId}`)), new Set([`${f.ids.guild}:${f.member.userId}`, `${f.ids.otherGuild}:${f.otherMember.userId}`]));
});

test('같은 서버에서 연결된 계정을 다른 사용자에게 이전하거나 남의 대표 계정으로 지정하지 못한다', async (t) => {
	const f = await createAccessFixture(t);
	await linkRiotAccount(f.db, f.owner, f.ids.guild, f.member.userId, 'Owned#KR1', f.dependencies);
	const [account] = await f.db.select().from(schema.riotAccounts);
	await assert.rejects(linkRiotAccount(f.db, f.owner, f.ids.guild, f.otherMember.userId, 'Owned#KR1', f.dependencies), domain('CONFLICT'));
	await assert.rejects(setPrimaryRiotAccount(f.db, f.owner, f.ids.guild, f.otherMember.userId, account!.id, f.dependencies), domain('NOT_FOUND'));
	const links = await f.db.select().from(schema.guildRiotAccounts);
	assert.equal(links.length, 1);
	assert.equal(links[0]!.userId, f.member.userId);
});

test('대표 변경은 해당 서버에만 적용되고 대표 해제 시 남은 계정으로 승계한다', async (t) => {
	const f = await createAccessFixture(t);
	const first = await f.seedAccount();
	const second = await f.seedAccount(f.ids.guild, f.member.userId, false);
	await f.db.insert(schema.guildRiotAccounts).values({ guildId: f.ids.otherGuild, userId: f.member.userId, riotAccountId: first.id, isPrimary: true });
	await setPrimaryRiotAccount(f.db, f.owner, f.ids.guild, f.member.userId, second.id, f.dependencies);
	const primary = await f.db.select().from(schema.guildRiotAccounts).where(eq(schema.guildRiotAccounts.isPrimary, true));
	assert.deepEqual(new Set(primary.map((link) => `${link.guildId}:${link.riotAccountId}`)), new Set([`${f.ids.guild}:${second.id}`, `${f.ids.otherGuild}:${first.id}`]));
	await unlinkRiotAccount(f.db, f.owner, f.ids.guild, f.member.userId, second.id, f.dependencies);
	const after = await f.db.select().from(schema.guildRiotAccounts).where(eq(schema.guildRiotAccounts.guildId, f.ids.guild));
	assert.equal(after.length, 1);
	assert.equal(after[0]!.riotAccountId, first.id);
	assert.equal(after[0]!.isPrimary, true);
	assert.equal((await f.db.select().from(schema.riotAccounts)).length, 2);
});

for (const inSameGuild of [true, false]) {
	test(`${inSameGuild ? '같은' : '다른'} 서버의 활성 신청에 대한 계정 해제 범위를 지킨다`, async (t) => {
		const f = await createAccessFixture(t);
		const account = await f.seedAccount();
		const activeGuild = inSameGuild ? f.ids.guild : f.ids.otherGuild;
		if (!inSameGuild) await f.db.insert(schema.guildRiotAccounts).values({ guildId: activeGuild, userId: f.member.userId, riotAccountId: account.id, isPrimary: true });
		const [scrim] = await f.db.insert(schema.scrims).values({ guildId: activeGuild, title: '신청 내전' }).returning();
		const [participant] = await f.db.insert(schema.scrimParticipants).values({ scrimId: scrim!.id, userId: f.member.userId, riotAccountId: account.id, displayName: '당시 이름' }).returning();
		const [registration] = await f.db.insert(schema.scrimParticipantRegistrations).values({ scrimParticipantId: participant!.id, status: 'selected' }).returning();
		if (inSameGuild) {
			await assert.rejects(unlinkRiotAccount(f.db, f.owner, f.ids.guild, f.member.userId, account.id, f.dependencies), domain('CONFLICT'));
			assert.equal((await f.db.select().from(schema.guildRiotAccounts)).length, 1);
			await f.db.update(schema.scrimParticipantRegistrations).set({ status: 'withdrawn', withdrawnAt: new Date(registration!.joinedAt.getTime() + 1_000) }).where(eq(schema.scrimParticipantRegistrations.id, registration!.id));
		}
		await unlinkRiotAccount(f.db, f.owner, f.ids.guild, f.member.userId, account.id, f.dependencies);
		assert.equal((await f.db.select().from(schema.guildRiotAccounts).where(eq(schema.guildRiotAccounts.guildId, f.ids.guild))).length, 0);
		assert.equal((await f.db.select().from(schema.guildRiotAccounts).where(eq(schema.guildRiotAccounts.guildId, f.ids.otherGuild))).length, inSameGuild ? 0 : 1);
		const [historical] = await f.db.select().from(schema.scrimParticipants).where(eq(schema.scrimParticipants.id, participant!.id));
		assert.equal(historical!.riotAccountId, account.id);
		assert.equal(historical!.userId, f.member.userId);
	});
}

test('일반 멤버와 비소속 사용자는 연결을 조작할 수 없고 DB를 변경하지 않는다', async (t) => {
	const f = await createAccessFixture(t);
	await assert.rejects(linkRiotAccount(f.db, null, f.ids.guild, f.member.userId, 'Blocked#KR1', f.dependencies), domain('UNAUTHENTICATED'));
	await assert.rejects(linkRiotAccount(f.db, f.member, f.ids.guild, f.member.userId, 'Blocked#KR1', f.dependencies), domain('FORBIDDEN'));
	await assert.rejects(linkRiotAccount(f.db, f.owner, f.ids.guild, f.ids.outsider, 'Blocked#KR1', f.dependencies), domain('NOT_FOUND'));
	assert.equal((await f.db.select().from(schema.riotAccounts)).length, 0);
	assert.equal((await f.db.select().from(schema.guildRiotAccounts)).length, 0);
});

test('개인 조회는 서버별 연결을 묶고 관리자 조회는 해당 서버 연결만 반환한다', async (t) => {
	const f = await createAccessFixture(t);
	const local = await f.seedAccount();
	const remote = await f.seedAccount(f.ids.otherGuild);
	const mine = await listMyRiotAccounts(f.db, f.member);
	assert.equal(mine.length, 2);
	assert.deepEqual(mine.find((group) => group.guildId === f.ids.guild)!.riotAccounts.map((account) => account.id), [local.id]);
	assert.deepEqual(mine.find((group) => group.guildId === f.ids.otherGuild)!.riotAccounts.map((account) => account.id), [remote.id]);
	const list = await listGuildMembers(f.db, f.owner, f.ids.guild, { q: '', page: 1, pageSize: 20 }, f.dependencies);
	assert.deepEqual(list.members.find((row) => row.userId === f.member.userId)!.riotAccounts.map((account) => account.id), [local.id]);
	await assert.rejects(listMyRiotAccounts(f.db, null), domain('UNAUTHENTICATED'));
});

test('동시에 같은 계정을 연결해도 하나의 식별 행과 대표 연결만 남는다', async (t) => {
	const f = await createAccessFixture(t);
	let release!: () => void;
	const start = new Promise<void>((resolve) => { release = resolve; });
	const requests = [1, 2].map(async () => {
		await start;
		await linkRiotAccount(f.db, f.owner, f.ids.guild, f.member.userId, 'Concurrent#KR1', f.dependencies);
	});
	release();
	const results = await Promise.allSettled(requests);
	assert.deepEqual(results.map((result) => result.status), ['fulfilled', 'fulfilled']);
	assert.equal((await f.db.select().from(schema.riotAccounts)).length, 1);
	assert.equal((await f.db.select().from(schema.guildRiotAccounts)).length, 1);
	assert.equal((await f.db.select().from(schema.guildRiotAccounts))[0]!.isPrimary, true);
});

test('서로 다른 대표 지정이 겹쳐도 서버·사용자별 대표는 하나다', async (t) => {
	const f = await createAccessFixture(t);
	const first = await f.seedAccount();
	const second = await f.seedAccount(f.ids.guild, f.member.userId, false);
	let release!: () => void;
	const start = new Promise<void>((resolve) => { release = resolve; });
	const requests = [first.id, second.id].map(async (accountId) => {
		await start;
		await setPrimaryRiotAccount(f.db, f.owner, f.ids.guild, f.member.userId, accountId, f.dependencies);
	});
	release();
	const results = await Promise.allSettled(requests);
	assert.deepEqual(results.map((result) => result.status), ['fulfilled', 'fulfilled']);
	const primary = await f.db.select().from(schema.guildRiotAccounts).where(and(eq(schema.guildRiotAccounts.guildId, f.ids.guild), eq(schema.guildRiotAccounts.isPrimary, true)));
	assert.equal(primary.length, 1);
	assert.ok([first.id, second.id].includes(primary[0]!.riotAccountId));
});
