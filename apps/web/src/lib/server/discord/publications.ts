import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import type {
    BotPublication,
    BotPublicationKind,
    BotPublicationResult
} from '../../../../../../shared/bot-api.js';
import type { Database, Transaction } from '../db/types.ts';
import type { Actor } from '../auth/types.ts';
import { requireUser } from '../auth/guards.ts';
import { requireGuildAdmin } from '../guild/access.ts';
import { lockScrim, type RevisionInput, type ScrimAccessDependencies } from '../scrims/service.ts';
import {
    discordPublicationJobs,
    guildDiscordSettings,
    guilds,
    games,
    matches,
    matchLineups,
    scrimDiscordMessages,
    scrimParticipantRegistrations,
    scrimParticipants,
    scrims
} from '../db/schema.ts';
import { DomainError } from '../errors.ts';
import { requireRevision, requireUuid } from '../scrims/validation.ts';
import { isDiscordId } from './client.ts';
import { publicationData, matchPublicationData } from './publication-data.ts';

type Job = typeof discordPublicationJobs.$inferSelect;
const READY = ['ready', 'in_progress', 'completed', 'ended_early'];
const DM_ALLOWED = ['preparing', 'ready', 'in_progress'];
const clearLease = {
    leaseToken: null,
    leaseUntil: null,
    leaseRevision: null,
    leaseChannelId: null,
    leaseMessageId: null,
    leaseOperation: null
};
function nonce() {
    return randomUUID().replaceAll('-', '').slice(0, 24);
}

function messageScope(job: Pick<Job, 'scrimId' | 'kind' | 'subjectId'>) {
    return and(
        eq(scrimDiscordMessages.scrimId, job.scrimId),
        eq(scrimDiscordMessages.kind, job.kind),
        eq(scrimDiscordMessages.subjectId, job.subjectId)
    );
}

async function enqueue(tx: Transaction, scrimId: string, kind: BotPublicationKind, subjectId = 'scrim') {
    await tx
        .insert(discordPublicationJobs)
        .values({ scrimId, kind, subjectId, nonce: nonce() })
        .onConflictDoUpdate({
            target: [
                discordPublicationJobs.scrimId,
                discordPublicationJobs.kind,
                discordPublicationJobs.subjectId
            ],
            set: {
                revision: sql`${discordPublicationJobs.revision} + 1`,
                status: sql`case when ${discordPublicationJobs.status} in ('processing', 'uncertain') then ${discordPublicationJobs.status} else 'pending' end`,
                nextAttemptAt: new Date(),
                attempts: sql`case when ${discordPublicationJobs.status} in ('processing', 'uncertain') then ${discordPublicationJobs.attempts} else 0 end`
            }
        });
}

/** 최신 상태가 바뀌면 대기 작업 하나로 합친다. 처리 중·전달 불명 작업의 점유는 훼손하지 않는다. */
export async function enqueueScrimPublications(tx: Transaction, scrimId: string): Promise<void> {
    const [scrim] = await tx.select().from(scrims).where(eq(scrims.id, scrimId));
    if (!scrim) return;
    const [settings] = await tx
        .select()
        .from(guildDiscordSettings)
        .where(eq(guildDiscordSettings.guildId, scrim.guildId));
    const messages = await tx
        .select()
        .from(scrimDiscordMessages)
        .where(eq(scrimDiscordMessages.scrimId, scrimId));
    for (const kind of ['recruitment', 'entry'] as const) {
        const channelId = kind === 'recruitment' ? settings?.recruitmentChannelId : settings?.entryChannelId;
        const needed = kind === 'recruitment' ? scrim.status !== 'cancelled' : READY.includes(scrim.status);
        const [existing] = await tx
            .select()
            .from(discordPublicationJobs)
            .where(and(eq(discordPublicationJobs.scrimId, scrimId), eq(discordPublicationJobs.kind, kind)));
        if (!(channelId && needed) && !messages.some((message) => message.kind === kind) && !existing)
            continue;
        await enqueue(tx, scrimId, kind);
    }
    await enqueueGamePublications(tx, scrimId);
}

/** 저장된 경기만 게시한다. 해제·정정된 대상의 기존 글도 같은 작업으로 정리한다. */
export async function enqueueGamePublications(tx: Transaction, scrimId: string): Promise<void> {
    const [scrim] = await tx.select().from(scrims).where(eq(scrims.id, scrimId));
    if (!scrim) return;
    const [settings] = await tx
        .select()
        .from(guildDiscordSettings)
        .where(eq(guildDiscordSettings.guildId, scrim.guildId));
    const existing = await tx
        .select()
        .from(discordPublicationJobs)
        .where(
            and(
                eq(discordPublicationJobs.scrimId, scrimId),
                inArray(discordPublicationJobs.kind, ['lineup', 'result'])
            )
        );
    const lineups = await tx
        .select({ id: matchLineups.id, confirmedAt: matchLineups.confirmedAt })
        .from(matchLineups)
        .where(eq(matchLineups.scrimId, scrimId));
    const results = await tx
        .select({ id: games.id, status: games.status })
        .from(games)
        .where(eq(games.scrimId, scrimId));
    const keys = new Map<string, { kind: 'lineup' | 'result'; id: string }>();
    for (const job of existing)
        keys.set(job.kind + ':' + job.subjectId, {
            kind: job.kind as 'lineup' | 'result',
            id: job.subjectId
        });
    if (settings?.entryChannelId)
        for (const row of lineups)
            if (row.confirmedAt) keys.set('lineup:' + row.id, { kind: 'lineup', id: row.id });
    if (settings?.resultChannelId)
        for (const row of results)
            if (row.status === 'completed') keys.set('result:' + row.id, { kind: 'result', id: row.id });
    for (const { kind, id } of keys.values()) await enqueue(tx, scrimId, kind, id);
}

/** 운영자가 요청한 선발자에게 내전당 한 번만 안내한다. 단순 상태 변경으로 DM을 생성하지 않는다. */
export async function requestParticipantConfirmations(
    db: Database,
    actor: Actor | null,
    guildId: string,
    scrimId: string,
    input: RevisionInput,
    access?: ScrimAccessDependencies
): Promise<{ queued: number; alreadyRequested: number; skipped: number }> {
    const user = requireUser(actor);
    requireUuid(scrimId, '내전');
    const revision = requireRevision(input.expectedRevision);
    await requireGuildAdmin(user, guildId, { ...access, db });
    return db.transaction(async (tx) => {
        const row = await lockScrim(tx, user, guildId, scrimId, true, revision);
        if (!DM_ALLOWED.includes(row.status))
            throw new DomainError('CONFLICT', '모집 마감 후 진행 중인 내전에서 참가 안내를 보낼 수 있어요');
        const people = await tx
            .select({ userId: scrimParticipants.userId })
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
            );
        const result = { queued: 0, alreadyRequested: 0, skipped: 0 };
        for (const person of people) {
            if (!isDiscordId(person.userId)) {
                result.skipped++;
                continue;
            }
            const created = await tx
                .insert(discordPublicationJobs)
                .values({ scrimId, kind: 'confirmation_dm', subjectId: person.userId, nonce: nonce() })
                .onConflictDoNothing({
                    target: [
                        discordPublicationJobs.scrimId,
                        discordPublicationJobs.kind,
                        discordPublicationJobs.subjectId
                    ]
                })
                .returning({ id: discordPublicationJobs.id });
            if (created.length) result.queued++;
            else result.alreadyRequested++;
        }
        return result;
    });
}

export async function getParticipantConfirmationSummary(db: Database, scrimId: string) {
    const rows = await db
        .select({ status: discordPublicationJobs.status })
        .from(discordPublicationJobs)
        .where(
            and(
                eq(discordPublicationJobs.scrimId, scrimId),
                eq(discordPublicationJobs.kind, 'confirmation_dm')
            )
        );
    const summary = { pending: 0, sent: 0, blocked: 0, uncertain: 0 };
    for (const row of rows) summary[row.status === 'processing' ? 'pending' : row.status]++;
    return summary;
}

/** 채널 설정을 바꾸면 진행 중 내전과 기존 게시물이 있는 내전의 위치도 다시 맞춘다. */
export async function enqueueGuildPublications(tx: Transaction, guildId: string): Promise<void> {
    const rows = await tx
        .select({ id: scrims.id, status: scrims.status })
        .from(scrims)
        .where(eq(scrims.guildId, guildId))
        .orderBy(asc(scrims.id))
        .for('update');
    for (const row of rows) {
        if (['completed', 'ended_early', 'cancelled'].includes(row.status)) {
            const [existing] = await tx
                .select({ id: discordPublicationJobs.id })
                .from(discordPublicationJobs)
                .where(eq(discordPublicationJobs.scrimId, row.id))
                .limit(1);
            const [message] = await tx
                .select({ id: scrimDiscordMessages.messageId })
                .from(scrimDiscordMessages)
                .where(eq(scrimDiscordMessages.scrimId, row.id))
                .limit(1);
            if (!existing && !message) continue;
        }
        await enqueueScrimPublications(tx, row.id);
    }
}

export function publicationChannel(
    kind: BotPublicationKind,
    settings: typeof guildDiscordSettings.$inferSelect | null | undefined
) {
    if (kind === 'confirmation_dm') return null;
    if (kind === 'recruitment') return settings?.recruitmentChannelId ?? null;
    if (kind === 'result') return settings?.resultChannelId ?? null;
    return settings?.entryChannelId ?? null;
}

async function targetFor(tx: Transaction, job: Job) {
    const [row] = await tx
        .select({ guildId: scrims.guildId, status: scrims.status, active: guilds.isActive })
        .from(scrims)
        .innerJoin(guilds, eq(guilds.id, scrims.guildId))
        .where(eq(scrims.id, job.scrimId));
    if (!row) throw new DomainError('NOT_FOUND', '게시 대상 내전을 찾을 수 없어요');
    const [settings] = await tx
        .select()
        .from(guildDiscordSettings)
        .where(eq(guildDiscordSettings.guildId, row.guildId));
    const [message] = await tx.select().from(scrimDiscordMessages).where(messageScope(job));
    const channelId = publicationChannel(job.kind, settings);
    let needed = job.kind === 'recruitment' ? row.status !== 'cancelled' : READY.includes(row.status);
    let waitsForPreviousResult = false;
    if (job.kind === 'lineup') {
        const [lineup] = await tx
            .select({ confirmedAt: matchLineups.confirmedAt, status: matches.status })
            .from(matchLineups)
            .innerJoin(matches, eq(matches.id, matchLineups.matchId))
            .where(and(eq(matchLineups.id, job.subjectId), eq(matchLineups.scrimId, job.scrimId)));
        needed = !!lineup?.confirmedAt && lineup.status !== 'cancelled' && row.status !== 'cancelled';
    } else if (job.kind === 'result') {
        const [game] = await tx
            .select()
            .from(games)
            .where(and(eq(games.id, job.subjectId), eq(games.scrimId, job.scrimId)));
        needed = game?.status === 'completed';
        if (needed && game) {
            const cancelled = await tx
                .select({ id: games.id })
                .from(games)
                .where(
                    and(
                        eq(games.matchId, game.matchId),
                        eq(games.gameNumber, game.gameNumber),
                        eq(games.status, 'cancelled')
                    )
                );
            const ids = cancelled.map((previous) => previous.id);
            if (ids.length) {
                const previousMessages = await tx
                    .select({ id: scrimDiscordMessages.messageId })
                    .from(scrimDiscordMessages)
                    .where(
                        and(
                            eq(scrimDiscordMessages.scrimId, job.scrimId),
                            eq(scrimDiscordMessages.kind, 'result'),
                            inArray(scrimDiscordMessages.subjectId, ids)
                        )
                    )
                    .limit(1);
                const unconfirmed = await tx
                    .select({ id: discordPublicationJobs.id })
                    .from(discordPublicationJobs)
                    .where(
                        and(
                            eq(discordPublicationJobs.scrimId, job.scrimId),
                            eq(discordPublicationJobs.kind, 'result'),
                            inArray(discordPublicationJobs.subjectId, ids),
                            inArray(discordPublicationJobs.status, ['processing', 'uncertain'])
                        )
                    )
                    .limit(1);
                waitsForPreviousResult = previousMessages.length > 0 || unconfirmed.length > 0;
            }
        }
    } else if (job.kind === 'confirmation_dm') {
        const [person] = await tx
            .select({ id: scrimParticipants.id })
            .from(scrimParticipants)
            .innerJoin(
                scrimParticipantRegistrations,
                eq(scrimParticipantRegistrations.scrimParticipantId, scrimParticipants.id)
            )
            .where(
                and(
                    eq(scrimParticipants.scrimId, job.scrimId),
                    eq(scrimParticipants.userId, job.subjectId),
                    eq(scrimParticipantRegistrations.status, 'selected'),
                    isNull(scrimParticipantRegistrations.withdrawnAt)
                )
            );
        needed = !!person && DM_ALLOWED.includes(row.status);
    }
    const desiredChannelId = needed ? (channelId ?? null) : null;
    // 채널 이동은 이전 글을 지운 뒤 새 위치에 게시한다.
    const remove = job.kind !== 'confirmation_dm' && message && message.channelId !== desiredChannelId;
    return {
        ...row,
        needed,
        waitsForPreviousResult,
        recipientId: job.kind === 'confirmation_dm' ? job.subjectId : null,
        desiredChannelId,
        channelId:
            job.kind === 'confirmation_dm'
                ? (message?.channelId ?? null)
                : remove
                  ? message.channelId
                  : desiredChannelId,
        messageId: message?.messageId ?? null,
        operation: remove ? ('delete' as const) : ('upsert' as const)
    };
}

export async function claimPublication(
    db: Database,
    workerId: string,
    now = new Date()
): Promise<BotPublication[]> {
    if (typeof workerId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(workerId))
        throw new DomainError('INVALID_INPUT', '작업자 식별자가 올바르지 않아요');
    return db.transaction(async (tx) => {
        // 전송 성공 여부를 모르는 신규 글은 자동 생성하지 않는다. 알려진 글의 수정·삭제는 재시도할 수 있다.
        await tx
            .update(discordPublicationJobs)
            .set({
                status: sql`case when ${discordPublicationJobs.leaseMessageId} is null and ${discordPublicationJobs.leaseOperation} = 'upsert' then 'uncertain' else 'pending' end`,
                errorCode: 'LEASE_EXPIRED',
                nextAttemptAt: now
            })
            .where(
                and(
                    eq(discordPublicationJobs.status, 'processing'),
                    lte(discordPublicationJobs.leaseUntil, now)
                )
            );
        for (let skipped = 0; skipped < 20; skipped += 1) {
            const [job] = await tx
                .select()
                .from(discordPublicationJobs)
                .where(
                    and(
                        eq(discordPublicationJobs.status, 'pending'),
                        lte(discordPublicationJobs.nextAttemptAt, now)
                    )
                )
                .orderBy(asc(discordPublicationJobs.nextAttemptAt), asc(discordPublicationJobs.id))
                .limit(1)
                .for('update', { skipLocked: true });
            if (!job) return [];
            const target = await targetFor(tx, job);
            if (!target.active) {
                await tx
                    .update(discordPublicationJobs)
                    .set({ status: 'blocked', errorCode: 'GUILD_INACTIVE', ...clearLease })
                    .where(eq(discordPublicationJobs.id, job.id));
                continue;
            }
            if (target.waitsForPreviousResult) {
                // 정정 전 결과 글의 삭제 또는 불명 전송 대조가 끝나기 전에는 새 결과를 만들지 않는다.
                await tx
                    .update(discordPublicationJobs)
                    .set({
                        nextAttemptAt: new Date(now.getTime() + 5000),
                        errorCode: 'PREVIOUS_RESULT_PENDING',
                        ...clearLease
                    })
                    .where(eq(discordPublicationJobs.id, job.id));
                continue;
            }
            if (target.recipientId && !target.needed) {
                await tx
                    .update(discordPublicationJobs)
                    .set({ status: 'blocked', errorCode: 'RECIPIENT_INELIGIBLE', ...clearLease })
                    .where(eq(discordPublicationJobs.id, job.id));
                continue;
            }
            if (!target.channelId && !target.recipientId) {
                await tx
                    .update(discordPublicationJobs)
                    .set({ status: 'sent', errorCode: null, ...clearLease })
                    .where(eq(discordPublicationJobs.id, job.id));
                continue;
            }
            const leaseToken = randomUUID();
            await tx
                .update(discordPublicationJobs)
                .set({
                    status: 'processing',
                    attempts: job.attempts + 1,
                    leaseToken,
                    leaseUntil: new Date(now.getTime() + 90_000),
                    leaseRevision: job.revision,
                    leaseChannelId: target.channelId,
                    leaseMessageId: target.messageId,
                    leaseOperation: target.operation,
                    errorCode: null
                })
                .where(eq(discordPublicationJobs.id, job.id));
            return [
                {
                    id: job.id,
                    guildId: target.guildId,
                    scrimId: job.scrimId,
                    kind: job.kind,
                    subjectId: job.subjectId,
                    revision: job.revision,
                    leaseToken,
                    operation: target.operation,
                    channelId: target.channelId,
                    recipientId: target.recipientId,
                    messageId: target.messageId,
                    nonce: job.nonce,
                    data: {
                        ...(await publicationData(tx, job.scrimId)),
                        ...(['lineup', 'result'].includes(job.kind)
                            ? { match: await matchPublicationData(tx, job) }
                            : {})
                    }
                }
            ];
        }
        return [];
    });
}

export async function completePublication(
    db: Database,
    id: string,
    input: BotPublicationResult,
    now = new Date()
): Promise<void> {
    requireUuid(id, '게시 작업');
    requireUuid(input.leaseToken, '작업 점유');
    if (
        !Number.isSafeInteger(input.revision) ||
        input.revision < 1 ||
        !['sent', 'retry', 'blocked', 'uncertain'].includes(input.outcome)
    )
        throw new DomainError('INVALID_INPUT', '게시 처리 결과가 올바르지 않아요');
    if (input.messageId !== undefined && !isDiscordId(input.messageId))
        throw new DomainError('INVALID_INPUT', '메시지 식별자가 올바르지 않아요');
    if (input.channelId !== undefined && !isDiscordId(input.channelId))
        throw new DomainError('INVALID_INPUT', '메시지 채널 식별자가 올바르지 않아요');
    if (input.errorCode !== undefined && !/^[A-Z0-9_:-]{1,100}$/.test(input.errorCode))
        throw new DomainError('INVALID_INPUT', '오류 코드가 올바르지 않아요');
    if (
        input.retryAfterSeconds !== undefined &&
        (!Number.isFinite(input.retryAfterSeconds) ||
            input.retryAfterSeconds < 0 ||
            input.retryAfterSeconds > 86_400)
    )
        throw new DomainError('INVALID_INPUT', '재시도 시간이 올바르지 않아요');
    const [reference] = await db
        .select({ scrimId: discordPublicationJobs.scrimId })
        .from(discordPublicationJobs)
        .where(eq(discordPublicationJobs.id, id));
    if (!reference) throw new DomainError('NOT_FOUND', '게시 작업을 찾을 수 없어요');
    await db.transaction(async (tx) => {
        // 업무 변경과 같은 내전 → 게시 작업 순서로 잠가 메시지 FK 검사와의 교착을 막는다.
        const [scrim] = await tx
            .select({ id: scrims.id })
            .from(scrims)
            .where(eq(scrims.id, reference.scrimId))
            .for('update');
        if (!scrim) throw new DomainError('NOT_FOUND', '게시 대상 내전을 찾을 수 없어요');
        const [job] = await tx
            .select()
            .from(discordPublicationJobs)
            .where(and(eq(discordPublicationJobs.id, id), eq(discordPublicationJobs.scrimId, scrim.id)))
            .for('update');
        if (!job) throw new DomainError('NOT_FOUND', '게시 작업을 찾을 수 없어요');
        if (
            job.status !== 'processing' ||
            job.leaseToken !== input.leaseToken ||
            job.leaseRevision !== input.revision ||
            !job.leaseUntil ||
            job.leaseUntil <= now
        )
            throw new DomainError('CONFLICT', '게시 작업의 점유가 만료됐어요');
        if (input.outcome === 'sent') {
            if (job.leaseOperation === 'delete') {
                await tx
                    .delete(scrimDiscordMessages)
                    .where(and(messageScope(job), eq(scrimDiscordMessages.messageId, job.leaseMessageId!)));
            } else {
                if (!input.messageId)
                    throw new DomainError('INVALID_INPUT', '게시한 메시지 식별자가 필요해요');
                const channelId =
                    job.kind === 'confirmation_dm'
                        ? (input.channelId ?? job.leaseChannelId)
                        : job.leaseChannelId;
                if (!channelId) throw new DomainError('INVALID_INPUT', '게시한 메시지 채널이 필요해요');
                await tx
                    .insert(scrimDiscordMessages)
                    .values({
                        scrimId: job.scrimId,
                        kind: job.kind,
                        subjectId: job.subjectId,
                        channelId,
                        messageId: input.messageId,
                        publishedRevision: input.revision
                    })
                    .onConflictDoUpdate({
                        target: [
                            scrimDiscordMessages.scrimId,
                            scrimDiscordMessages.kind,
                            scrimDiscordMessages.subjectId
                        ],
                        set: {
                            channelId,
                            messageId: input.messageId,
                            publishedRevision: input.revision
                        }
                    });
            }
            const target = await targetFor(tx, job);
            const again =
                job.revision !== input.revision ||
                (job.leaseOperation === 'delete' && target.desiredChannelId !== null);
            await tx
                .update(discordPublicationJobs)
                .set({
                    status: again ? 'pending' : 'sent',
                    nextAttemptAt: now,
                    attempts: 0,
                    errorCode: null,
                    ...(job.leaseOperation === 'delete' ? { nonce: nonce() } : {}),
                    ...clearLease
                })
                .where(eq(discordPublicationJobs.id, id));
            return;
        }
        const exhausted = input.outcome === 'retry' && job.attempts >= 8;
        const seconds = input.retryAfterSeconds ?? Math.min(300, 2 ** Math.min(job.attempts, 8));
        await tx
            .update(discordPublicationJobs)
            .set({
                status: exhausted ? 'blocked' : input.outcome === 'retry' ? 'pending' : input.outcome,
                errorCode: input.errorCode ?? (exhausted ? 'RETRY_EXHAUSTED' : input.outcome.toUpperCase()),
                nextAttemptAt: new Date(now.getTime() + seconds * 1000),
                // 불명 전송의 대상과 nonce는 운영자가 실제 글과 대조할 때까지 보존한다.
                ...(input.outcome === 'uncertain'
                    ? {
                          leaseToken: null,
                          leaseUntil: null,
                          ...(job.kind === 'confirmation_dm' && input.channelId
                              ? { leaseChannelId: input.channelId }
                              : {})
                      }
                    : clearLease)
            })
            .where(eq(discordPublicationJobs.id, id));
    });
}
