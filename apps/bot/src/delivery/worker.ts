import { randomUUID } from 'node:crypto';
import type { BotPublication, BotPublicationResult } from '../../../../shared/bot-api.js';
import type { BotApi } from '../api/client.js';
import { BotApiError, errorCode } from '../api/client.js';
import { DeliveryError, type DeliveryReceipt } from './discord.js';

export interface WorkerHealth {
    running: boolean;
    lastSuccessAt: string | null;
    errorCode: string | null;
    awaitingAcknowledgement: boolean;
}

export class PublicationWorker {
    readonly health: WorkerHealth = {
        running: false,
        lastSuccessAt: null,
        errorCode: null,
        awaitingAcknowledgement: false
    };
    private readonly id = randomUUID();
    private stopped = false;
    private loop: Promise<void> | null = null;
    private wake: (() => void) | null = null;
    private pending: { publication: BotPublication; result: BotPublicationResult } | null = null;
    constructor(
        private readonly api: Pick<BotApi, 'claim' | 'complete'>,
        private readonly deliver: (publication: BotPublication, deadline: number) => Promise<DeliveryReceipt>,
        private readonly ready: () => boolean = () => true
    ) {}

    async runOnce(): Promise<boolean> {
        if (!this.ready()) return false;
        if (this.pending) {
            await this.acknowledge();
            return true;
        }
        // 서버 점유 90초보다 짧게 제한하며 claim 응답 대기도 이 시간에 포함한다.
        const deadline = Date.now() + 30_000;
        const { publications } = await this.api.claim(this.id);
        if (publications.length > 1) throw new Error('게시 작업은 한 번에 하나만 점유해야 합니다.');
        const publication = publications[0];
        if (!publication) return false;
        let result: BotPublicationResult;
        try {
            if (Date.now() >= deadline) throw new DeliveryError('retry', 'DELIVERY_DEADLINE');
            const { messageId, channelId } = await this.deliver(publication, deadline);
            result = {
                leaseToken: publication.leaseToken,
                revision: publication.revision,
                outcome: 'sent',
                ...(messageId ? { messageId } : {}),
                ...(channelId ? { channelId } : {})
            };
        } catch (error) {
            const failed =
                error instanceof DeliveryError ? error : new DeliveryError('uncertain', 'DELIVERY_UNCERTAIN');
            result = {
                leaseToken: publication.leaseToken,
                revision: publication.revision,
                outcome: failed.outcome,
                errorCode: failed.code,
                ...(failed.channelId ? { channelId: failed.channelId } : {}),
                ...(failed.retryAfterSeconds ? { retryAfterSeconds: failed.retryAfterSeconds } : {})
            };
        }
        // 성공 보고가 유실돼도 같은 프로세스에서는 이미 전송한 글을 다시 생성하지 않는다.
        this.pending = { publication, result };
        this.health.awaitingAcknowledgement = true;
        await this.acknowledge();
        return true;
    }

    private async acknowledge() {
        const pending = this.pending!;
        try {
            await this.api.complete(pending.publication.id, pending.result);
            if (pending.result.outcome === 'sent') this.health.lastSuccessAt = new Date().toISOString();
            this.health.errorCode =
                pending.result.outcome === 'sent' ? null : (pending.result.errorCode ?? 'DELIVERY_FAILED');
            this.pending = null;
            this.health.awaitingAcknowledgement = false;
        } catch (error) {
            if (error instanceof BotApiError && [404, 409].includes(error.status)) {
                this.pending = null;
                this.health.awaitingAcknowledgement = false;
                this.health.errorCode = 'LEASE_EXPIRED';
            }
            throw error;
        }
    }

    start() {
        if (this.loop) return;
        this.health.running = true;
        this.loop = (async () => {
            while (!this.stopped) {
                let worked = false;
                try {
                    worked = await this.runOnce();
                } catch (error) {
                    this.health.errorCode = errorCode(error);
                    console.error('게시 작업 처리 실패:', this.health.errorCode);
                }
                if (!this.stopped)
                    await new Promise<void>((resolve) => {
                        const timer = setTimeout(
                            () => {
                                this.wake = null;
                                resolve();
                            },
                            worked ? 200 : 2000
                        );
                        this.wake = () => {
                            clearTimeout(timer);
                            this.wake = null;
                            resolve();
                        };
                    });
            }
            this.health.running = false;
        })();
    }

    async stop() {
        this.stopped = true;
        this.wake?.();
        await this.loop;
    }
}
