import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { listGuildMembers, listMyRiotAccounts, lookupRiotAccount, type AccountDependencies } from '../src/lib/server/accounts/queries.ts';
import { linkRiotAccount, setPrimaryRiotAccount, unlinkRiotAccount } from '../src/lib/server/accounts/service.ts';
import type { Database } from '../src/lib/server/db/types.ts';
import * as schema from '../src/lib/server/db/schema.ts';
import type { DiscordClient } from '../src/lib/server/discord/client.ts';
import { DomainError } from '../src/lib/server/errors.ts';

test('실제 PostgreSQL에서 서버별 계정 연결·대표·활성 신청·동시 변경을 검증한다', async (t) => {
	const connectionString = process.env.DATABASE_URL?.trim();
	assert.ok(connectionString, '계정 통합 테스트에는 DATABASE_URL이 필요합니다.');
	const schemaName = `msm2_accounts_${randomUUID().replaceAll('-', '')}`;
	const pool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 10_000, options: `-c search_path=${schemaName}` });
	const db = drizzle({ client: pool, schema }) as Database;
	const guildId = '123456789012345678';
	const otherGuildId = '123456789012345679';
	const adminId = '223456789012345678';
	const targetId = '323456789012345678';
	const otherId = '423456789012345678';
	const actor = { userId: adminId, isServiceAdmin: false };
	const target = { userId: targetId, isServiceAdmin: false };
	const discord: DiscordClient = {
		listGuilds: async () => [{ id: guildId, name: '서버', iconHash: null }],
		getGuild: async (id) => ({ id, name: id === guildId ? '서버' : '다른 서버', iconHash: null, ownerId: adminId, roles: [{ id, permissions: 0n }] }),
		getMember: async (_guildId, id) => [adminId, targetId, otherId].includes(id)
			? { user: { id, username: id === adminId ? '운영자' : id === targetId ? '대상 멤버' : '다른 멤버', globalName: null, avatarHash: null }, roleIds: [] } : null
	};
	const dependencies: AccountDependencies = { discord, riot: {
		getAccountByRiotId: async ({ gameName, tagLine }) => ({ puuid: `verified-${gameName}`, gameName, tagLine }),
		getActiveRegion: async (puuid) => ({ puuid, game: 'lol', region: 'kr' })
	} };
	const expectStatus = (status: number) => (error: unknown) => error instanceof DomainError && error.status === status;
	const myAccounts = async () => (await listMyRiotAccounts(db, target)).find((group) => group.guildId === guildId)?.riotAccounts ?? [];
	const linkWhere = (accountId: string, targetGuild = guildId) => and(eq(schema.guildRiotAccounts.guildId, targetGuild), eq(schema.guildRiotAccounts.riotAccountId, accountId));
	let created = false;
	try {
		try { await pool.query('SELECT 1'); } catch { throw new Error('계정 통합 테스트용 PostgreSQL 연결에 실패했습니다.'); }
		await pool.query(`CREATE SCHEMA "${schemaName}"`);
		created = true;
		const directory = new URL('../drizzle/', import.meta.url);
		const files = (await readdir(directory)).filter((name) => /^\d+_initial_schema\.sql$/.test(name));
		assert.equal(files.length, 1);
		const migration = await readFile(new URL(files[0], directory), 'utf8');
		await pool.query(migration.replaceAll('"public".', `"${schemaName}".`).replace(/\bpublic\./g, `"${schemaName}".`));
		await db.insert(schema.users).values([adminId, targetId, otherId].map((id) => ({ id, username: id })));
		await db.insert(schema.guilds).values([{ id: guildId, name: '관리 서버' }, { id: otherGuildId, name: '다른 서버' }]);
		let firstId = '';
		let secondId = '';
		await t.test('첫 연결이 서버별 대표가 되고 재요청으로 계정이나 연결을 중복 생성하지 않는다', async () => {
			await linkRiotAccount(db, actor, guildId, targetId, 'AccountOne#KR1', dependencies);
			await linkRiotAccount(db, actor, guildId, targetId, 'AccountOne#KR1', dependencies);
			await linkRiotAccount(db, actor, guildId, targetId, 'AccountTwo#KR1', dependencies);
			const accounts = await myAccounts();
			assert.equal(accounts.length, 2);
			assert.deepEqual(accounts.map((account) => account.isPrimary), [true, false]);
			assert.equal(accounts[0].region, 'KR');
			firstId = accounts[0].id;
			secondId = accounts[1].id;
			const [link] = await db.select().from(schema.guildRiotAccounts).where(linkWhere(firstId));
			assert.equal(link.linkedByUserId, adminId);
			assert.ok(link.linkedAt);
		});
		await t.test('대표 변경은 서버 안에서 원자적으로 하나만 남기며 다른 멤버 계정은 거부한다', async () => {
			await setPrimaryRiotAccount(db, actor, guildId, targetId, secondId, dependencies);
			assert.equal((await myAccounts())[0].id, secondId);
			await assert.rejects(setPrimaryRiotAccount(db, actor, guildId, otherId, firstId, dependencies), expectStatus(404));
			await Promise.all([
				setPrimaryRiotAccount(db, actor, guildId, targetId, firstId, dependencies),
				setPrimaryRiotAccount(db, actor, guildId, targetId, secondId, dependencies)
			]);
			assert.equal((await myAccounts()).filter((account) => account.isPrimary).length, 1);
		});
		await t.test('같은 서버의 기존 연결을 탈취하거나 같은 PUUID를 두 사용자에게 연결하지 못한다', async () => {
			await assert.rejects(lookupRiotAccount(db, actor, guildId, 'AccountOne#KR1', dependencies), expectStatus(409));
			await assert.rejects(linkRiotAccount(db, actor, guildId, otherId, 'AccountOne#KR1', dependencies), expectStatus(409));
			const attempts = await Promise.allSettled([
				linkRiotAccount(db, actor, guildId, targetId, 'RaceAccount#KR1', dependencies),
				linkRiotAccount(db, actor, guildId, otherId, 'RaceAccount#KR1', dependencies)
			]);
			assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1);
			assert.ok(expectStatus(409)((attempts.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason));
			assert.equal((await db.select().from(schema.riotAccounts).where(eq(schema.riotAccounts.puuid, 'verified-RaceAccount'))).length, 1);
		});
		await t.test('다른 서버는 같은 Riot 계정을 다른 멤버에게 독립적으로 연결할 수 있다', async () => {
			assert.equal((await lookupRiotAccount(db, actor, otherGuildId, 'AccountOne#KR1', dependencies)).puuid, 'verified-AccountOne');
			await linkRiotAccount(db, actor, otherGuildId, otherId, 'AccountOne#KR1', dependencies);
			const links = await db.select().from(schema.guildRiotAccounts).where(eq(schema.guildRiotAccounts.riotAccountId, firstId));
			assert.equal(links.length, 2);
			assert.equal(links.find((link) => link.guildId === guildId)!.userId, targetId);
			assert.equal(links.find((link) => link.guildId === otherGuildId)!.userId, otherId);
			assert.equal(links.find((link) => link.guildId === otherGuildId)!.isPrimary, true);
		});
		await t.test('다른 서버의 활성 신청은 현재 서버의 해제를 막거나 함께 삭제되지 않는다', async () => {
			const [scrim] = await db.insert(schema.scrims).values({ guildId: otherGuildId, title: '다른 서버의 내전' }).returning();
			const [participant] = await db.insert(schema.scrimParticipants).values({ scrimId: scrim.id, userId: otherId, riotAccountId: firstId, displayName: '다른 서버 참가자' }).returning();
			await db.insert(schema.scrimParticipantRegistrations).values({ scrimParticipantId: participant.id, status: 'selected', joinedByUserId: otherId });
			assert.equal((await myAccounts()).find((account) => account.id === firstId)!.inActiveScrim, false);
			await unlinkRiotAccount(db, actor, guildId, targetId, firstId, dependencies);
			assert.equal((await db.select().from(schema.guildRiotAccounts).where(linkWhere(firstId))).length, 0);
			assert.equal((await db.select().from(schema.guildRiotAccounts).where(linkWhere(firstId, otherGuildId))).length, 1);
			assert.ok(await db.query.riotAccounts.findFirst({ where: eq(schema.riotAccounts.id, firstId) }));
			assert.equal((await db.query.scrimParticipants.findFirst({ where: eq(schema.scrimParticipants.id, participant.id) }))!.riotAccountId, firstId);
		});
		await t.test('현재 서버의 활성 신청은 해제를 막고 철회 뒤에는 과거 참가자 연결을 보존한다', async () => {
			const [scrim] = await db.insert(schema.scrims).values({ guildId, title: '현재 서버의 내전' }).returning();
			const [participant] = await db.insert(schema.scrimParticipants).values({ scrimId: scrim.id, userId: targetId, riotAccountId: secondId, displayName: '현재 참가자' }).returning();
			await db.insert(schema.scrimParticipantRegistrations).values({ scrimParticipantId: participant.id, status: 'selected', joinedByUserId: targetId });
			assert.equal((await myAccounts()).find((account) => account.id === secondId)!.inActiveScrim, true);
			await assert.rejects(unlinkRiotAccount(db, actor, guildId, targetId, secondId, dependencies), expectStatus(409));
			await db.update(schema.scrimParticipantRegistrations).set({ status: 'withdrawn', withdrawnAt: new Date(), withdrawnByUserId: targetId })
				.where(and(eq(schema.scrimParticipantRegistrations.scrimParticipantId, participant.id), isNull(schema.scrimParticipantRegistrations.withdrawnAt)));
			const replacementIds = [randomUUID(), randomUUID()].sort();
			await db.insert(schema.riotAccounts).values(replacementIds.map((id) => ({ id, puuid: `replacement-${id}` })));
			await db.insert(schema.guildRiotAccounts).values(replacementIds.map((riotAccountId) => ({ guildId, riotAccountId, userId: targetId, linkedAt: new Date('2020-01-01T00:00:00Z') })));
			await setPrimaryRiotAccount(db, actor, guildId, targetId, secondId, dependencies);
			await unlinkRiotAccount(db, actor, guildId, targetId, secondId, dependencies);
			assert.equal((await myAccounts())[0].id, replacementIds[0]);
			assert.equal((await db.select().from(schema.guildRiotAccounts).where(linkWhere(secondId))).length, 0);
			assert.equal((await db.query.scrimParticipants.findFirst({ where: eq(schema.scrimParticipants.id, participant.id) }))!.riotAccountId, secondId);
		});
		await t.test('개인 계정은 서버별로 묶고 관리자 목록은 해당 서버 연결만 표시한다', async () => {
			await db.insert(schema.guildRiotAccounts).values({ guildId: otherGuildId, riotAccountId: secondId, userId: targetId, isPrimary: true });
			const groups = await listMyRiotAccounts(db, target);
			assert.deepEqual(new Set(groups.map((group) => group.guildId)), new Set([guildId, otherGuildId]));
			assert.equal(groups.find((group) => group.guildId === otherGuildId)!.riotAccounts[0].id, secondId);
			const list = await listGuildMembers(db, actor, guildId, { q: '대상', page: 1, pageSize: 20 }, dependencies);
			assert.equal(list.total, 1);
			assert.equal(list.members[0].userId, targetId);
			assert.ok(list.members[0].riotAccounts.every((account) => account.id !== secondId));
			assert.equal(list.adminCount, 1);
			await assert.rejects(listGuildMembers(db, { userId: otherId, isServiceAdmin: true }, guildId, { q: '', page: 1, pageSize: 20 }, dependencies), expectStatus(403));
			await assert.rejects(listMyRiotAccounts(db, null), expectStatus(401));
		});
	} finally {
		if (created) await pool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
		await pool.end();
	}
});
