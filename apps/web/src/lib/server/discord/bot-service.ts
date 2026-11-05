import { createHash, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type {
    BotCreateScrimInput,
    BotGuildSyncInput,
    BotRegistrationContext,
    BotRegistrationInput
} from '../../../../../../shared/bot-api.js';
import type { Actor } from '../auth/types.ts';
import type { Database, Transaction } from '../db/types.ts';
import {
    discordPublicationJobs,
    scrimDiscordMessages,
    guildDiscordChannels,
    guildDiscordRoles,
    guildDiscordSettings,
    guildMembers,
    guildRiotAccounts,
    guilds,
    mmrSeasons,
    riotAccounts,
    scrimParticipantPreferences,
    scrimParticipantRegistrations,
    scrimParticipants,
    scrims
} from '../db/schema.ts';
import { DomainError } from '../errors.ts';
import {
    assertGuildAccess,
    getGuildAccessDependencies,
    requireGuildAdmin,
    requireGuildMember
} from '../guild/access.ts';
import { canPostToDiscordChannel } from '../guild/settings.ts';
import {
    createRegistrationInTransaction,
    createScrimInTransaction,
    updateRegistrationInTransaction,
    withdrawRegistrationInTransaction,
    type ScrimAccessDependencies
} from '../scrims/service.ts';
import { requireUuid, validateRegistration, validateSettings } from '../scrims/validation.ts';
import { isDiscordId } from './client.ts';
import { withBotReceipt } from './bot-receipts.ts';
import { synchronizeGuildMembership } from './membership.ts';
import { enqueueGuildPublications } from './publications.ts';

export function botActor(actorId: string): Actor {
    if (!isDiscordId(actorId)) throw new DomainError('INVALID_INPUT', '사용자 식별자가 올바르지 않아요');
    return { userId: actorId, isServiceAdmin: false };
}
function requireGuildId(guildId: string) {
    if (!isDiscordId(guildId)) throw new DomainError('INVALID_INPUT', '서버 식별자가 올바르지 않아요');
}

export async function initializeBotGuild(
    db: Database,
    guildId: string,
    input: { actorId: string; interactionId: string },
    access?: ScrimAccessDependencies
): Promise<{ guildId: string; seasonId: string }> {
    requireGuildId(guildId);
    const actor = botActor(input.actorId);
    await requireGuildAdmin(actor, guildId, { ...access, db });
    return db.transaction(async (tx) =>
        withBotReceipt(tx, { ...input, guildId, operation: 'initialize', payload: {} }, async () => {
            // receipt 외래키의 KEY SHARE와 충돌하지 않는 잠금으로 최초 시즌 생성만 직렬화한다.
            await tx
                .select({ id: guilds.id })
                .from(guilds)
                .where(eq(guilds.id, guildId))
                .for('no key update');
            await assertGuildAccess(tx, actor, guildId, true);
            const seasons = await tx.select().from(mmrSeasons).where(eq(mmrSeasons.guildId, guildId));
            const active = seasons.find((season) => season.endedAt === null);
            if (active) return { guildId, seasonId: active.id };
            if (seasons.length)
                throw new DomainError('CONFLICT', '종료된 시즌이 있어요. 새 시즌 운영을 먼저 준비해 주세요');
            await tx.insert(guildDiscordSettings).values({ guildId }).onConflictDoNothing();
            const [season] = await tx
                .insert(mmrSeasons)
                .values({ guildId, name: '시즌 1' })
                .returning({ id: mmrSeasons.id });
            return { guildId, seasonId: season!.id };
        })
    );
}

export async function createBotScrim(
    db: Database,
    guildId: string,
    input: BotCreateScrimInput,
    access?: ScrimAccessDependencies
): Promise<{ scrimId: string }> {
    requireGuildId(guildId);
    const actor = botActor(input.actorId);
    const settings = validateSettings(input);
    await requireGuildAdmin(actor, guildId, { ...access, db });
    // 기존 생성 함수의 UUID 멱등키도 동일한 interaction에 고정한다.
    const hex = createHash('sha256')
        .update('discord:' + input.interactionId)
        .digest('hex');
    const requestId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
    return db.transaction(async (tx) =>
        withBotReceipt(tx, { ...input, guildId, operation: 'create-scrim', payload: settings }, async () => ({
            scrimId: await createScrimInTransaction(tx, actor, guildId, settings, requestId)
        }))
    );
}

async function registrationContext(
    tx: Transaction,
    guildId: string,
    scrimId: string,
    actorId: string
): Promise<BotRegistrationContext> {
    const [row] = await tx
        .select()
        .from(scrims)
        .where(and(eq(scrims.id, scrimId), eq(scrims.guildId, guildId)));
    if (!row) throw new DomainError('NOT_FOUND', '내전을 찾을 수 없어요');
    const accounts = await tx
        .select({
            id: riotAccounts.id,
            gameName: riotAccounts.gameName,
            tagLine: riotAccounts.tagLine,
            isPrimary: guildRiotAccounts.isPrimary
        })
        .from(guildRiotAccounts)
        .innerJoin(riotAccounts, eq(riotAccounts.id, guildRiotAccounts.riotAccountId))
        .where(and(eq(guildRiotAccounts.guildId, guildId), eq(guildRiotAccounts.userId, actorId)))
        .orderBy(desc(guildRiotAccounts.isPrimary), asc(guildRiotAccounts.linkedAt), asc(riotAccounts.id));
    const [mine] = await tx
        .select({
            id: scrimParticipantRegistrations.id,
            participantId: scrimParticipants.id,
            status: scrimParticipantRegistrations.status,
            riotAccountId: scrimParticipants.riotAccountId,
            withdrawnAt: scrimParticipantRegistrations.withdrawnAt
        })
        .from(scrimParticipantRegistrations)
        .innerJoin(
            scrimParticipants,
            eq(scrimParticipants.id, scrimParticipantRegistrations.scrimParticipantId)
        )
        .where(and(eq(scrimParticipants.scrimId, scrimId), eq(scrimParticipants.userId, actorId)))
        .orderBy(
            sql`${scrimParticipantRegistrations.withdrawnAt} is null desc`,
            desc(scrimParticipantRegistrations.joinedAt),
            desc(scrimParticipantRegistrations.id)
        )
        .limit(1);
    const preferences = mine
        ? await tx
              .select()
              .from(scrimParticipantPreferences)
              .where(eq(scrimParticipantPreferences.scrimParticipantId, mine.participantId))
              .orderBy(asc(scrimParticipantPreferences.priority))
        : [];
    const active = await tx
        .select({ id: scrimParticipantRegistrations.id })
        .from(scrimParticipantRegistrations)
        .innerJoin(
            scrimParticipants,
            eq(scrimParticipants.id, scrimParticipantRegistrations.scrimParticipantId)
        )
        .where(
            and(eq(scrimParticipants.scrimId, scrimId), isNull(scrimParticipantRegistrations.withdrawnAt))
        );
    const reason =
        row.status !== 'recruit'
            ? '모집이 마감되어 신청을 변경할 수 없어요'
            : (!mine || mine.withdrawnAt !== null) && !accounts.length
              ? '서버 관리자에게 Riot 계정 연결을 요청해 주세요'
              : (!mine || mine.withdrawnAt !== null) &&
                  active.length >= row.teamCount * 5 + row.reserveCapacity
                ? '신청 정원이 찼어요'
                : null;
    return {
        guildId,
        scrimId,
        title: row.title,
        status: row.status,
        canEdit: reason === null,
        reason,
        accounts: accounts.map((account) => ({
            id: account.id,
            label: `${account.gameName}#${account.tagLine}`,
            isPrimary: account.isPrimary
        })),
        registration: mine
            ? {
                  id: mine.id,
                  status: mine.status,
                  riotAccountId: mine.riotAccountId,
                  positions: preferences.map((preference) => preference.position)
              }
            : null
    };
}

export async function getBotRegistration(
    db: Database,
    guildId: string,
    scrimId: string,
    actorId: string,
    access?: ScrimAccessDependencies
): Promise<BotRegistrationContext> {
    requireGuildId(guildId);
    requireUuid(scrimId, '내전');
    const actor = botActor(actorId);
    await requireGuildMember(actor, guildId, { ...access, db });
    return db.transaction(
        async (tx) => {
            await assertGuildAccess(tx, actor, guildId);
            return registrationContext(tx, guildId, scrimId, actorId);
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' }
    );
}

export async function mutateBotRegistration(
    db: Database,
    guildId: string,
    scrimId: string,
    input: BotRegistrationInput,
    access?: ScrimAccessDependencies
): Promise<BotRegistrationContext> {
    requireGuildId(guildId);
    requireUuid(scrimId, '내전');
    const actor = botActor(input.actorId);
    if (!['create', 'update', 'withdraw'].includes(input.action))
        throw new DomainError('INVALID_INPUT', '신청 동작이 올바르지 않아요');
    if (input.action === 'create' && input.registrationId !== undefined)
        throw new DomainError('INVALID_INPUT', '신규 신청에는 기존 신청 식별자를 사용할 수 없어요');
    if (input.action !== 'create') requireUuid(input.registrationId ?? '', '신청');
    const registration =
        input.action === 'withdraw'
            ? null
            : validateRegistration({ riotAccountId: input.riotAccountId!, positions: input.positions! });
    await requireGuildMember(actor, guildId, { ...access, db });
    return db.transaction(async (tx) =>
        withBotReceipt(
            tx,
            { ...input, guildId, operation: 'registration:' + scrimId, payload: input },
            async () => {
                if (input.action === 'create')
                    await createRegistrationInTransaction(tx, actor, guildId, scrimId, registration!);
                else if (input.action === 'update')
                    await updateRegistrationInTransaction(
                        tx,
                        actor,
                        guildId,
                        scrimId,
                        registration!,
                        input.registrationId
                    );
                else
                    await withdrawRegistrationInTransaction(
                        tx,
                        actor,
                        guildId,
                        scrimId,
                        input.registrationId
                    );
                return registrationContext(tx, guildId, scrimId, actor.userId);
            }
        )
    );
}

export async function synchronizeBotGuild(
    db: Database,
    guildId: string,
    input: BotGuildSyncInput,
    access?: ScrimAccessDependencies
): Promise<void> {
    requireGuildId(guildId);
    if (!['available', 'removed', 'unavailable'].includes(input.state))
        throw new DomainError('INVALID_INPUT', '서버 동기화 상태가 올바르지 않아요');
    if (input.memberId !== undefined && !isDiscordId(input.memberId))
        throw new DomainError('INVALID_INPUT', '멤버 식별자가 올바르지 않아요');
    if (input.memberRemoved !== undefined && typeof input.memberRemoved !== 'boolean')
        throw new DomainError('INVALID_INPUT', '멤버 동기화 상태가 올바르지 않아요');
    // Discord의 일시 unavailable 이벤트는 봇 퇴장으로 취급하지 않는다.
    if (input.state === 'unavailable') return;
    const { discord } = await getGuildAccessDependencies({ ...access, db });
    if (input.memberId) {
        const known = await db.query.guildMembers.findFirst({
            where: and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, input.memberId))
        });
        if (!known) return;
        // 이벤트 내용을 저장하지 않고 현재 REST 결과로 탈퇴와 재가입까지 확인한다.
        await synchronizeGuildMembership(db, discord, input.memberId, guildId);
        return;
    }
    const guild = await discord.getGuild(guildId);
    if (!guild) {
        await db.transaction(async (tx) => {
            await tx
                .update(guilds)
                .set({ isActive: false, syncedAt: new Date() })
                .where(eq(guilds.id, guildId));
            await tx.update(guildMembers).set({ syncedAt: null }).where(eq(guildMembers.guildId, guildId));
        });
        return;
    }
    if (!discord.listRoles || !discord.listChannels || !discord.getCurrentUserId)
        throw new DomainError('SERVICE_UNAVAILABLE', 'Discord 동기화 기능을 사용할 수 없어요');
    const [roles, channels, botId] = await Promise.all([
        discord.listRoles(guildId),
        discord.listChannels(guildId),
        discord.getCurrentUserId()
    ]);
    const bot = await discord.getMember(guildId, botId);
    if (!bot) throw new DomainError('SERVICE_UNAVAILABLE', '봇의 서버 소속을 확인할 수 없어요');
    const categories = new Map(
        channels.filter((channel) => channel.type === 4).map((channel) => [channel.id, channel.name])
    );
    await db.transaction(async (tx) => {
        const before = await tx.query.guilds.findFirst({ where: eq(guilds.id, guildId) });
        await tx
            .insert(guilds)
            .values({
                id: guildId,
                name: guild.name,
                iconHash: guild.iconHash,
                isActive: true,
                syncedAt: new Date()
            })
            .onConflictDoUpdate({
                target: guilds.id,
                set: { name: guild.name, iconHash: guild.iconHash, isActive: true, syncedAt: new Date() }
            });
        await tx.delete(guildDiscordRoles).where(eq(guildDiscordRoles.guildId, guildId));
        const choices = roles.filter((role) => role.id !== guildId && !role.managed);
        if (choices.length)
            await tx.insert(guildDiscordRoles).values(
                choices.map((role) => ({
                    guildId,
                    roleId: role.id,
                    name: role.name,
                    position: role.position
                }))
            );
        await tx.delete(guildDiscordChannels).where(eq(guildDiscordChannels.guildId, guildId));
        const textChannels = channels.filter((channel) => channel.type === 0 || channel.type === 5);
        if (textChannels.length)
            await tx.insert(guildDiscordChannels).values(
                textChannels.map((channel) => ({
                    guildId,
                    channelId: channel.id,
                    name: channel.name,
                    position: channel.position,
                    categoryName: channel.parentId ? (categories.get(channel.parentId) ?? null) : null,
                    botCanPost: canPostToDiscordChannel({ ...guild, roles }, bot, channel)
                }))
            );
        // 역할·채널 변경 이벤트 뒤 화면의 오래된 운영 권한 힌트를 즉시 무효화한다.
        await tx.update(guildMembers).set({ syncedAt: null }).where(eq(guildMembers.guildId, guildId));
        if (before && !before.isActive) await enqueueGuildPublications(tx, guildId);
    });
}

export async function listFailedPublications(
    db: Database,
    guildId: string,
    actorId: string,
    access?: ScrimAccessDependencies
) {
    requireGuildId(guildId);
    await requireGuildAdmin(botActor(actorId), guildId, { ...access, db });
    const rows = await db
        .select({
            job: discordPublicationJobs,
            title: scrims.title,
            message: scrimDiscordMessages,
            settings: guildDiscordSettings
        })
        .from(discordPublicationJobs)
        .innerJoin(scrims, eq(scrims.id, discordPublicationJobs.scrimId))
        .leftJoin(
            scrimDiscordMessages,
            and(
                eq(scrimDiscordMessages.scrimId, scrims.id),
                eq(scrimDiscordMessages.kind, discordPublicationJobs.kind)
            )
        )
        .leftJoin(guildDiscordSettings, eq(guildDiscordSettings.guildId, scrims.guildId))
        .where(
            and(eq(scrims.guildId, guildId), inArray(discordPublicationJobs.status, ['blocked', 'uncertain']))
        )
        .orderBy(desc(discordPublicationJobs.updatedAt), asc(discordPublicationJobs.id))
        .limit(25);
    return {
        publications: rows.map(({ job, title, message, settings }) => ({
            id: job.id,
            scrimId: job.scrimId,
            title,
            kind: job.kind,
            state: job.status as 'blocked' | 'uncertain',
            channelId:
                job.leaseChannelId ??
                message?.channelId ??
                (job.kind === 'recruitment' ? settings?.recruitmentChannelId : settings?.entryChannelId) ??
                null,
            messageId: job.leaseMessageId ?? message?.messageId ?? null,
            errorCode: job.errorCode
        }))
    };
}

function containsScrimLink(value: unknown, basePath: string, depth = 0): boolean {
    if (depth > 12 || !value || typeof value !== 'object') return false;
    if (Array.isArray(value)) return value.some((child) => containsScrimLink(child, basePath, depth + 1));
    const object = value as Record<string, unknown>;
    if (typeof object.url === 'string') {
        try {
            const url = new URL(object.url);
            if (
                ['http:', 'https:'].includes(url.protocol) &&
                (url.pathname === basePath || url.pathname.startsWith(basePath + '/'))
            )
                return true;
        } catch {
            /* URL이 아닌 값은 복구 근거로 사용하지 않는다. */
        }
    }
    return Object.values(object).some((child) => containsScrimLink(child, basePath, depth + 1));
}

export async function retryBotPublication(
    db: Database,
    guildId: string,
    jobId: string,
    input: { actorId: string; interactionId: string; messageId?: string; confirmAbsent?: boolean },
    access?: ScrimAccessDependencies
): Promise<void> {
    requireGuildId(guildId);
    requireUuid(jobId, '게시 작업');
    const actor = botActor(input.actorId);
    if (input.messageId !== undefined && !isDiscordId(input.messageId))
        throw new DomainError('INVALID_INPUT', '메시지 식별자가 올바르지 않아요');
    if (input.confirmAbsent !== undefined && typeof input.confirmAbsent !== 'boolean')
        throw new DomainError('INVALID_INPUT', '메시지 부재 확인이 올바르지 않아요');
    if (input.messageId && input.confirmAbsent)
        throw new DomainError('INVALID_INPUT', '메시지 확인 방법을 하나만 골라 주세요');
    const dependencies = await getGuildAccessDependencies({ ...access, db });
    await requireGuildAdmin(actor, guildId, dependencies);
    const [before] = await db
        .select({ job: discordPublicationJobs, guildId: scrims.guildId })
        .from(discordPublicationJobs)
        .innerJoin(scrims, eq(scrims.id, discordPublicationJobs.scrimId))
        .where(and(eq(discordPublicationJobs.id, jobId), eq(scrims.guildId, guildId)));
    if (!before) throw new DomainError('NOT_FOUND', '게시 작업을 찾을 수 없어요');
    const needsConfirmation = before.job.status === 'uncertain';
    if (needsConfirmation && !input.messageId && input.confirmAbsent !== true)
        throw new DomainError('INVALID_INPUT', '게시된 메시지 ID 또는 메시지가 없다는 확인이 필요해요');
    let recovered: { id: string; channelId: string } | null = null;
    if (input.messageId && ['blocked', 'uncertain'].includes(before.job.status)) {
        const [storedMessage] = await db
            .select()
            .from(scrimDiscordMessages)
            .where(
                and(
                    eq(scrimDiscordMessages.scrimId, before.job.scrimId),
                    eq(scrimDiscordMessages.kind, before.job.kind)
                )
            );
        const settings = await db.query.guildDiscordSettings.findFirst({
            where: eq(guildDiscordSettings.guildId, guildId)
        });
        const channelId =
            before.job.leaseChannelId ??
            storedMessage?.channelId ??
            (before.job.kind === 'recruitment' ? settings?.recruitmentChannelId : settings?.entryChannelId);
        if (!channelId || !dependencies.discord.getMessage || !dependencies.discord.getCurrentUserId)
            throw new DomainError('SERVICE_UNAVAILABLE', '게시 메시지를 확인할 수 없어요');
        const [message, botId] = await Promise.all([
            dependencies.discord.getMessage(channelId, input.messageId),
            dependencies.discord.getCurrentUserId()
        ]);
        if (
            !message ||
            message.authorId !== botId ||
            !containsScrimLink(message.components, `/g/${guildId}/scrims/${before.job.scrimId}`)
        )
            throw new DomainError('CONFLICT', '이 내전의 봇 게시 메시지가 아니에요');
        recovered = { id: message.id, channelId };
    }
    await db.transaction(async (tx) =>
        withBotReceipt(
            tx,
            { ...input, guildId, operation: 'retry-publication:' + jobId, payload: input },
            async () => {
                // 복구한 메시지의 FK도 같은 부모를 참조하므로 내전부터 잠근다.
                const [scrim] = await tx
                    .select({ id: scrims.id })
                    .from(scrims)
                    .where(and(eq(scrims.id, before.job.scrimId), eq(scrims.guildId, guildId)))
                    .for('update');
                if (!scrim) throw new DomainError('NOT_FOUND', '게시 대상 내전을 찾을 수 없어요');
                const [job] = await tx
                    .select()
                    .from(discordPublicationJobs)
                    .where(
                        and(
                            eq(discordPublicationJobs.id, jobId),
                            eq(discordPublicationJobs.scrimId, scrim.id)
                        )
                    )
                    .for('update');
                await assertGuildAccess(tx, actor, guildId, true);
                if (!job || !['blocked', 'uncertain'].includes(job.status))
                    throw new DomainError('CONFLICT', '이미 처리 중이거나 복구된 게시 작업이에요');
                if (
                    job.status !== before.job.status ||
                    job.leaseChannelId !== before.job.leaseChannelId ||
                    job.leaseRevision !== before.job.leaseRevision
                )
                    throw new DomainError('CONFLICT', '게시 상태가 변경됐어요. 다시 확인해 주세요');
                if (recovered) {
                    await tx
                        .insert(scrimDiscordMessages)
                        .values({
                            scrimId: job.scrimId,
                            kind: job.kind,
                            channelId: recovered.channelId,
                            messageId: recovered.id,
                            publishedRevision: job.leaseRevision ?? 0
                        })
                        .onConflictDoUpdate({
                            target: [scrimDiscordMessages.scrimId, scrimDiscordMessages.kind],
                            set: {
                                channelId: recovered.channelId,
                                messageId: recovered.id,
                                publishedRevision: job.leaseRevision ?? 0
                            }
                        });
                } else if (input.confirmAbsent) {
                    await tx
                        .delete(scrimDiscordMessages)
                        .where(
                            and(
                                eq(scrimDiscordMessages.scrimId, job.scrimId),
                                eq(scrimDiscordMessages.kind, job.kind)
                            )
                        );
                }
                await tx
                    .update(discordPublicationJobs)
                    .set({
                        status: 'pending',
                        attempts: 0,
                        nextAttemptAt: new Date(),
                        errorCode: null,
                        nonce: input.confirmAbsent
                            ? randomUUID().replaceAll('-', '').slice(0, 24)
                            : job.nonce,
                        leaseToken: null,
                        leaseUntil: null,
                        leaseRevision: null,
                        leaseChannelId: null,
                        leaseMessageId: null,
                        leaseOperation: null
                    })
                    .where(eq(discordPublicationJobs.id, jobId));
                return { ok: true };
            }
        )
    );
}

export async function listKnownBotMembers(
    db: Database,
    guildId: string,
    after?: string
): Promise<{ memberIds: string[]; nextCursor: string | null }> {
    requireGuildId(guildId);
    if (after !== undefined && !isDiscordId(after))
        throw new DomainError('INVALID_INPUT', '멤버 조회 위치가 올바르지 않아요');
    const guild = await db.query.guilds.findFirst({
        where: and(eq(guilds.id, guildId), eq(guilds.isActive, true))
    });
    if (!guild) throw new DomainError('NOT_FOUND', '서버를 찾을 수 없어요');
    const rows = await db
        .select({ id: guildMembers.userId })
        .from(guildMembers)
        .where(and(eq(guildMembers.guildId, guildId), after ? gt(guildMembers.userId, after) : undefined))
        .orderBy(asc(guildMembers.userId))
        .limit(101);
    const memberIds = rows.slice(0, 100).map((row) => row.id);
    return { memberIds, nextCursor: rows.length > 100 ? memberIds[memberIds.length - 1]! : null };
}

/** 봇이 꺼진 동안의 탈퇴도 복구한다. 완전한 목록 조회가 실패하면 DB 활성 상태를 바꾸지 않는다. */
export async function reconcileBotGuilds(db: Database, access?: ScrimAccessDependencies): Promise<void> {
    const { discord } = await getGuildAccessDependencies({ ...access, db });
    const checkedAt = new Date();
    const remote = await discord.listGuilds();
    const actualIds = new Set(remote.map((guild) => guild.id));
    await db.transaction(async (tx) => {
        const known = await tx
            .select({ id: guilds.id })
            .from(guilds)
            .where(
                and(eq(guilds.isActive, true), or(isNull(guilds.syncedAt), lte(guilds.syncedAt, checkedAt)))
            )
            .for('update');
        const removed = known.filter((guild) => !actualIds.has(guild.id)).map((guild) => guild.id);
        if (!removed.length) return;
        await tx
            .update(guilds)
            .set({ isActive: false, syncedAt: new Date() })
            .where(inArray(guilds.id, removed));
        await tx.update(guildMembers).set({ syncedAt: null }).where(inArray(guildMembers.guildId, removed));
    });
}
