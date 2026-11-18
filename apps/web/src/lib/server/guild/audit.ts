import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
    guildAuditKinds,
    type GuildAuditEntry,
    type GuildAuditKind,
    type GuildAuditPage
} from '../../features/guild/audit.ts';
import type { GuildDiscordSettingKey } from '../../features/guild/types.ts';
import { requireUser } from '../auth/guards.ts';
import type { Actor } from '../auth/types.ts';
import { guildAuditEntries, riotAccounts, users } from '../db/schema.ts';
import type { Database, Transaction } from '../db/types.ts';
import { DomainError } from '../errors.ts';
import { assertGuildAccess, requireGuildAdmin, type GuildAccessDependencies } from './access.ts';

type AuditWrite = {
    guildId: string;
    actorUserId: string;
} & (
    | {
          kind: Extract<GuildAuditKind, `riot_account_${string}`>;
          targetUserId: string;
          riotAccountId: string;
          previousPrimaryAccountId: string | null;
          nextPrimaryAccountId: string | null;
      }
    | {
          kind: 'discord_setting_changed';
          key: GuildDiscordSettingKey;
          before: { id: string; name: string | null } | null;
          after: { id: string; name: string | null } | null;
      }
);

/** 호출자의 업무 트랜잭션에서 성공한 변경과 감사 기록을 함께 저장한다. */
export async function writeGuildAudit(tx: Transaction, input: AuditWrite): Promise<void> {
    const identity = { guildId: input.guildId, actorUserId: input.actorUserId, kind: input.kind };
    await tx.insert(guildAuditEntries).values(
        input.kind === 'discord_setting_changed'
            ? {
                  ...identity,
                  settingKey: input.key,
                  previousSettingId: input.before?.id ?? null,
                  previousSettingName: input.before?.name ?? null,
                  nextSettingId: input.after?.id ?? null,
                  nextSettingName: input.after?.name ?? null
              }
            : {
                  ...identity,
                  targetUserId: input.targetUserId,
                  riotAccountId: input.riotAccountId,
                  previousPrimaryAccountId: input.previousPrimaryAccountId,
                  nextPrimaryAccountId: input.nextPrimaryAccountId,
                  previousPrimaryWasSet: input.previousPrimaryAccountId !== null,
                  nextPrimaryWasSet: input.nextPrimaryAccountId !== null
              }
    );
}

const actorUser = alias(users, 'audit_actor');
const targetUser = alias(users, 'audit_target');
const account = alias(riotAccounts, 'audit_account');
const previousPrimary = alias(riotAccounts, 'audit_previous_primary');
const nextPrimary = alias(riotAccounts, 'audit_next_primary');

function riotId(value: { gameName: string | null; tagLine: string | null } | null): string | null {
    if (!value?.gameName) return null;
    return value.tagLine ? `${value.gameName}#${value.tagLine}` : value.gameName;
}

export async function listGuildAudit(
    db: Database,
    actor: Actor | null,
    guildId: string,
    options: { page: number; pageSize: number },
    access: Partial<GuildAccessDependencies> = {}
): Promise<GuildAuditPage> {
    const user = requireUser(actor);
    await requireGuildAdmin(user, guildId, { ...access, db });
    if (
        !Number.isSafeInteger(options.page) ||
        options.page < 1 ||
        options.page > 100_000 ||
        !Number.isSafeInteger(options.pageSize) ||
        options.pageSize < 1 ||
        options.pageSize > 100
    )
        throw new DomainError('INVALID_INPUT', '기록 조회 범위를 다시 확인해 주세요');
    return db.transaction(async (tx) => {
        // 상위 화면의 표시 권한만 믿지 않고 실제 조회에서도 현재 권한을 검사한다.
        await assertGuildAccess(tx, user, guildId, true);
        const where = and(
            eq(guildAuditEntries.guildId, guildId),
            inArray(guildAuditEntries.kind, guildAuditKinds)
        );
        const rows = await tx
            .select({
                event: guildAuditEntries,
                actor: { username: actorUser.username, globalName: actorUser.globalName },
                target: { username: targetUser.username, globalName: targetUser.globalName },
                account: { gameName: account.gameName, tagLine: account.tagLine },
                previous: { gameName: previousPrimary.gameName, tagLine: previousPrimary.tagLine },
                next: { gameName: nextPrimary.gameName, tagLine: nextPrimary.tagLine }
            })
            .from(guildAuditEntries)
            .leftJoin(actorUser, eq(actorUser.id, guildAuditEntries.actorUserId))
            .leftJoin(targetUser, eq(targetUser.id, guildAuditEntries.targetUserId))
            .leftJoin(account, eq(account.id, guildAuditEntries.riotAccountId))
            .leftJoin(previousPrimary, eq(previousPrimary.id, guildAuditEntries.previousPrimaryAccountId))
            .leftJoin(nextPrimary, eq(nextPrimary.id, guildAuditEntries.nextPrimaryAccountId))
            .where(where)
            .orderBy(desc(guildAuditEntries.createdAt), desc(guildAuditEntries.id))
            .limit(options.pageSize)
            .offset((options.page - 1) * options.pageSize);
        const [total] = await tx.select({ value: count() }).from(guildAuditEntries).where(where);
        const entries: GuildAuditEntry[] = rows.map(({ event, actor, target, account, previous, next }) => ({
            id: event.id,
            occurredAt: event.createdAt.toISOString(),
            kind: event.kind,
            actor: {
                userId: event.actorUserId,
                displayName: actor?.globalName ?? actor?.username ?? '삭제된 사용자'
            },
            target:
                event.kind === 'discord_setting_changed'
                    ? null
                    : {
                          userId: event.targetUserId,
                          displayName: target?.globalName ?? target?.username ?? '삭제된 사용자'
                      },
            account: !event.kind.startsWith('riot_account_')
                ? null
                : {
                      id: event.riotAccountId,
                      gameName: account?.gameName ?? null,
                      tagLine: account?.tagLine ?? null
                  },
            primary: !event.kind.startsWith('riot_account_')
                ? null
                : {
                      before: event.previousPrimaryWasSet
                          ? { id: event.previousPrimaryAccountId, riotId: riotId(previous) }
                          : null,
                      after: event.nextPrimaryWasSet
                          ? { id: event.nextPrimaryAccountId, riotId: riotId(next) }
                          : null
                  },
            setting: event.settingKey
                ? {
                      key: event.settingKey,
                      before: event.previousSettingId
                          ? { id: event.previousSettingId, name: event.previousSettingName }
                          : null,
                      after: event.nextSettingId
                          ? { id: event.nextSettingId, name: event.nextSettingName }
                          : null
                  }
                : null
        }));
        return { entries, total: total.value };
    });
}
