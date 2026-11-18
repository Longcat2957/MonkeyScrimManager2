import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { playCapacity, RESERVE_CAPACITY, TEAM_COUNT, TEAM_NAMES } from '../../features/scrims/settings.ts';
import type { LolPosition } from '../../features/guild/types.ts';
import type { ManualRegistrationResult, ScrimSettings } from '../../features/scrims/types.ts';
import { requireUser } from '../auth/guards.ts';
import { lockUserLifecycleChanges } from '../accounts/lifecycle.ts';
import type { Actor } from '../auth/types.ts';
import type { Database, Transaction } from '../db/types.ts';
import {
    auctions,
    games,
    guildMembers,
    guildRiotAccounts,
    matches,
    mmrSeasons,
    riotAccounts,
    scrimParticipantPreferences,
    scrimParticipantRegistrations,
    scrimParticipants,
    scrims,
    scrimTeams,
    users
} from '../db/schema.ts';
import { DomainError } from '../errors.ts';
import { assertRecoverableParticipants } from './recovery.ts';
import { lockMmrSeason } from '../mmr/service.ts';
import {
    activeScrimCancellation,
    cancelRunningScrimInTransaction,
    fullCancellationRestoreBlock,
    restoreFullCancellationInTransaction
} from './cancellation.ts';
import { enqueueScrimPublications } from '../discord/publications.ts';
import {
    assertGuildAccess,
    requireGuildAdmin,
    requireGuildMember,
    type GuildAccessDependencies
} from '../guild/access.ts';
import { isDiscordId } from '../discord/client.ts';
import { discordDisplayName } from '../discord/display-name.ts';
import {
    assertCapacity,
    assertEditableSettings,
    assertRevision,
    promotionIds,
    requireRecruitment,
    requireRevision,
    requireUuid,
    validateRegistration,
    validateSelection,
    validateSettings
} from './validation.ts';

type ScrimRow = typeof scrims.$inferSelect;
export type RevisionInput = { expectedRevision: number };
export type RegistrationInput = { riotAccountId: string | null; positions: readonly LolPosition[] };
export type ScrimAccessDependencies = Pick<GuildAccessDependencies, 'discord'>;

export function settingsFromRow(row: ScrimRow): ScrimSettings {
    return {
        title: row.title,
        scheduledAt: row.expectedStartAt?.toISOString() ?? null,
        teamCount: row.teamCount,
        reserveCapacity: row.reserveCapacity,
        hardFearless: row.isHardFearless
    };
}

export async function lockScrim(
    tx: Transaction,
    actor: Actor,
    guildId: string,
    scrimId: string,
    manager: boolean,
    expectedRevision?: number
): Promise<ScrimRow> {
    const [row] = await tx
        .select()
        .from(scrims)
        .where(and(eq(scrims.id, scrimId), eq(scrims.guildId, guildId)))
        .for('update');
    if (!row) throw new DomainError('NOT_FOUND', '내전을 찾을 수 없어요');
    await assertGuildAccess(tx, actor, guildId, manager);
    if (expectedRevision !== undefined) assertRevision(row.revision, expectedRevision);
    return row;
}

export async function bumpRevision(tx: Transaction, scrimId: string): Promise<void> {
    await tx
        .update(scrims)
        .set({ revision: sql`${scrims.revision} + 1` })
        .where(eq(scrims.id, scrimId));
    await enqueueScrimPublications(tx, scrimId);
}

async function registrations(tx: Transaction, scrimId: string) {
    return tx
        .select({
            id: scrimParticipantRegistrations.id,
            participantId: scrimParticipants.id,
            userId: scrimParticipants.userId,
            status: scrimParticipantRegistrations.status,
            joinedAt: scrimParticipantRegistrations.joinedAt
        })
        .from(scrimParticipantRegistrations)
        .innerJoin(
            scrimParticipants,
            eq(scrimParticipants.id, scrimParticipantRegistrations.scrimParticipantId)
        )
        .where(and(eq(scrimParticipants.scrimId, scrimId), isNull(scrimParticipantRegistrations.withdrawnAt)))
        .orderBy(asc(scrimParticipantRegistrations.joinedAt), asc(scrimParticipantRegistrations.id));
}

async function promoteStandby(tx: Transaction, row: ScrimRow): Promise<void> {
    const ids = promotionIds(row.teamCount, await registrations(tx, row.id));
    if (ids.length)
        await tx
            .update(scrimParticipantRegistrations)
            .set({ status: 'selected' })
            .where(inArray(scrimParticipantRegistrations.id, ids));
}

/** 계정 연결·해제와 같은 사용자 → 계정 → 내전 순서로 잠근다. */
async function lockRegistrationAccounts(
    tx: Transaction,
    actor: Actor,
    guildId: string,
    scrimId: string,
    nextAccountId?: string | null
) {
    const [user] = await tx.select().from(users).where(eq(users.id, actor.userId)).for('no key update');
    if (!user || user.withdrawnAt) throw new DomainError('UNAUTHENTICATED', '다시 로그인해 주세요');
    const [participant] = await tx
        .select()
        .from(scrimParticipants)
        .where(and(eq(scrimParticipants.scrimId, scrimId), eq(scrimParticipants.userId, actor.userId)));
    const accountIds = [
        ...new Set([participant?.riotAccountId, nextAccountId].filter((id): id is string => !!id))
    ].sort();
    const accounts = accountIds.length
        ? await tx
              .select()
              .from(riotAccounts)
              .where(inArray(riotAccounts.id, accountIds))
              .orderBy(asc(riotAccounts.id))
              .for('update')
        : [];
    if (nextAccountId) {
        const [link] = await tx
            .select()
            .from(guildRiotAccounts)
            .where(
                and(
                    eq(guildRiotAccounts.guildId, guildId),
                    eq(guildRiotAccounts.riotAccountId, nextAccountId),
                    eq(guildRiotAccounts.userId, actor.userId)
                )
            )
            .for('update');
        if (!accounts.some((account) => account.id === nextAccountId) || !link)
            throw new DomainError('INVALID_INPUT', '이 서버에서 본인에게 연결된 Riot 계정을 골라 주세요', {
                riotAccountId: '이 서버에서 본인에게 연결된 Riot 계정을 골라 주세요'
            });
    }
    return { user, participant };
}

async function requireUnusedAccount(
    tx: Transaction,
    scrimId: string,
    accountId: string | null,
    participantId?: string
): Promise<void> {
    if (!accountId) return;
    const [other] = await tx
        .select({ id: scrimParticipants.id })
        .from(scrimParticipants)
        .where(
            and(
                eq(scrimParticipants.scrimId, scrimId),
                eq(scrimParticipants.riotAccountId, accountId),
                participantId ? ne(scrimParticipants.id, participantId) : undefined
            )
        )
        .limit(1);
    if (other) throw new DomainError('CONFLICT', '이 Riot 계정은 이 내전의 다른 참가자가 사용한 계정이에요');
}

async function replacePreferences(
    tx: Transaction,
    participantId: string,
    positions: readonly LolPosition[]
): Promise<void> {
    await tx
        .delete(scrimParticipantPreferences)
        .where(eq(scrimParticipantPreferences.scrimParticipantId, participantId));
    await tx.insert(scrimParticipantPreferences).values(
        positions.map((position, index) => ({
            scrimParticipantId: participantId,
            position,
            priority: index + 1
        }))
    );
}

export async function createScrim(
    db: Database,
    actor: Actor | null,
    guildId: string,
    input: ScrimSettings<number> & { requestId: string },
    access?: ScrimAccessDependencies
): Promise<string> {
    const user = requireUser(actor);
    const settings = validateSettings(input);
    const requestId = requireUuid(input.requestId, '요청');
    await requireGuildAdmin(user, guildId, { ...access, db });
    return db.transaction((tx) => createScrimInTransaction(tx, user, guildId, settings, requestId));
}

export async function createScrimInTransaction(
    tx: Transaction,
    user: Actor,
    guildId: string,
    settings: ScrimSettings,
    requestId: string
): Promise<string> {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, user.userId)).for('no key update');
    await assertGuildAccess(tx, user, guildId, true);
    const [existing] = await tx
        .select({ id: scrims.id, guildId: scrims.guildId })
        .from(scrims)
        .where(and(eq(scrims.createdByUserId, user.userId), eq(scrims.creationRequestId, requestId)))
        .limit(1);
    if (existing) {
        if (existing.guildId !== guildId)
            throw new DomainError('CONFLICT', '다른 생성 요청과 겹쳤어요. 다시 시도해 주세요');
        return existing.id;
    }
    const [season] = await tx
        .select({ id: mmrSeasons.id })
        .from(mmrSeasons)
        .where(and(eq(mmrSeasons.guildId, guildId), isNull(mmrSeasons.endedAt)))
        .limit(1)
        .for('share');
    if (!season) throw new DomainError('CONFLICT', '활성 시즌이 없어요. 서버 초기 설정을 먼저 완료해 주세요');
    const [created] = await tx
        .insert(scrims)
        .values({
            guildId,
            createdByUserId: user.userId,
            creationRequestId: requestId,
            mmrSeasonId: season.id,
            title: settings.title,
            expectedStartAt: settings.scheduledAt ? new Date(settings.scheduledAt) : null,
            teamCount: settings.teamCount,
            reserveCapacity: settings.reserveCapacity,
            isHardFearless: settings.hardFearless
        })
        .returning({ id: scrims.id });
    await enqueueScrimPublications(tx, created!.id);
    return created!.id;
}

export async function createRegistration(
    db: Database,
    actor: Actor | null,
    guildId: string,
    scrimId: string,
    input: RegistrationInput,
    access?: ScrimAccessDependencies
): Promise<void> {
    const user = requireUser(actor);
    requireUuid(scrimId, '내전');
    const next = validateRegistration(input);
    await requireGuildMember(user, guildId, { ...access, db });
    await db.transaction((tx) => createRegistrationInTransaction(tx, user, guildId, scrimId, next));
}

export async function createRegistrationInTransaction(
    tx: Transaction,
    user: Actor,
    guildId: string,
    scrimId: string,
    next: RegistrationInput,
    options: { joinedBy?: Actor; initialStatus?: 'standby' } = {}
): Promise<'selected' | 'standby'> {
    const { joinedBy } = options;
    const { user: profile, participant } = await lockRegistrationAccounts(
        tx,
        user,
        guildId,
        scrimId,
        next.riotAccountId
    );
    const row = await lockScrim(tx, joinedBy ?? user, guildId, scrimId, Boolean(joinedBy));
    if (joinedBy) await assertGuildAccess(tx, user, guildId);
    requireRecruitment(row.status);
    const active = await registrations(tx, row.id);
    const current = active.find((registration) => registration.userId === user.userId);
    if (current) throw new DomainError('CONFLICT', '이미 신청했어요');
    if (active.length >= playCapacity(row.teamCount) + row.reserveCapacity)
        throw new DomainError('CONFLICT', '신청 정원이 찼어요');
    await requireUnusedAccount(tx, row.id, next.riotAccountId, participant?.id);
    const [membership] = await tx
        .select({ nickname: guildMembers.nickname })
        .from(guildMembers)
        .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, user.userId)));
    const displayName = discordDisplayName(profile, membership?.nickname);
    let participantId = participant?.id;
    if (participantId) {
        await tx
            .update(scrimParticipants)
            .set({
                riotAccountId: next.riotAccountId,
                displayName,
                teamId: null,
                position: null
            })
            .where(eq(scrimParticipants.id, participantId));
    } else {
        const [created] = await tx
            .insert(scrimParticipants)
            .values({
                scrimId: row.id,
                userId: user.userId,
                riotAccountId: next.riotAccountId,
                displayName
            })
            .returning({ id: scrimParticipants.id });
        participantId = created!.id;
    }
    await replacePreferences(tx, participantId, next.positions);
    const status =
        options.initialStatus !== 'standby' &&
        active.filter((registration) => registration.status === 'selected').length <
            playCapacity(row.teamCount)
            ? 'selected'
            : 'standby';
    await tx.insert(scrimParticipantRegistrations).values({
        scrimParticipantId: participantId,
        joinedByUserId: joinedBy?.userId ?? user.userId,
        status
    });
    await bumpRevision(tx, row.id);
    return status;
}

/** 운영자가 실제 서버 멤버를 대신 신청한다. 정원·대기·중복 검사는 본인 신청과 공유한다. */
export async function createManualRegistration(
    db: Database,
    actor: Actor | null,
    guildId: string,
    scrimId: string,
    input: { userId: string },
    access?: ScrimAccessDependencies
): Promise<'selected' | 'standby'> {
    const operator = requireUser(actor);
    requireUuid(scrimId, '내전');
    if (!isDiscordId(input.userId)) throw new DomainError('INVALID_INPUT', '추가할 서버 멤버를 골라 주세요');
    const target: Actor = { userId: input.userId, isServiceAdmin: false };
    await requireGuildAdmin(operator, guildId, { ...access, db });
    // 실제 소속과 봇 여부를 확인하면서 사전 웹 가입이 없는 대상도 등록한다.
    await requireGuildMember(target, guildId, { ...access, db });
    return db.transaction((tx) =>
        createManualRegistrationInTransaction(tx, operator, target, guildId, scrimId)
    );
}

/** 앞선 성공을 보존하고, 선택 순서대로 기존 단건 검증과 정원 잠금을 적용한다. */
export async function createManualRegistrations(
    db: Database,
    actor: Actor | null,
    guildId: string,
    scrimId: string,
    userIds: string[],
    access?: ScrimAccessDependencies
): Promise<ManualRegistrationResult[]> {
    requireUser(actor);
    const maximum = playCapacity(TEAM_COUNT.max) + RESERVE_CAPACITY.max;
    if (!userIds.length || userIds.length > maximum || userIds.some((id) => !isDiscordId(id)))
        throw new DomainError('INVALID_INPUT', `추가할 서버 멤버를 1~${maximum}명 골라 주세요`);
    requireUuid(scrimId, '내전');
    await requireGuildAdmin(actor, guildId, { ...access, db });
    const results: ManualRegistrationResult[] = [];
    for (const userId of new Set(userIds)) {
        try {
            const status = await createManualRegistration(db, actor, guildId, scrimId, { userId }, access);
            results.push({ userId, status });
        } catch (cause) {
            if (!(cause instanceof DomainError)) throw cause;
            results.push({ userId, status: 'failed', message: cause.message });
        }
    }
    return results;
}

export async function createManualRegistrationInTransaction(
    tx: Transaction,
    operator: Actor,
    target: Actor,
    guildId: string,
    scrimId: string
): Promise<'selected' | 'standby'> {
    const [primary] = await tx
        .select({ id: guildRiotAccounts.riotAccountId })
        .from(guildRiotAccounts)
        .where(and(eq(guildRiotAccounts.guildId, guildId), eq(guildRiotAccounts.userId, target.userId)))
        .orderBy(
            sql`${guildRiotAccounts.isPrimary} desc`,
            asc(guildRiotAccounts.linkedAt),
            asc(guildRiotAccounts.riotAccountId)
        )
        .limit(1);
    return createRegistrationInTransaction(
        tx,
        target,
        guildId,
        scrimId,
        { riotAccountId: primary?.id ?? null, positions: ['top', 'jungle', 'mid', 'bot', 'support'] },
        { joinedBy: operator }
    );
}

/** 본인 신청의 참가·대기만 전환하며, 계정·희망 포지션과 신청 순서는 보존한다. */
export async function setOwnRegistrationStatusInTransaction(
    tx: Transaction,
    user: Actor,
    guildId: string,
    scrimId: string,
    input: { registrationId: string; status: 'selected' | 'standby' }
): Promise<void> {
    await lockRegistrationAccounts(tx, user, guildId, scrimId);
    const row = await lockScrim(tx, user, guildId, scrimId, false);
    requireRecruitment(row.status);
    const active = await registrations(tx, row.id);
    const mine = active.find((registration) => registration.userId === user.userId);
    if (!mine || mine.id !== input.registrationId)
        throw new DomainError('CONFLICT', '신청이 변경됐어요. 내 신청을 다시 열어 주세요');
    if (mine.status === input.status) return;
    if (
        input.status === 'selected' &&
        active.filter((registration) => registration.status === 'selected').length >=
            playCapacity(row.teamCount)
    )
        return;
    await tx
        .update(scrimParticipantRegistrations)
        .set({ status: input.status })
        .where(eq(scrimParticipantRegistrations.id, mine.id));
    if (input.status === 'standby')
        await tx
            .update(scrimParticipants)
            .set({ teamId: null, position: null })
            .where(eq(scrimParticipants.id, mine.participantId));
    // 직접 대기를 선택한 직후에는 승급하지 않고, 기존 철회·제외·설정 저장 때의 승급 정책을 유지한다.
    await bumpRevision(tx, row.id);
}

export async function updateRegistration(
    db: Database,
    actor: Actor | null,
    guildId: string,
    scrimId: string,
    input: RegistrationInput,
    access?: ScrimAccessDependencies
): Promise<void> {
    const user = requireUser(actor);
    requireUuid(scrimId, '내전');
    const next = validateRegistration(input);
    await requireGuildMember(user, guildId, { ...access, db });
    await db.transaction((tx) => updateRegistrationInTransaction(tx, user, guildId, scrimId, next));
}

export async function updateRegistrationInTransaction(
    tx: Transaction,
    user: Actor,
    guildId: string,
    scrimId: string,
    next: RegistrationInput,
    expectedRegistrationId?: string
): Promise<void> {
    const { participant } = await lockRegistrationAccounts(tx, user, guildId, scrimId, next.riotAccountId);
    const row = await lockScrim(tx, user, guildId, scrimId, false);
    requireRecruitment(row.status);
    const mine = (await registrations(tx, row.id)).find(
        (registration) => registration.userId === user.userId
    );
    if (!participant || !mine) throw new DomainError('NOT_FOUND', '신청 기록을 찾을 수 없어요');
    if (expectedRegistrationId !== undefined && mine.id !== expectedRegistrationId)
        throw new DomainError('CONFLICT', '신청이 변경됐어요. 내 신청을 다시 열어 주세요');
    await requireUnusedAccount(tx, row.id, next.riotAccountId, participant.id);
    await tx
        .update(scrimParticipants)
        .set({ riotAccountId: next.riotAccountId })
        .where(eq(scrimParticipants.id, participant.id));
    await replacePreferences(tx, participant.id, next.positions);
    await bumpRevision(tx, row.id);
}

export async function withdrawRegistration(
    db: Database,
    actor: Actor | null,
    guildId: string,
    scrimId: string,
    access?: ScrimAccessDependencies
): Promise<void> {
    const user = requireUser(actor);
    requireUuid(scrimId, '내전');
    await requireGuildMember(user, guildId, { ...access, db });
    await db.transaction((tx) => withdrawRegistrationInTransaction(tx, user, guildId, scrimId));
}

export async function withdrawRegistrationInTransaction(
    tx: Transaction,
    user: Actor,
    guildId: string,
    scrimId: string,
    expectedRegistrationId?: string
): Promise<void> {
    await lockRegistrationAccounts(tx, user, guildId, scrimId);
    const row = await lockScrim(tx, user, guildId, scrimId, false);
    requireRecruitment(row.status);
    const mine = (await registrations(tx, row.id)).find(
        (registration) => registration.userId === user.userId
    );
    if (!mine) throw new DomainError('NOT_FOUND', '이미 철회된 신청이에요');
    if (expectedRegistrationId !== undefined && mine.id !== expectedRegistrationId)
        throw new DomainError('CONFLICT', '신청이 변경됐어요. 내 신청을 다시 열어 주세요');
    await tx
        .update(scrimParticipantRegistrations)
        .set({
            status: 'withdrawn',
            withdrawnAt: new Date(),
            withdrawnByUserId: user.userId,
            withdrawalReason: '본인 철회'
        })
        .where(eq(scrimParticipantRegistrations.id, mine.id));
    await tx
        .update(scrimParticipants)
        .set({ teamId: null, position: null })
        .where(eq(scrimParticipants.id, mine.participantId));
    await promoteStandby(tx, row);
    await bumpRevision(tx, row.id);
}

export async function setParticipantStatus(
    db: Database,
    actor: Actor | null,
    guildId: string,
    scrimId: string,
    input: RevisionInput & {
        registrationIds: readonly string[];
        status: 'selected' | 'standby' | 'excluded';
    },
    access?: ScrimAccessDependencies
): Promise<void> {
    const user = requireUser(actor);
    requireUuid(scrimId, '내전');
    const expectedRevision = requireRevision(input.expectedRevision);
    const next = validateSelection(input.registrationIds, input.status);
    await requireGuildAdmin(user, guildId, { ...access, db });
    await db.transaction(async (tx) => {
        const row = await lockScrim(tx, user, guildId, scrimId, true, expectedRevision);
        requireRecruitment(row.status);
        const active = await registrations(tx, row.id);
        const targets = active.filter((registration) => next.registrationIds.includes(registration.id));
        if (targets.length !== next.registrationIds.length)
            throw new DomainError('CONFLICT', '다른 사람이 먼저 참가 신청을 변경했어요');
        assertCapacity(
            settingsFromRow(row),
            active.map((registration) =>
                next.registrationIds.includes(registration.id)
                    ? { ...registration, status: next.status }
                    : registration
            )
        );
        await tx
            .update(scrimParticipantRegistrations)
            .set({
                status: next.status,
                ...(next.status === 'excluded'
                    ? {
                          withdrawnAt: new Date(),
                          withdrawnByUserId: user.userId,
                          withdrawalReason: '운영자 제외'
                      }
                    : {})
            })
            .where(inArray(scrimParticipantRegistrations.id, next.registrationIds));
        if (next.status !== 'selected')
            await tx
                .update(scrimParticipants)
                .set({ teamId: null, position: null })
                .where(
                    inArray(
                        scrimParticipants.id,
                        targets.map((target) => target.participantId)
                    )
                );
        // 수동 대기 전환은 유지하며, 제외로 빈 자리만 자동으로 승급한다.
        if (next.status === 'excluded') await promoteStandby(tx, row);
        await bumpRevision(tx, row.id);
    });
}

export async function updateScrimSettings(
    db: Database,
    actor: Actor | null,
    guildId: string,
    scrimId: string,
    input: RevisionInput & { settings: ScrimSettings<number> },
    access?: ScrimAccessDependencies
): Promise<void> {
    const user = requireUser(actor);
    requireUuid(scrimId, '내전');
    const expectedRevision = requireRevision(input.expectedRevision);
    await requireGuildAdmin(user, guildId, { ...access, db });
    await db.transaction(async (tx) => {
        const row = await lockScrim(tx, user, guildId, scrimId, true, expectedRevision);
        const settings = validateSettings(input.settings);
        assertEditableSettings(row.status, settingsFromRow(row), settings);
        assertCapacity(settings, await registrations(tx, row.id));
        await tx
            .update(scrims)
            .set({
                title: settings.title,
                expectedStartAt: settings.scheduledAt ? new Date(settings.scheduledAt) : null,
                teamCount: settings.teamCount,
                reserveCapacity: settings.reserveCapacity,
                isHardFearless: settings.hardFearless,
                revision: row.revision + 1
            })
            .where(eq(scrims.id, row.id));
        if (row.status === 'recruit') await promoteStandby(tx, { ...row, teamCount: settings.teamCount });
        await enqueueScrimPublications(tx, row.id);
    });
}

export async function closeRecruitment(
    db: Database,
    actor: Actor | null,
    guildId: string,
    scrimId: string,
    input: RevisionInput,
    access?: ScrimAccessDependencies
): Promise<void> {
    const user = requireUser(actor);
    requireUuid(scrimId, '내전');
    const expectedRevision = requireRevision(input.expectedRevision);
    await requireGuildAdmin(user, guildId, { ...access, db });
    await db.transaction(async (tx) => {
        const row = await lockScrim(tx, user, guildId, scrimId, true, expectedRevision);
        requireRecruitment(row.status);
        const selected = (await registrations(tx, row.id)).filter(
            (registration) => registration.status === 'selected'
        ).length;
        if (selected !== playCapacity(row.teamCount))
            throw new DomainError(
                'CONFLICT',
                `선발 인원이 ${playCapacity(row.teamCount)}명이어야 해요 (현재 ${selected}명)`
            );
        const teams = await tx
            .select()
            .from(scrimTeams)
            .where(eq(scrimTeams.scrimId, row.id))
            .orderBy(asc(scrimTeams.ordinal));
        await tx.update(scrimTeams).set({ isActive: false }).where(eq(scrimTeams.scrimId, row.id));
        for (let index = 0; index < row.teamCount; index += 1) {
            const existing = teams.find((team) => team.ordinal === index + 1);
            if (existing)
                await tx.update(scrimTeams).set({ isActive: true }).where(eq(scrimTeams.id, existing.id));
            else
                await tx.insert(scrimTeams).values({
                    scrimId: row.id,
                    name: TEAM_NAMES[index]!,
                    ordinal: index + 1,
                    isActive: true
                });
        }
        await tx
            .update(scrims)
            .set({ status: 'preparing', revision: row.revision + 1 })
            .where(eq(scrims.id, row.id));
        await enqueueScrimPublications(tx, row.id);
    });
}

export async function reopenRecruitment(
    db: Database,
    actor: Actor | null,
    guildId: string,
    scrimId: string,
    input: RevisionInput,
    access?: ScrimAccessDependencies
): Promise<void> {
    const user = requireUser(actor);
    requireUuid(scrimId, '내전');
    const expectedRevision = requireRevision(input.expectedRevision);
    await requireGuildAdmin(user, guildId, { ...access, db });
    await db.transaction(async (tx) => {
        const row = await lockScrim(tx, user, guildId, scrimId, true, expectedRevision);
        if (row.status !== 'preparing')
            throw new DomainError('CONFLICT', '현재 단계에서는 모집을 다시 열 수 없어요');
        const [auction] = await tx
            .select({ id: auctions.id })
            .from(auctions)
            .where(eq(auctions.scrimId, row.id))
            .limit(1);
        const [game] = await tx
            .select({ id: games.id })
            .from(games)
            .innerJoin(matches, eq(matches.id, games.matchId))
            .where(and(eq(games.scrimId, row.id), isNull(matches.cancellationBatchId)))
            .limit(1);
        if (auction || game)
            throw new DomainError('CONFLICT', '진행 이력이 있어 모집 단계로 되돌릴 수 없어요');
        await tx
            .update(scrimParticipants)
            .set({ teamId: null, position: null })
            .where(eq(scrimParticipants.scrimId, row.id));
        await tx
            .update(scrims)
            .set({ status: 'recruit', revision: row.revision + 1 })
            .where(eq(scrims.id, row.id));
        await enqueueScrimPublications(tx, row.id);
    });
}

export async function cancelScrim(
    db: Database,
    actor: Actor | null,
    guildId: string,
    scrimId: string,
    input: RevisionInput,
    access?: ScrimAccessDependencies
): Promise<void> {
    const user = requireUser(actor);
    requireUuid(scrimId, '내전');
    const expectedRevision = requireRevision(input.expectedRevision);
    await requireGuildAdmin(user, guildId, { ...access, db });
    await db.transaction(async (tx) => {
        // 결과 취소와 같은 시즌 → 내전 순서다. 상태 변경 경쟁 뒤에도 시즌을 뒤늦게 잠그지 않는다.
        const [target] = await tx
            .select({ seasonId: scrims.mmrSeasonId })
            .from(scrims)
            .where(and(eq(scrims.id, scrimId), eq(scrims.guildId, guildId)));
        if (target?.seasonId) await lockMmrSeason(tx, guildId, target.seasonId);
        const row = await lockScrim(tx, user, guildId, scrimId, true, expectedRevision);
        if (row.mmrSeasonId !== target?.seasonId)
            throw new DomainError('CONFLICT', '내전의 MMR 시즌이 변경됐어요');
        if (row.status === 'in_progress') {
            await cancelRunningScrimInTransaction(tx, row, user);
            return;
        }
        if (!['recruit', 'preparing', 'ready'].includes(row.status))
            throw new DomainError('CONFLICT', '모집·편성·대진 준비·진행 중인 내전만 취소할 수 있어요');
        const [game] = await tx
            .select({ id: games.id })
            .from(games)
            .innerJoin(matches, eq(matches.id, games.matchId))
            .where(and(eq(games.scrimId, row.id), isNull(matches.cancellationBatchId)))
            .limit(1);
        if (game) throw new DomainError('CONFLICT', '기록된 경기가 있어 취소할 수 없어요');
        const [auction] = await tx
            .select({ status: auctions.status })
            .from(auctions)
            .where(eq(auctions.scrimId, row.id))
            .for('update');
        await tx
            .update(scrims)
            .set({
                status: 'cancelled',
                cancelledFromStatus: row.status,
                cancelledAuctionStatus: auction?.status ?? null,
                revision: row.revision + 1
            })
            .where(eq(scrims.id, row.id));
        // 복구할 편성·포인트·이력과 시각은 보존하고 경매의 현재 상태만 함께 잠근다.
        if (auction)
            await tx.update(auctions).set({ status: 'cancelled' }).where(eq(auctions.scrimId, row.id));
        await enqueueScrimPublications(tx, row.id);
    });
}

/** 과거 취소 행의 복귀 단계를 현재 편성 자료에서 추정하지 않는다. */
export async function cancellationRestoreBlock(
    db: Database | Transaction,
    row: ScrimRow
): Promise<string | null> {
    if (row.status !== 'cancelled') return '취소된 내전만 복구할 수 있어요';
    const full = await activeScrimCancellation(db, row.id);
    if (full) return fullCancellationRestoreBlock(db, row, full);
    if (!row.cancelledFromStatus || !['recruit', 'preparing', 'ready'].includes(row.cancelledFromStatus))
        return '취소 전 단계가 남아 있지 않아 복구할 수 없어요';
    const [game] = await db
        .select({ id: games.id })
        .from(games)
        .innerJoin(matches, eq(matches.id, games.matchId))
        .where(and(eq(games.scrimId, row.id), isNull(matches.cancellationBatchId)))
        .limit(1);
    if (game) return '기록된 경기가 있어 내전 취소를 복구할 수 없어요';
    const [auction] = await db
        .select({ status: auctions.status })
        .from(auctions)
        .where(eq(auctions.scrimId, row.id));
    if (
        (row.cancelledAuctionStatus === null && auction) ||
        (row.cancelledAuctionStatus !== null && (!auction || auction.status !== 'cancelled'))
    )
        return '취소 전 경매 상태를 확인할 수 없어 복구할 수 없어요';
    return null;
}

export async function restoreCancelledScrim(
    db: Database,
    actor: Actor | null,
    guildId: string,
    scrimId: string,
    input: RevisionInput,
    access?: ScrimAccessDependencies
): Promise<void> {
    const user = requireUser(actor);
    requireUuid(scrimId, '내전');
    const expectedRevision = requireRevision(input.expectedRevision);
    await requireGuildAdmin(user, guildId, { ...access, db });
    await db.transaction(async (tx) => {
        await lockUserLifecycleChanges(tx);
        const row = await lockScrim(tx, user, guildId, scrimId, true, expectedRevision);
        const blocked = await cancellationRestoreBlock(tx, row);
        if (blocked) throw new DomainError('CONFLICT', blocked);
        await assertRecoverableParticipants(tx, row, {
            includeStandby: row.cancelledFromStatus === 'recruit'
        });
        const full = await activeScrimCancellation(tx, row.id);
        if (full) {
            await restoreFullCancellationInTransaction(tx, row, full);
            return;
        }
        if (row.cancelledAuctionStatus !== null)
            await tx
                .update(auctions)
                .set({ status: row.cancelledAuctionStatus })
                .where(eq(auctions.scrimId, row.id));
        await tx
            .update(scrims)
            .set({
                status: row.cancelledFromStatus!,
                cancelledFromStatus: null,
                cancelledAuctionStatus: null,
                revision: row.revision + 1
            })
            .where(eq(scrims.id, row.id));
        await enqueueScrimPublications(tx, row.id);
    });
}
