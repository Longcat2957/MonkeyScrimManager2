import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import type {
    BotPublication,
    BotPublicationData,
    BotPublicationResult
} from '../../../../../../shared/bot-api.js';
import type { Database, Transaction } from '../db/types.ts';
import {
    discordPublicationJobs,
    guildDiscordSettings,
    guilds,
    scrimDiscordMessages,
    scrimParticipantPreferences,
    scrimParticipantRegistrations,
    scrimParticipants,
    scrims,
    scrimTeams
} from '../db/schema.ts';
import { DomainError } from '../errors.ts';
import { requireUuid } from '../scrims/validation.ts';
import { isDiscordId } from './client.ts';

type Kind = 'recruitment' | 'entry';
type Job = typeof discordPublicationJobs.$inferSelect;
const READY = ['ready', 'in_progress', 'completed', 'ended_early'];
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
        await tx
            .insert(discordPublicationJobs)
            .values({ scrimId, kind, nonce: nonce() })
            .onConflictDoUpdate({
                target: [discordPublicationJobs.scrimId, discordPublicationJobs.kind],
                set: {
                    revision: sql`${discordPublicationJobs.revision} + 1`,
                    status: sql`case when ${discordPublicationJobs.status} in ('processing', 'uncertain') then ${discordPublicationJobs.status} else 'pending' end`,
                    nextAttemptAt: new Date(),
                    attempts: sql`case when ${discordPublicationJobs.status} in ('processing', 'uncertain') then ${discordPublicationJobs.attempts} else 0 end`
                }
            });
    }
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

async function publicationData(tx: Transaction, scrimId: string): Promise<BotPublicationData> {
    const [row] = await tx.select().from(scrims).where(eq(scrims.id, scrimId));
    if (!row) throw new DomainError('NOT_FOUND', '내전을 찾을 수 없어요');
    const people = await tx
        .select({
            id: scrimParticipants.id,
            name: scrimParticipants.displayName,
            teamId: scrimParticipants.teamId,
            position: scrimParticipants.position,
            status: scrimParticipantRegistrations.status
        })
        .from(scrimParticipantRegistrations)
        .innerJoin(
            scrimParticipants,
            eq(scrimParticipants.id, scrimParticipantRegistrations.scrimParticipantId)
        )
        .where(and(eq(scrimParticipants.scrimId, scrimId), isNull(scrimParticipantRegistrations.withdrawnAt)))
        .orderBy(asc(scrimParticipantRegistrations.joinedAt), asc(scrimParticipantRegistrations.id));
    const ids = people.map((person) => person.id);
    const preferences = ids.length
        ? await tx
              .select()
              .from(scrimParticipantPreferences)
              .where(inArray(scrimParticipantPreferences.scrimParticipantId, ids))
              .orderBy(asc(scrimParticipantPreferences.priority))
        : [];
    const teams = await tx
        .select()
        .from(scrimTeams)
        .where(and(eq(scrimTeams.scrimId, scrimId), eq(scrimTeams.isActive, true)))
        .orderBy(asc(scrimTeams.ordinal));
    return {
        title: row.title,
        status: row.status,
        scheduledAt: row.expectedStartAt?.toISOString() ?? null,
        teamCount: row.teamCount,
        formationMethod: row.formationMethod,
        hardFearless: row.isHardFearless,
        selected: people.filter((person) => person.status === 'selected').length,
        standby: people.filter((person) => person.status === 'standby').length,
        capacity: row.teamCount * 5 + row.reserveCapacity,
        participants: people
            .filter((person) => person.status === 'selected' || person.status === 'standby')
            .map((person) => ({
                name: person.name,
                status: person.status as 'selected' | 'standby',
                positions: preferences
                    .filter((preference) => preference.scrimParticipantId === person.id)
                    .map((preference) => preference.position)
            })),
        teams: teams.map((team) => ({
            name: team.name,
            players: people
                .filter((person) => person.teamId === team.id && person.status === 'selected')
                .map((person) => ({ name: person.name, position: person.position }))
        }))
    };
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
    const [message] = await tx
        .select()
        .from(scrimDiscordMessages)
        .where(and(eq(scrimDiscordMessages.scrimId, job.scrimId), eq(scrimDiscordMessages.kind, job.kind)));
    const channelId = job.kind === 'recruitment' ? settings?.recruitmentChannelId : settings?.entryChannelId;
    const needed = job.kind === 'recruitment' ? row.status !== 'cancelled' : READY.includes(row.status);
    const desiredChannelId = needed ? (channelId ?? null) : null;
    // 채널 이동은 이전 글을 지운 뒤 새 위치에 게시한다.
    const remove = message && message.channelId !== desiredChannelId;
    return {
        ...row,
        desiredChannelId,
        channelId: remove ? message.channelId : desiredChannelId,
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
            if (!target.channelId) {
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
                    revision: job.revision,
                    leaseToken,
                    operation: target.operation,
                    channelId: target.channelId,
                    messageId: target.messageId,
                    nonce: job.nonce,
                    data: await publicationData(tx, job.scrimId)
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
                    .where(
                        and(
                            eq(scrimDiscordMessages.scrimId, job.scrimId),
                            eq(scrimDiscordMessages.kind, job.kind),
                            eq(scrimDiscordMessages.messageId, job.leaseMessageId!)
                        )
                    );
            } else {
                if (!input.messageId)
                    throw new DomainError('INVALID_INPUT', '게시한 메시지 식별자가 필요해요');
                await tx
                    .insert(scrimDiscordMessages)
                    .values({
                        scrimId: job.scrimId,
                        kind: job.kind,
                        channelId: job.leaseChannelId!,
                        messageId: input.messageId,
                        publishedRevision: input.revision
                    })
                    .onConflictDoUpdate({
                        target: [scrimDiscordMessages.scrimId, scrimDiscordMessages.kind],
                        set: {
                            channelId: job.leaseChannelId!,
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
                ...(input.outcome === 'uncertain' ? { leaseToken: null, leaseUntil: null } : clearLease)
            })
            .where(eq(discordPublicationJobs.id, id));
    });
}
