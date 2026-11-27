import { and, count, desc, eq, gte, lt, sql } from 'drizzle-orm';
import type { Actor } from '../auth/types.ts';
import { guilds, webRequestErrors } from '../db/schema.ts';
import type { Database } from '../db/types.ts';
import { DomainError } from '../errors.ts';
import { noteRequestError } from '../operations/errors.ts';
import { assertGuildAccess, requireGuildAdmin } from './access.ts';

const cutoff = sql`now() - interval '30 days'`;

export function storeRequestError(db: Database, entry: typeof webRequestErrors.$inferInsert) {
    // 두 훅의 호출 순서와 무관하게 확인된 길드와 Kit 예외의 상태·종류를 보존한다.
    return db
        .insert(webRequestErrors)
        .values({
            ...entry,
            // Discord에서 확인한 직후 길드가 삭제된 경우에도 요청 자체는 보존한다.
            guildId: entry.guildId
                ? sql`(select ${guilds.id} from ${guilds} where ${guilds.id} = ${entry.guildId})`
                : null
        })
        .onConflictDoUpdate({
            target: webRequestErrors.requestId,
            set: {
                guildId: sql`coalesce(${webRequestErrors.guildId}, excluded.guild_id)`,
                status: sql`case when ${webRequestErrors.kind} is null and excluded.kind is not null then excluded.status else ${webRequestErrors.status} end`,
                kind: sql`coalesce(${webRequestErrors.kind}, excluded.kind)`
            }
        });
}

export function deleteExpiredRequestErrors(db: Database) {
    return db.delete(webRequestErrors).where(lt(webRequestErrors.occurredAt, cutoff));
}

export async function listGuildRequestErrors(
    db: Database,
    actor: Actor | null,
    guildId: string,
    page: number,
    pageSize: number
) {
    await requireGuildAdmin(actor, guildId, { db });
    try {
        return await db.transaction(
            async (tx) => {
                await assertGuildAccess(tx, actor, guildId, true);
                const where = and(
                    eq(webRequestErrors.guildId, guildId),
                    gte(webRequestErrors.occurredAt, cutoff)
                );
                const [{ total }] = await tx.select({ total: count() }).from(webRequestErrors).where(where);
                const entries = await tx
                    .select({
                        requestId: webRequestErrors.requestId,
                        occurredAt: webRequestErrors.occurredAt,
                        method: webRequestErrors.method,
                        route: webRequestErrors.route,
                        status: webRequestErrors.status,
                        kind: webRequestErrors.kind
                    })
                    .from(webRequestErrors)
                    .where(where)
                    .orderBy(desc(webRequestErrors.occurredAt), desc(webRequestErrors.requestId))
                    .limit(pageSize)
                    .offset((page - 1) * pageSize);
                return { total, entries };
            },
            { isolationLevel: 'repeatable read', accessMode: 'read only' }
        );
    } catch (cause) {
        if (cause instanceof DomainError) throw cause;
        noteRequestError(cause);
        return null;
    }
}
