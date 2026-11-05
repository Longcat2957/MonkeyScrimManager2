import { Routes } from 'discord.js';
import type { REST } from 'discord.js';
import type { BotPublication, BotPublicationResult } from '../../../../shared/bot-api.js';
import { renderEntry } from '../messages/entry.js';
import { renderRecruitment } from '../messages/recruitment.js';
import { renderMatch } from '../messages/match.js';
import { renderConfirmation } from '../messages/confirmation.js';

export interface DeliveryReceipt {
    messageId: string | null;
    channelId: string | null;
}

export class DeliveryError extends Error {
    constructor(
        public readonly outcome: Exclude<BotPublicationResult['outcome'], 'sent'>,
        public readonly code: string,
        public readonly retryAfterSeconds?: number,
        public channelId?: string
    ) {
        super(code);
    }
}

function failure(error: unknown, creating: boolean): DeliveryError {
    const source = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
    if (source.name === 'RateLimitError' || source.status === 429) {
        const raw =
            source.rawError && typeof source.rawError === 'object'
                ? (source.rawError as Record<string, unknown>)
                : {};
        const delay =
            typeof source.retryAfter === 'number'
                ? source.retryAfter / 1000
                : typeof raw.retry_after === 'number'
                  ? raw.retry_after
                  : 5;
        return new DeliveryError('retry', 'DISCORD_RATE_LIMITED', Math.max(1, Math.ceil(delay)));
    }
    if (typeof source.status === 'number' && source.status >= 400 && source.status < 500) {
        return new DeliveryError(
            'blocked',
            'DISCORD_' + (typeof source.code === 'number' ? source.code : source.status)
        );
    }
    return new DeliveryError(
        creating ? 'uncertain' : 'retry',
        creating ? 'DELIVERY_UNCERTAIN' : 'DISCORD_UNAVAILABLE'
    );
}

function notFound(error: unknown): boolean {
    return !!error && typeof error === 'object' && 'status' in error && error.status === 404;
}

function discordId(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        /^[1-9]\d{0,19}$/.test(value) &&
        BigInt(value) <= 18_446_744_073_709_551_615n
    );
}

export function createDiscordDelivery(rest: Pick<REST, 'get' | 'post' | 'patch' | 'delete'>, origin: URL) {
    return async (publication: BotPublication, deadline = Date.now() + 30_000): Promise<DeliveryReceipt> => {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new DeliveryError('retry', 'DELIVERY_DEADLINE');
        const signal = AbortSignal.timeout(remaining);
        const assertDeadline = () => {
            if (Date.now() >= deadline || signal.aborted)
                throw new DeliveryError('retry', 'DELIVERY_DEADLINE');
        };
        let channelId = publication.channelId;
        if (publication.kind === 'confirmation_dm') {
            if (
                !publication.recipientId ||
                publication.recipientId !== publication.subjectId ||
                publication.operation !== 'upsert'
            )
                throw new DeliveryError('blocked', 'INVALID_DM_RECIPIENT');
            try {
                const member = (await rest.get(
                    Routes.guildMember(publication.guildId, publication.recipientId),
                    { signal }
                )) as { user?: { id?: string } };
                if (member.user?.id !== publication.recipientId)
                    throw new DeliveryError('blocked', 'RECIPIENT_NOT_MEMBER');
                assertDeadline();
                // 같은 수신자의 DM 열기는 기존 채널을 반환하므로 메시지 생성과 달리 재시도할 수 있다.
                const dm = (await rest.post(Routes.userChannels(), {
                    signal,
                    body: { recipient_id: publication.recipientId }
                })) as { id?: string; type?: number; recipients?: { id?: string }[] };
                if (
                    !discordId(dm.id) ||
                    dm.type !== 1 ||
                    dm.recipients?.length !== 1 ||
                    dm.recipients[0]?.id !== publication.recipientId
                )
                    throw new DeliveryError('blocked', 'DM_CHANNEL_MISMATCH');
                if (channelId && channelId !== dm.id)
                    throw new DeliveryError('blocked', 'DM_CHANNEL_MISMATCH');
                channelId = dm.id;
            } catch (error) {
                throw error instanceof DeliveryError ? error : failure(error, false);
            }
        } else
            try {
                if (!channelId) throw new DeliveryError('blocked', 'CHANNEL_MISSING');
                const channel = (await rest.get(Routes.channel(channelId), { signal })) as {
                    guild_id?: string;
                    type?: number;
                };
                if (channel.guild_id !== publication.guildId || ![0, 5].includes(channel.type ?? -1)) {
                    throw new DeliveryError('blocked', 'CHANNEL_MISMATCH');
                }
            } catch (error) {
                if (publication.operation === 'delete' && notFound(error))
                    return { messageId: publication.messageId, channelId };
                throw error instanceof DeliveryError ? error : failure(error, false);
            }
        if (!channelId) throw new DeliveryError('blocked', 'CHANNEL_MISSING');
        if (publication.operation === 'delete') {
            if (!publication.messageId) return { messageId: null, channelId };
            assertDeadline();
            try {
                await rest.delete(Routes.channelMessage(channelId, publication.messageId), {
                    signal
                });
            } catch (error) {
                if (!notFound(error)) throw failure(error, false);
            }
            return { messageId: publication.messageId, channelId };
        }
        let rendered;
        try {
            rendered =
                publication.kind === 'entry'
                    ? renderEntry(publication, origin)
                    : publication.kind === 'confirmation_dm'
                      ? renderConfirmation(publication, origin)
                      : publication.kind === 'lineup' || publication.kind === 'result'
                        ? renderMatch(publication, origin)
                        : renderRecruitment(publication, origin);
        } catch {
            throw new DeliveryError('blocked', 'INVALID_PUBLICATION_DATA');
        }
        const body = {
            flags: rendered.flags,
            components: rendered.components.map((component) => component.toJSON()),
            allowed_mentions: { parse: [] }
        };
        if (publication.messageId) {
            assertDeadline();
            try {
                const message = (await rest.patch(Routes.channelMessage(channelId, publication.messageId), {
                    signal,
                    body: { ...body, content: null, embeds: [], attachments: [] }
                })) as { id: string };
                if (message.id !== publication.messageId)
                    throw new DeliveryError('retry', 'INVALID_MESSAGE_RESPONSE');
                return { messageId: message.id, channelId };
            } catch (error) {
                // 기존 글의 점유 상태에서 새 글까지 보내면 재시작 시 생성 중임을 구별할 수 없다.
                // 글 부재를 확인한 복구 요청으로 저장된 ID를 비운 뒤 새 생성 작업을 점유한다.
                if (notFound(error)) throw new DeliveryError('blocked', 'MESSAGE_MISSING');
                throw error instanceof DeliveryError ? error : failure(error, false);
            }
        }
        assertDeadline();
        try {
            const message = (await rest.post(Routes.channelMessages(channelId), {
                signal,
                body: { ...body, nonce: publication.nonce, enforce_nonce: true }
            })) as { id?: string };
            if (!discordId(message.id)) throw new DeliveryError('uncertain', 'INVALID_MESSAGE_RESPONSE');
            return { messageId: message.id, channelId };
        } catch (error) {
            const failed = error instanceof DeliveryError ? error : failure(error, true);
            failed.channelId = channelId;
            throw failed;
        }
    };
}
