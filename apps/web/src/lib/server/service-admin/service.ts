import { asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { ServiceAdminOverview, ServiceAdminUser } from '../../features/service-admin.ts';
import { requireUser } from '../auth/guards.ts';
import type { Actor } from '../auth/types.ts';
import { serviceAdminEvents, users } from '../db/schema.ts';
import type { Database, Transaction } from '../db/types.ts';
import { isDiscordId } from '../discord/client.ts';
import { DomainError } from '../errors.ts';

/** 운영자 변경·최초 지정은 같은 잠금을 먼저 잡아 마지막 운영자를 함께 잃지 않게 한다. */
export async function lockServiceAdminChanges(tx: Transaction): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(779002, 1)`);
}

function userId(value: string): string {
    if (!isDiscordId(value)) throw new DomainError('INVALID_INPUT', 'Discord 사용자 ID를 확인해 주세요');
    return value;
}

function validatePage(options: { page: number; pageSize: number }) {
    if (
        !Number.isSafeInteger(options.page) ||
        options.page < 1 ||
        options.page > 100_000 ||
        !Number.isSafeInteger(options.pageSize) ||
        options.pageSize < 1 ||
        options.pageSize > 100
    )
        throw new DomainError('INVALID_INPUT', '기록 조회 범위를 다시 확인해 주세요');
}

function assertCurrentAdmin(row: { isServiceAdmin: boolean } | undefined): void {
    if (!row) throw new DomainError('UNAUTHENTICATED', '다시 로그인해 주세요');
    if (!row.isServiceAdmin) throw new DomainError('FORBIDDEN', '서비스를 관리할 권한이 없어요');
}

const eventActor = alias(users, 'service_admin_event_actor');
const eventTarget = alias(users, 'service_admin_event_target');

function identity(
    id: string | null,
    profile: { username: string; globalName: string | null } | null
): ServiceAdminUser {
    return { userId: id, displayName: profile?.globalName || profile?.username || '삭제된 사용자' };
}

export async function getServiceAdminOverview(
    db: Database,
    actor: Actor | null,
    options: { page: number; pageSize: number }
): Promise<ServiceAdminOverview> {
    const user = requireUser(actor);
    userId(user.userId);
    validatePage(options);
    return db.transaction(async (tx) => {
        // 세션의 이전 boolean 대신 현재 DB 권한을 확인하고 읽기가 끝날 때까지 회수를 기다리게 한다.
        const [current] = await tx
            .select({ isServiceAdmin: users.isServiceAdmin })
            .from(users)
            .where(eq(users.id, user.userId))
            .for('share');
        assertCurrentAdmin(current);
        const admins = await tx
            .select({ id: users.id, username: users.username, globalName: users.globalName })
            .from(users)
            .where(eq(users.isServiceAdmin, true))
            .orderBy(asc(users.createdAt), asc(users.id));
        const rows = await tx
            .select({
                event: serviceAdminEvents,
                actor: { username: eventActor.username, globalName: eventActor.globalName },
                target: { username: eventTarget.username, globalName: eventTarget.globalName }
            })
            .from(serviceAdminEvents)
            .leftJoin(eventActor, eq(eventActor.id, serviceAdminEvents.actorUserId))
            .leftJoin(eventTarget, eq(eventTarget.id, serviceAdminEvents.targetUserId))
            .orderBy(desc(serviceAdminEvents.createdAt), desc(serviceAdminEvents.id))
            .limit(options.pageSize)
            .offset((options.page - 1) * options.pageSize);
        const [total] = await tx.select({ value: count() }).from(serviceAdminEvents);
        return {
            admins: admins.map((row) => identity(row.id, row)),
            entries: rows.map(({ event, actor, target }) => ({
                id: event.id,
                occurredAt: event.createdAt.toISOString(),
                kind: event.kind,
                source: event.source,
                actor: event.source === 'bootstrap' ? null : identity(event.actorUserId, actor),
                target: identity(event.targetUserId, target)
            })),
            total: total.value
        };
    });
}

export async function setServiceAdmin(
    db: Database,
    actor: Actor | null,
    targetUserId: string,
    enabled: boolean
): Promise<{ changed: boolean; selfRevoked: boolean }> {
    const user = requireUser(actor);
    userId(user.userId);
    userId(targetUserId);
    if (typeof enabled !== 'boolean')
        throw new DomainError('INVALID_INPUT', '운영자 지정 또는 해제를 선택해 주세요');
    return db.transaction(async (tx) => {
        await lockServiceAdminChanges(tx);
        // 계정 관리와 같은 사용자 ID 순서로 잠가 서로 다른 업무 사이 교차 잠금을 피한다.
        const locked = await tx
            .select({ id: users.id, isServiceAdmin: users.isServiceAdmin })
            .from(users)
            .where(inArray(users.id, [...new Set([user.userId, targetUserId])].sort()))
            .orderBy(asc(users.id))
            .for('no key update');
        assertCurrentAdmin(locked.find((row) => row.id === user.userId));
        const target = locked.find((row) => row.id === targetUserId);
        if (!target) throw new DomainError('NOT_FOUND', '서비스에 연결된 사용자를 찾을 수 없어요');
        if (target.isServiceAdmin === enabled) return { changed: false, selfRevoked: false };
        if (!enabled) {
            const [remaining] = await tx
                .select({ value: count() })
                .from(users)
                .where(eq(users.isServiceAdmin, true));
            if (remaining.value <= 1)
                throw new DomainError('CONFLICT', '마지막 서비스 운영자는 권한을 해제할 수 없어요');
        }
        await tx.update(users).set({ isServiceAdmin: enabled }).where(eq(users.id, targetUserId));
        await tx.insert(serviceAdminEvents).values({
            actorUserId: user.userId,
            targetUserId,
            kind: enabled ? 'granted' : 'revoked',
            source: 'web'
        });
        return { changed: true, selfRevoked: !enabled && targetUserId === user.userId };
    });
}

/** 서버의 명시적 초기 지정 CLI만 호출한다. 기존 운영자가 있으면 재사용하지 않는다. */
export async function bootstrapServiceAdmin(db: Database, targetUserId: string): Promise<void> {
    userId(targetUserId);
    await db.transaction(async (tx) => {
        await lockServiceAdminChanges(tx);
        const [existing] = await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.isServiceAdmin, true))
            .limit(1);
        if (existing)
            throw new DomainError('CONFLICT', '이미 서비스 운영자가 있어요. 백오피스에서 관리해 주세요');
        const [target] = await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, targetUserId))
            .for('no key update');
        if (!target) throw new DomainError('NOT_FOUND', '서비스에 연결된 사용자를 찾을 수 없어요');
        await tx.update(users).set({ isServiceAdmin: true }).where(eq(users.id, target.id));
        await tx.insert(serviceAdminEvents).values({ targetUserId, kind: 'granted', source: 'bootstrap' });
    });
}
