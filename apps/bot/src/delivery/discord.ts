import { Routes } from 'discord.js';
import type { REST } from 'discord.js';
import type { BotPublication, BotPublicationResult } from '../../../../shared/bot-api.js';
import { renderEntry } from '../messages/entry.js';
import { renderRecruitment } from '../messages/recruitment.js';

export class DeliveryError extends Error {
    constructor(
        public readonly outcome: Exclude<BotPublicationResult['outcome'], 'sent'>,
        public readonly code: string,
        public readonly retryAfterSeconds?: number
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

export function createDiscordDelivery(rest: Pick<REST, 'get' | 'post' | 'patch' | 'delete'>, origin: URL) {
    return async (publication: BotPublication, deadline = Date.now() + 30_000): Promise<string | null> => {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new DeliveryError('retry', 'DELIVERY_DEADLINE');
        const signal = AbortSignal.timeout(remaining);
        const assertDeadline = () => {
            if (Date.now() >= deadline || signal.aborted)
                throw new DeliveryError('retry', 'DELIVERY_DEADLINE');
        };
        try {
            const channel = (await rest.get(Routes.channel(publication.channelId), { signal })) as {
                guild_id?: string;
                type?: number;
            };
            if (channel.guild_id !== publication.guildId || ![0, 5].includes(channel.type ?? -1)) {
                throw new DeliveryError('blocked', 'CHANNEL_MISMATCH');
            }
        } catch (error) {
            if (publication.operation === 'delete' && notFound(error)) return publication.messageId;
            throw error instanceof DeliveryError ? error : failure(error, false);
        }
        if (publication.operation === 'delete') {
            if (!publication.messageId) return null;
            assertDeadline();
            try {
                await rest.delete(Routes.channelMessage(publication.channelId, publication.messageId), {
                    signal
                });
            } catch (error) {
                if (!notFound(error)) throw failure(error, false);
            }
            return publication.messageId;
        }
        const rendered =
            publication.kind === 'entry'
                ? renderEntry(publication, origin)
                : renderRecruitment(publication, origin);
        const body = {
            flags: rendered.flags,
            components: rendered.components.map((component) => component.toJSON()),
            allowed_mentions: { parse: [] }
        };
        if (publication.messageId) {
            assertDeadline();
            try {
                const message = (await rest.patch(
                    Routes.channelMessage(publication.channelId, publication.messageId),
                    {
                        signal,
                        body: { ...body, content: null, embeds: [], attachments: [] }
                    }
                )) as { id: string };
                return message.id;
            } catch (error) {
                // 기존 글의 점유 상태에서 새 글까지 보내면 재시작 시 생성 중임을 구별할 수 없다.
                // 글 부재를 확인한 복구 요청으로 저장된 ID를 비운 뒤 새 생성 작업을 점유한다.
                if (notFound(error)) throw new DeliveryError('blocked', 'MESSAGE_MISSING');
                throw failure(error, false);
            }
        }
        assertDeadline();
        try {
            const message = (await rest.post(Routes.channelMessages(publication.channelId), {
                signal,
                body: { ...body, nonce: publication.nonce, enforce_nonce: true }
            })) as { id?: string };
            if (!message.id) throw new DeliveryError('uncertain', 'INVALID_MESSAGE_RESPONSE');
            return message.id;
        } catch (error) {
            throw error instanceof DeliveryError ? error : failure(error, true);
        }
    };
}
