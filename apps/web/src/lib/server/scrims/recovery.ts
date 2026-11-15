import { and, eq, exists, isNotNull, isNull, or, sql } from 'drizzle-orm';
import {
    guildRiotAccounts,
    matchLineupPlayers,
    matchLineups,
    matches,
    scrimParticipantRegistrations,
    scrimParticipants,
    users
} from '../db/schema.ts';
import type { Transaction } from '../db/types.ts';
import { DomainError } from '../errors.ts';

/** 호출자는 내전 잠금보다 먼저 사용자 생애주기 잠금을 얻어 탈퇴와 복구를 직렬화한다. */
export async function assertRecoverableParticipants(
    tx: Transaction,
    row: { id: string; guildId: string },
    options: { matchId?: string; includeStandby?: boolean } = {}
): Promise<void> {
    const registration = tx
        .select({ one: sql`1` })
        .from(scrimParticipantRegistrations)
        .where(
            and(
                eq(scrimParticipantRegistrations.scrimParticipantId, scrimParticipants.id),
                isNull(scrimParticipantRegistrations.withdrawnAt),
                options.includeStandby ? undefined : eq(scrimParticipantRegistrations.status, 'selected')
            )
        );
    const lineup = tx
        .select({ one: sql`1` })
        .from(matchLineupPlayers)
        .innerJoin(matchLineups, eq(matchLineups.id, matchLineupPlayers.lineupId))
        .innerJoin(matches, eq(matches.id, matchLineups.matchId))
        .where(
            and(
                eq(matchLineupPlayers.participantId, scrimParticipants.id),
                options.matchId ? eq(matches.id, options.matchId) : undefined,
                isNotNull(matchLineups.confirmedAt),
                // 전체 취소 배치에 분리된 이전 출전은 재편성의 현재 출전으로 다시 사용하지 않는다.
                isNull(matches.cancellationBatchId)
            )
        );
    const participants = await tx
        .select({
            userId: scrimParticipants.userId,
            accountId: scrimParticipants.riotAccountId,
            knownUserId: users.id,
            withdrawnAt: users.withdrawnAt
        })
        .from(scrimParticipants)
        .leftJoin(users, eq(users.id, scrimParticipants.userId))
        .where(
            and(
                eq(scrimParticipants.scrimId, row.id),
                options.matchId ? exists(lineup) : or(exists(registration), exists(lineup))
            )
        );
    const message = '탈퇴했거나 연결 계정이 없는 참가자가 있어요. 참가자 연결을 확인한 뒤 다시 진행해 주세요';
    if (participants.some((person) => !person.knownUserId || person.withdrawnAt || !person.accountId))
        throw new DomainError('CONFLICT', message);
    if (!participants.length) return;
    const pairs = participants.flatMap((person) =>
        person.userId && person.accountId ? [{ userId: person.userId, accountId: person.accountId }] : []
    );
    // 연결 해제가 동시에 진행되면 삭제 뒤 재검사하거나, 복구 뒤 활성 사용 검사까지 기다리게 한다.
    // 사용자·계정 행을 내전 뒤에 잠그지 않아 기존 user → account → scrim 순서와 교착하지 않는다.
    const links = await tx
        .select({ userId: guildRiotAccounts.userId, accountId: guildRiotAccounts.riotAccountId })
        .from(guildRiotAccounts)
        .where(
            and(
                eq(guildRiotAccounts.guildId, row.guildId),
                or(
                    ...pairs.map((pair) =>
                        and(
                            eq(guildRiotAccounts.userId, pair.userId),
                            eq(guildRiotAccounts.riotAccountId, pair.accountId)
                        )
                    )
                )
            )
        )
        .for('key share');
    const linked = new Set(links.map((link) => `${link.userId}:${link.accountId}`));
    if (pairs.some((pair) => !linked.has(`${pair.userId}:${pair.accountId}`)))
        throw new DomainError('CONFLICT', message);
}
