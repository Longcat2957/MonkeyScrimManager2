import { and, asc, eq, inArray, isNotNull, isNull, notExists, or, sql } from 'drizzle-orm';
import type { MyPrivacy, PrivacyPreferences } from '../../features/me/privacy.ts';
import { requireUser } from '../auth/guards.ts';
import type { Actor } from '../auth/types.ts';
import {
    guildMembers,
    guildRiotAccounts,
    matchLineupPlayers,
    matchLineups,
    matches,
    riotAccounts,
    scrimParticipantRegistrations,
    scrimParticipants,
    scrims,
    sessions,
    userChampionPreferences,
    users
} from '../db/schema.ts';
import type { Database, Transaction } from '../db/types.ts';
import { DomainError } from '../errors.ts';
import { enqueueKnownPrivacyPublications } from '../discord/publications.ts';
import { lockUserLifecycleChanges } from './lifecycle.ts';
import { ACTIVE_SCRIM_STATUSES } from './queries.ts';

type AccountLink = { guildId: string; riotAccountId: string };
const OPERATOR_BLOCK = '서비스 운영자 권한을 먼저 해제해 주세요';
const ACTIVE_BLOCK = '참가 중인 내전이 있어요. 신청을 철회하거나 내전이 종료된 뒤 다시 시도해 주세요';

function activeUser(row: typeof users.$inferSelect | undefined) {
    if (!row || row.withdrawnAt) throw new DomainError('UNAUTHENTICATED', '다시 로그인해 주세요');
    return row;
}

function participation(userId: string, links: AccountLink[]) {
    return or(
        eq(scrimParticipants.userId, userId),
        ...links.map((link) =>
            and(eq(scrims.guildId, link.guildId), eq(scrimParticipants.riotAccountId, link.riotAccountId))
        )
    );
}

async function activeUse(tx: Transaction, userId: string, links: AccountLink[], lock = false) {
    const registration = tx
        .select({ id: scrims.id })
        .from(scrimParticipants)
        .innerJoin(scrims, eq(scrims.id, scrimParticipants.scrimId))
        .innerJoin(
            scrimParticipantRegistrations,
            eq(scrimParticipantRegistrations.scrimParticipantId, scrimParticipants.id)
        )
        .where(
            and(
                participation(userId, links),
                inArray(scrims.status, [...ACTIVE_SCRIM_STATUSES]),
                isNull(scrimParticipantRegistrations.withdrawnAt)
            )
        )
        .orderBy(asc(scrims.id))
        .limit(1);
    if ((lock ? await registration.for('update', { of: scrims }) : await registration).length) return true;
    // 신청 이력만으로 놓칠 수 있는 확정 출전도 확인한다. 희망 포지션은 출전으로 취급하지 않는다.
    const lineup = tx
        .select({ id: scrims.id })
        .from(matchLineupPlayers)
        .innerJoin(scrimParticipants, eq(scrimParticipants.id, matchLineupPlayers.participantId))
        .innerJoin(matchLineups, eq(matchLineups.id, matchLineupPlayers.lineupId))
        .innerJoin(matches, eq(matches.id, matchLineups.matchId))
        .innerJoin(scrims, eq(scrims.id, matches.scrimId))
        .where(
            and(
                participation(userId, links),
                inArray(scrims.status, [...ACTIVE_SCRIM_STATUSES]),
                inArray(matches.status, ['pending', 'in_progress']),
                isNotNull(matchLineups.confirmedAt)
            )
        )
        .orderBy(asc(scrims.id))
        .limit(1);
    return (lock ? await lineup.for('update', { of: scrims }) : await lineup).length > 0;
}

export async function getMyPrivacy(db: Database, actor: Actor | null): Promise<MyPrivacy> {
    const user = requireUser(actor);
    return db.transaction(async (tx) => {
        const [row] = await tx.select().from(users).where(eq(users.id, user.userId));
        const current = activeUser(row);
        const links = await tx
            .select({ guildId: guildRiotAccounts.guildId, riotAccountId: guildRiotAccounts.riotAccountId })
            .from(guildRiotAccounts)
            .where(eq(guildRiotAccounts.userId, user.userId));
        return {
            publicProfile: current.publicProfile,
            publicRiotIds: current.publicRiotIds,
            withdrawalBlock: current.isServiceAdmin
                ? OPERATOR_BLOCK
                : (await activeUse(tx, user.userId, links))
                  ? ACTIVE_BLOCK
                  : null
        };
    });
}

export async function setMyPrivacy(
    db: Database,
    actor: Actor | null,
    input: PrivacyPreferences
): Promise<void> {
    const user = requireUser(actor);
    if (typeof input?.publicProfile !== 'boolean' || typeof input?.publicRiotIds !== 'boolean')
        throw new DomainError('INVALID_INPUT', '공개 설정을 다시 확인해 주세요');
    await db.transaction(async (tx) => {
        const [row] = await tx.select().from(users).where(eq(users.id, user.userId)).for('no key update');
        const current = activeUser(row);
        if (current.publicProfile === input.publicProfile && current.publicRiotIds === input.publicRiotIds)
            return;
        await tx
            .update(users)
            .set({ publicProfile: input.publicProfile, publicRiotIds: input.publicRiotIds })
            .where(eq(users.id, user.userId));
        await enqueueKnownPrivacyPublications(tx, user.userId);
    });
}

export async function withdrawAccount(
    db: Database,
    actor: Actor | null,
    input: { confirm: boolean }
): Promise<void> {
    const user = requireUser(actor);
    if (input?.confirm !== true) throw new DomainError('INVALID_INPUT', '서비스 탈퇴를 확인해 주세요');
    await db.transaction(async (tx) => {
        await lockUserLifecycleChanges(tx);
        const [row] = await tx.select().from(users).where(eq(users.id, user.userId)).for('no key update');
        if (!row) throw new DomainError('UNAUTHENTICATED', '다시 로그인해 주세요');
        // 같은 세션에서 겹친 탈퇴 요청은 첫 커밋을 되돌리거나 개인정보를 다시 쓰지 않는다.
        if (row.withdrawnAt) return;
        if (row.isServiceAdmin) throw new DomainError('CONFLICT', OPERATOR_BLOCK);
        const links = await tx
            .select({ guildId: guildRiotAccounts.guildId, riotAccountId: guildRiotAccounts.riotAccountId })
            .from(guildRiotAccounts)
            .where(eq(guildRiotAccounts.userId, user.userId));
        const ids = [...new Set(links.map((link) => link.riotAccountId))].sort();
        if (ids.length)
            await tx
                .select({ id: riotAccounts.id })
                .from(riotAccounts)
                .where(inArray(riotAccounts.id, ids))
                .orderBy(asc(riotAccounts.id))
                .for('no key update');
        if (await activeUse(tx, user.userId, links, true)) throw new DomainError('CONFLICT', ACTIVE_BLOCK);
        await tx.delete(sessions).where(eq(sessions.userId, user.userId));
        await tx.delete(guildRiotAccounts).where(eq(guildRiotAccounts.userId, user.userId));
        await tx.delete(guildMembers).where(eq(guildMembers.userId, user.userId));
        await tx.delete(userChampionPreferences).where(eq(userChampionPreferences.userId, user.userId));
        if (ids.length)
            await tx
                .update(riotAccounts)
                .set({ gameName: null, tagLine: null, platform: null })
                .where(
                    and(
                        inArray(riotAccounts.id, ids),
                        notExists(
                            tx
                                .select({ one: sql`1` })
                                .from(guildRiotAccounts)
                                .where(eq(guildRiotAccounts.riotAccountId, riotAccounts.id))
                        )
                    )
                );
        // 안정적인 내부 ID·과거 출전·결과·MMR·PUUID를 지우거나 다른 사용자에게 옮기지 않는다.
        await tx
            .update(users)
            .set({
                username: '탈퇴한 사용자',
                globalName: null,
                avatarHash: null,
                publicProfile: false,
                publicRiotIds: false,
                withdrawnAt: new Date()
            })
            .where(eq(users.id, user.userId));
        await enqueueKnownPrivacyPublications(tx, user.userId);
    });
}
