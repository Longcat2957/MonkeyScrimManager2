import { and, asc, count, desc, eq, ilike, inArray, isNull, sql } from 'drizzle-orm';
import type { GuildRiotAccounts, RiotAccount, RiotLookup } from '../../features/me/types.ts';
import { parseRiotId, RIOT_ID_FORMAT_ERROR } from '../../features/me/riot-id.ts';
import { requireUser } from '../auth/guards.ts';
import type { Actor } from '../auth/types.ts';
import type { Database, Transaction } from '../db/types.ts';
import {
    guildDiscordSettings,
    guildMembers,
    guildRiotAccounts,
    guilds,
    riotAccounts,
    scrimParticipantRegistrations,
    scrimParticipants,
    scrims,
    users
} from '../db/schema.ts';
import type { DiscordClient } from '../discord/client.ts';
import { DomainError } from '../errors.ts';
import { assertGuildAccess, requireGuildAdmin } from '../guild/access.ts';
import { RiotError } from '../riot/errors.ts';
import { PLATFORM_ROUTINGS } from '../riot/transport.ts';

export type AccountDependencies = {
    discord?: DiscordClient;
    riot?: Pick<typeof import('../riot/account.ts'), 'getAccountByRiotId' | 'getActiveRegion'>;
};
export const ACTIVE_SCRIM_STATUSES = ['recruit', 'preparing', 'ready', 'in_progress'] as const;
const lookupWindows = new Map<string, { expiresAt: number; attempts: number }>();

function reserveLookup(userId: string) {
    const now = Date.now();
    for (const [id, window] of lookupWindows) if (window.expiresAt <= now) lookupWindows.delete(id);
    let window = lookupWindows.get(userId);
    if (!window) {
        if (lookupWindows.size >= 10_000)
            throw new RiotError('BUSY', '계정 조회가 많아요. 잠시 후 다시 시도해 주세요');
        window = { expiresAt: now + 60_000, attempts: 0 };
        lookupWindows.set(userId, window);
    }
    if (window.attempts >= 10)
        throw new RiotError('RATE_LIMITED', '계정 조회가 많아요. 잠시 후 다시 시도해 주세요', {
            retryAfterSeconds: Math.ceil((window.expiresAt - now) / 1_000)
        });
    window.attempts += 1;
}

/** 조회 확인값을 신뢰하지 않고 연결할 때도 같은 Riot 조회를 다시 실행한다. */
export async function resolveRiotAccount(
    actor: Actor,
    riotId: string,
    dependencies: AccountDependencies = {}
): Promise<RiotLookup> {
    const parsed = parseRiotId(riotId);
    if (!parsed)
        throw new DomainError('INVALID_INPUT', RIOT_ID_FORMAT_ERROR, { riotId: RIOT_ID_FORMAT_ERROR });
    reserveLookup(actor.userId);
    const riot = dependencies.riot ?? (await import('../riot/account.ts'));
    const account = await riot.getAccountByRiotId(parsed);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(account.puuid))
        throw new RiotError('INVALID_RESPONSE', 'Riot 계정 식별자를 확인할 수 없어요');
    const gameName = account.gameName ?? parsed.gameName;
    const tagLine = account.tagLine ?? parsed.tagLine;
    if (!parseRiotId(`${gameName}#${tagLine}`))
        throw new RiotError('INVALID_RESPONSE', 'Riot 계정 이름을 확인할 수 없어요');
    const active = await riot.getActiveRegion(account.puuid);
    const platform = active.region.toLowerCase();
    if (
        active.puuid !== account.puuid ||
        active.game !== 'lol' ||
        !PLATFORM_ROUTINGS.includes(platform as (typeof PLATFORM_ROUTINGS)[number])
    ) {
        throw new RiotError('INVALID_RESPONSE', 'Riot 계정의 LoL 지역을 확인할 수 없어요');
    }
    return { puuid: account.puuid, gameName, tagLine, region: platform.toUpperCase() };
}

export async function lookupRiotAccount(
    db: Database,
    actor: Actor | null,
    guildId: string,
    riotId: string,
    dependencies: AccountDependencies = {}
): Promise<RiotLookup> {
    const user = requireUser(actor);
    await requireGuildAdmin(user, guildId, { db, discord: dependencies.discord });
    const lookup = await resolveRiotAccount(user, riotId, dependencies);
    const [connected] = await db
        .select({ id: riotAccounts.id })
        .from(riotAccounts)
        .innerJoin(guildRiotAccounts, eq(guildRiotAccounts.riotAccountId, riotAccounts.id))
        .where(and(eq(riotAccounts.puuid, lookup.puuid), eq(guildRiotAccounts.guildId, guildId)))
        .limit(1);
    if (connected) throw new DomainError('CONFLICT', '이 서버에서 이미 사용자에게 연결된 계정이에요');
    return lookup;
}

async function readAccounts(db: Database | Transaction, userIds: string[], guildId?: string) {
    if (!userIds.length) return [];
    const rows = await db
        .select({
            id: riotAccounts.id,
            gameName: riotAccounts.gameName,
            tagLine: riotAccounts.tagLine,
            platform: riotAccounts.platform,
            userId: guildRiotAccounts.userId,
            isPrimary: guildRiotAccounts.isPrimary,
            guildId: guilds.id,
            guildName: guilds.name
        })
        .from(guildRiotAccounts)
        .innerJoin(riotAccounts, eq(riotAccounts.id, guildRiotAccounts.riotAccountId))
        .innerJoin(guilds, eq(guilds.id, guildRiotAccounts.guildId))
        .where(
            and(
                inArray(guildRiotAccounts.userId, userIds),
                guildId ? eq(guildRiotAccounts.guildId, guildId) : undefined
            )
        )
        .orderBy(
            asc(guilds.name),
            asc(guilds.id),
            desc(guildRiotAccounts.isPrimary),
            asc(guildRiotAccounts.linkedAt),
            asc(riotAccounts.id)
        )
        .limit(4_001);
    if (rows.length > 4_000)
        throw new DomainError('SERVICE_UNAVAILABLE', '연결 계정이 많아 목록을 불러오지 못했어요');
    const active = rows.length
        ? await db
              .selectDistinct({ id: scrimParticipants.riotAccountId, guildId: scrims.guildId })
              .from(scrimParticipants)
              .innerJoin(scrims, eq(scrims.id, scrimParticipants.scrimId))
              .innerJoin(
                  scrimParticipantRegistrations,
                  eq(scrimParticipantRegistrations.scrimParticipantId, scrimParticipants.id)
              )
              .where(
                  and(
                      inArray(
                          scrimParticipants.riotAccountId,
                          rows.map((row) => row.id)
                      ),
                      inArray(scrims.guildId, [...new Set(rows.map((row) => row.guildId))]),
                      inArray(scrims.status, [...ACTIVE_SCRIM_STATUSES]),
                      isNull(scrimParticipantRegistrations.withdrawnAt)
                  )
              )
        : [];
    const activeIds = new Set(active.map((row) => `${row.guildId}:${row.id}`));
    return rows.map((row) => ({
        guildId: row.guildId,
        guildName: row.guildName,
        userId: row.userId,
        account: {
            id: row.id,
            gameName: row.gameName ?? '이름 미확인',
            tagLine: row.tagLine ?? '—',
            region: row.platform?.toUpperCase() ?? '미확인',
            isPrimary: row.isPrimary,
            inActiveScrim: activeIds.has(`${row.guildId}:${row.id}`)
        } satisfies RiotAccount
    }));
}

export async function listMyRiotAccounts(db: Database, actor: Actor | null): Promise<GuildRiotAccounts[]> {
    const user = requireUser(actor);
    return db.transaction(
        async (tx) => {
            const groups = new Map<string, GuildRiotAccounts>();
            for (const row of await readAccounts(tx, [user.userId])) {
                const group = groups.get(row.guildId) ?? {
                    guildId: row.guildId,
                    guildName: row.guildName,
                    riotAccounts: []
                };
                group.riotAccounts.push(row.account);
                groups.set(row.guildId, group);
            }
            return [...groups.values()];
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' }
    );
}

export async function listGuildMembers(
    db: Database,
    actor: Actor | null,
    guildId: string,
    options: { q: string; page: number; pageSize: number },
    dependencies: AccountDependencies = {}
) {
    const user = requireUser(actor);
    await requireGuildAdmin(user, guildId, { db, discord: dependencies.discord });
    if (
        !Number.isSafeInteger(options.page) ||
        options.page < 1 ||
        options.page > 10_000 ||
        options.pageSize !== 20
    ) {
        throw new DomainError('INVALID_INPUT', '페이지를 다시 확인해 주세요');
    }
    const q = options.q.trim().slice(0, 50);
    return db.transaction(
        async (tx) => {
            await assertGuildAccess(tx, user, guildId, true);
            const displayName = sql<string>`coalesce(${users.globalName}, ${users.username})`;
            const isAdmin = sql<boolean>`(${guildMembers.manageGuild} or (${guildDiscordSettings.operatorRoleId} is not null and ${guildDiscordSettings.operatorRoleId} <> ${guildMembers.guildId} and ${guildDiscordSettings.operatorRoleId} = any(${guildMembers.roleIds})))`;
            const where = and(
                eq(guildMembers.guildId, guildId),
                q ? ilike(displayName, `%${q.replace(/[\\%_]/g, '\\$&')}%`) : undefined
            );
            const members = await tx
                .select({ userId: users.id, displayName, isAdmin })
                .from(guildMembers)
                .innerJoin(users, eq(users.id, guildMembers.userId))
                .leftJoin(guildDiscordSettings, eq(guildDiscordSettings.guildId, guildMembers.guildId))
                .where(where)
                .orderBy(desc(isAdmin), asc(displayName), asc(users.id))
                .limit(20)
                .offset((options.page - 1) * 20);
            const [total] = await tx
                .select({ count: count() })
                .from(guildMembers)
                .innerJoin(users, eq(users.id, guildMembers.userId))
                .where(where);
            const [admins] = await tx
                .select({ count: count() })
                .from(guildMembers)
                .leftJoin(guildDiscordSettings, eq(guildDiscordSettings.guildId, guildMembers.guildId))
                .where(and(eq(guildMembers.guildId, guildId), isAdmin));
            const accounts = await readAccounts(
                tx,
                members.map((member) => member.userId),
                guildId
            );
            return {
                members: members.map((member) => ({
                    ...member,
                    riotAccounts: accounts
                        .filter((row) => row.userId === member.userId)
                        .map((row) => row.account)
                })),
                total: total!.count,
                adminCount: admins!.count
            };
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' }
    );
}
