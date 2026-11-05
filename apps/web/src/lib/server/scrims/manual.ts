import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import {
    LANES,
    slotKey,
    type Assignments,
    type FormationPlayer,
    type PairRecord
} from '../../features/scrims/formation.ts';
import type { LolPosition } from '../../features/guild/types.ts';
import type { Actor } from '../auth/types.ts';
import type { Database, Transaction } from '../db/types.ts';
import {
    scrimParticipantPreferences,
    scrimParticipantRegistrations,
    scrimParticipants,
    scrims,
    scrimTeams,
    userPositionMmr
} from '../db/schema.ts';
import { DomainError } from '../errors.ts';
import { INITIAL_MMR } from '../mmr/rules.ts';
import { createBracketDraft } from './bracket.ts';
import { mutateScrim, type ScrimRow } from './operation.ts';
import { findScrim, readGuild } from './queries.ts';
import type { RevisionInput, ScrimAccessDependencies } from './service.ts';
import { requireUuid } from './validation.ts';

function requireManual(row: ScrimRow): void {
    if (row.formationMethod !== 'manual' || row.status !== 'preparing')
        throw new DomainError('CONFLICT', '수동 편성 중에만 배치를 바꿀 수 있어요');
}

export async function selectedParticipants(tx: Transaction, scrimId: string) {
    return tx
        .select({ participant: scrimParticipants, registrationId: scrimParticipantRegistrations.id })
        .from(scrimParticipants)
        .innerJoin(
            scrimParticipantRegistrations,
            eq(scrimParticipantRegistrations.scrimParticipantId, scrimParticipants.id)
        )
        .where(
            and(
                eq(scrimParticipants.scrimId, scrimId),
                eq(scrimParticipantRegistrations.status, 'selected'),
                isNull(scrimParticipantRegistrations.withdrawnAt)
            )
        )
        .orderBy(asc(scrimParticipantRegistrations.joinedAt), asc(scrimParticipantRegistrations.id));
}

export async function formationPlayers(
    tx: Transaction,
    row: ScrimRow,
    selected: Awaited<ReturnType<typeof selectedParticipants>>
): Promise<FormationPlayer[]> {
    const ids = selected.map(({ participant }) => participant.id);
    const userIds = selected
        .map(({ participant }) => participant.userId)
        .filter((id): id is string => id !== null);
    const preferences = ids.length
        ? await tx
              .select()
              .from(scrimParticipantPreferences)
              .where(inArray(scrimParticipantPreferences.scrimParticipantId, ids))
              .orderBy(asc(scrimParticipantPreferences.priority))
        : [];
    const ratings =
        row.mmrSeasonId && userIds.length
            ? await tx
                  .select()
                  .from(userPositionMmr)
                  .where(
                      and(
                          eq(userPositionMmr.seasonId, row.mmrSeasonId),
                          inArray(userPositionMmr.userId, userIds)
                      )
                  )
            : [];
    return selected.map(({ participant }) => ({
        // 재신청해도 유지되는 참가자 식별자로 편성·경매·출전을 연결한다.
        participantId: participant.id,
        userId: participant.userId,
        displayName: participant.displayName,
        iconUrl: null,
        positions: preferences
            .filter((preference) => preference.scrimParticipantId === participant.id)
            .map((preference) => preference.position),
        // 시즌과 사용자 귀속이 확인된 미반영 포지션은 MSM1의 초기 점수를 사용한다.
        mmr: Object.fromEntries(
            LANES.map((lane) => [
                lane,
                ratings.find((rating) => rating.userId === participant.userId && rating.position === lane)
                    ?.mmr ?? (row.mmrSeasonId && participant.userId ? INITIAL_MMR : null)
            ])
        ) as FormationPlayer['mmr']
    }));
}

export async function getManualFormation(
    db: Database,
    actor: Actor | null,
    guildId: string,
    scrimId: string,
    access?: ScrimAccessDependencies
) {
    requireUuid(scrimId, '내전');
    return readGuild(
        db,
        actor,
        guildId,
        async (tx) => {
            const row = await findScrim(tx, guildId, scrimId);
            if (!row) throw new DomainError('NOT_FOUND', '내전을 찾을 수 없어요');
            if (row.formationMethod !== 'manual')
                throw new DomainError('CONFLICT', '수동 편성 내전이 아니에요');
            if (row.status === 'recruit') return null;
            const teams = await tx
                .select({ id: scrimTeams.id, name: scrimTeams.name })
                .from(scrimTeams)
                .where(and(eq(scrimTeams.scrimId, row.id), eq(scrimTeams.isActive, true)))
                .orderBy(asc(scrimTeams.ordinal));
            const selected = await selectedParticipants(tx, row.id);
            const players = await formationPlayers(tx, row, selected);
            const assignments: Assignments = {};
            for (const { participant } of selected)
                if (participant.teamId && participant.position)
                    assignments[participant.id] = slotKey(participant.teamId, participant.position);
            return {
                teams,
                players,
                assignments,
                confirmed: ['ready', 'in_progress', 'completed', 'ended_early'].includes(row.status),
                pairs: {} as Record<string, PairRecord>
            };
        },
        access
    );
}

export function parseManualSlot(value: string | null): { teamId: string; position: LolPosition } | null {
    if (value === null) return null;
    const index = value.lastIndexOf(':');
    const teamId = requireUuid(value.slice(0, index), '팀');
    const position = value.slice(index + 1) as LolPosition;
    if (!LANES.includes(position)) throw new DomainError('INVALID_INPUT', '배정할 포지션을 다시 골라 주세요');
    return { teamId, position };
}

export async function moveManualPlayer(
    db: Database,
    actor: Actor | null,
    guildId: string,
    scrimId: string,
    input: RevisionInput & { participantId: string; slot: string | null },
    access?: ScrimAccessDependencies
) {
    requireUuid(input.participantId, '참가자');
    const slot = parseManualSlot(input.slot);
    return mutateScrim(
        db,
        actor,
        guildId,
        scrimId,
        input,
        async (tx, row) => {
            requireManual(row);
            const selected = (await selectedParticipants(tx, row.id)).map((entry) => entry.participant);
            const participant = selected.find((entry) => entry.id === input.participantId);
            if (!participant) throw new DomainError('NOT_FOUND', '이 내전의 선발 참가자를 찾을 수 없어요');
            if (slot) {
                const [team] = await tx
                    .select({ id: scrimTeams.id })
                    .from(scrimTeams)
                    .where(
                        and(
                            eq(scrimTeams.scrimId, row.id),
                            eq(scrimTeams.id, slot.teamId),
                            eq(scrimTeams.isActive, true)
                        )
                    )
                    .limit(1);
                if (!team) throw new DomainError('NOT_FOUND', '이 내전의 팀을 찾을 수 없어요');
            }
            const occupant = slot
                ? selected.find(
                      (entry) =>
                          entry.teamId === slot.teamId &&
                          entry.position === slot.position &&
                          entry.id !== participant.id
                  )
                : undefined;
            // 고유 슬롯 제약에 걸리지 않게 양쪽을 비운 뒤 같은 트랜잭션에서 교환한다.
            await tx
                .update(scrimParticipants)
                .set({ teamId: null, position: null })
                .where(
                    inArray(scrimParticipants.id, occupant ? [participant.id, occupant.id] : [participant.id])
                );
            if (occupant && participant.teamId && participant.position)
                await tx
                    .update(scrimParticipants)
                    .set({ teamId: participant.teamId, position: participant.position })
                    .where(eq(scrimParticipants.id, occupant.id));
            if (slot)
                await tx.update(scrimParticipants).set(slot).where(eq(scrimParticipants.id, participant.id));
        },
        access
    );
}

export async function resetManualFormation(
    db: Database,
    actor: Actor | null,
    guildId: string,
    scrimId: string,
    input: RevisionInput,
    access?: ScrimAccessDependencies
) {
    return mutateScrim(
        db,
        actor,
        guildId,
        scrimId,
        input,
        async (tx, row) => {
            requireManual(row);
            await tx
                .update(scrimParticipants)
                .set({ teamId: null, position: null })
                .where(eq(scrimParticipants.scrimId, row.id));
        },
        access
    );
}

export async function confirmManualFormation(
    db: Database,
    actor: Actor | null,
    guildId: string,
    scrimId: string,
    input: RevisionInput,
    access?: ScrimAccessDependencies
) {
    return mutateScrim(
        db,
        actor,
        guildId,
        scrimId,
        input,
        async (tx, row) => {
            requireManual(row);
            const selected = (await selectedParticipants(tx, row.id)).map((entry) => entry.participant);
            const teams = await tx
                .select()
                .from(scrimTeams)
                .where(and(eq(scrimTeams.scrimId, row.id), eq(scrimTeams.isActive, true)));
            if (
                teams.length !== row.teamCount ||
                selected.length !== row.teamCount * 5 ||
                teams.some((team) =>
                    LANES.some(
                        (lane) =>
                            selected.filter((entry) => entry.teamId === team.id && entry.position === lane)
                                .length !== 1
                    )
                )
            ) {
                throw new DomainError('CONFLICT', '모든 팀의 다섯 포지션에 선발 참가자를 배치해 주세요');
            }
            await createBracketDraft(tx, row);
            await tx.update(scrims).set({ status: 'ready' }).where(eq(scrims.id, row.id));
        },
        access
    );
}
