import { inArray, notInArray } from 'drizzle-orm';
import type { GuildSummary } from '../../features/guild/types.ts';
import type { Actor } from '../auth/types.ts';
import { guilds } from '../db/schema.ts';
import { synchronizeGuildMembership } from '../discord/membership.ts';
import { getGuildAccessDependencies, type GuildAccessDependencies } from './access.ts';

const LIST_CACHE_MS = 30_000;
const MAX_CACHED_USERS = 256;
const lists = new Map<string, { expiresAt: number; result: Promise<GuildSummary[]> }>();

async function loadAccessibleGuilds(actor: Actor, dependencies: GuildAccessDependencies): Promise<GuildSummary[]> {
	const { db, discord } = dependencies;
	const botGuilds = await discord.listGuilds();
	const syncedAt = new Date();
	await db.transaction(async (tx) => {
		if (botGuilds.length > 0) {
			await tx.insert(guilds).values(botGuilds.map((guild) => ({ ...guild, isActive: true, syncedAt }))).onConflictDoNothing();
			await tx.update(guilds).set({ isActive: true, syncedAt }).where(inArray(guilds.id, botGuilds.map((guild) => guild.id)));
		}
		// 목록 전체를 확인한 뒤에만 봇이 나간 길드를 비활성화한다.
		await tx.update(guilds).set({ isActive: false, syncedAt }).where(
			botGuilds.length > 0 ? notInArray(guilds.id, botGuilds.map((guild) => guild.id)) : undefined
		);
	});
	const result: GuildSummary[] = [];
	let cursor = 0;
	let failed = false;
	// 서버당 요청을 순차 수행하며 동시에 실행되는 서버는 네 개로 제한한다.
	const workers = await Promise.allSettled(Array.from({ length: Math.min(4, botGuilds.length) }, async () => {
		try {
			while (!failed && cursor < botGuilds.length) {
				const guild = botGuilds[cursor++];
				const context = await synchronizeGuildMembership(db, discord, actor.userId, guild.id);
				if (context) result.push({ id: context.id, name: context.name });
			}
		} catch (error) {
			failed = true;
			throw error;
		}
	}));
	for (const worker of workers) if (worker.status === 'rejected') throw worker.reason;
	return result.sort((a, b) => a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id));
}

/** 헤더 목록에만 짧은 캐시를 사용한다. 개별 서버 접근과 쓰기 권한은 매번 별도로 확인한다. */
export async function listAccessibleGuilds(actor: Actor | null, dependencies?: GuildAccessDependencies): Promise<GuildSummary[]> {
	if (!actor) return [];
	if (dependencies) return loadAccessibleGuilds(actor, dependencies);
	const cached = lists.get(actor.userId);
	if (cached && cached.expiresAt > Date.now()) return (await cached.result).map((guild) => ({ ...guild }));
	if (lists.size >= MAX_CACHED_USERS) lists.delete(lists.keys().next().value!);
	const entry = {
		expiresAt: Infinity,
		result: getGuildAccessDependencies().then((dependencies) => loadAccessibleGuilds(actor, dependencies))
	};
	lists.set(actor.userId, entry);
	try {
		const guilds = await entry.result;
		entry.expiresAt = Date.now() + LIST_CACHE_MS;
		return guilds.map((guild) => ({ ...guild }));
	} catch (error) {
		if (lists.get(actor.userId) === entry) lists.delete(actor.userId);
		throw error;
	}
}
