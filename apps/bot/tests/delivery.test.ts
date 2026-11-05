import assert from 'node:assert/strict';
import test from 'node:test';
import type { REST } from 'discord.js';
import type { BotPublicationResult } from '../../../shared/bot-api.js';
import { createDiscordDelivery, DeliveryError } from '../src/delivery/discord.ts';
import { PublicationWorker } from '../src/delivery/worker.ts';
import { BotApiError } from '../src/api/client.ts';
import { GUILD, publication } from './fixtures.ts';

function transport(overrides: Partial<Pick<REST, 'get' | 'post' | 'patch' | 'delete'>> = {}) {
    return {
        get: async () => ({ guild_id: GUILD, type: 0 }),
        post: async () => ({ id: '970000000000000099' }),
        patch: async () => ({ id: '970000000000000099' }),
        delete: async () => undefined,
        ...overrides
    } as Pick<REST, 'get' | 'post' | 'patch' | 'delete'>;
}

test('신규 게시에는 고정 nonce를 전달하고 이후 갱신은 같은 메시지를 편집한다', async () => {
    const calls: string[] = [];
    const rest = transport({
        post: async (_route, options) => {
            const body = options!.body as { nonce: string; enforce_nonce: boolean };
            assert.equal(body.nonce, 'fixture-nonce');
            assert.equal(body.enforce_nonce, true);
            calls.push('create');
            return { id: '970000000000000099' };
        },
        patch: async () => {
            calls.push('edit');
            return { id: '970000000000000099' };
        }
    });
    const deliver = createDiscordDelivery(rest, new URL('https://monkeybot.example'));
    const messageId = await deliver(publication());
    await deliver(publication({ messageId }));
    assert.deepEqual(calls, ['create', 'edit']);
});

test('새 글 전송 중 응답 유실은 중복 전송 가능한 일반 재시도로 바꾸지 않는다', async () => {
    const deliver = createDiscordDelivery(
        transport({
            post: async () => {
                throw new Error('network lost');
            }
        }),
        new URL('https://monkeybot.example')
    );
    await assert.rejects(
        deliver(publication()),
        (error) => error instanceof DeliveryError && error.outcome === 'uncertain'
    );
});

test('기존 글 편집 실패는 동일 메시지 재시도로 복구한다', async () => {
    const deliver = createDiscordDelivery(
        transport({
            patch: async () => {
                throw new Error('network lost');
            }
        }),
        new URL('https://monkeybot.example')
    );
    await assert.rejects(
        deliver(publication({ messageId: '970000000000000099' })),
        (error) => error instanceof DeliveryError && error.outcome === 'retry'
    );
});

test('삭제된 메시지의 삭제 재시도는 성공으로 처리한다', async () => {
    const deliver = createDiscordDelivery(
        transport({
            delete: async () => {
                throw { status: 404 };
            }
        }),
        new URL('https://monkeybot.example')
    );
    assert.equal(
        await deliver(publication({ operation: 'delete', messageId: '970000000000000099' })),
        '970000000000000099'
    );
});

test('Discord 429의 대기 시간을 초 단위로 올림하여 보존한다', async () => {
    const deliver = createDiscordDelivery(
        transport({
            post: async () => {
                throw { name: 'RateLimitError', retryAfter: 2501 };
            }
        }),
        new URL('https://monkeybot.example')
    );
    await assert.rejects(
        deliver(publication()),
        (error) =>
            error instanceof DeliveryError && error.outcome === 'retry' && error.retryAfterSeconds === 3
    );
});

test('권한 없는 채널과 다른 서버 채널에는 생성 요청을 보내지 않는다', async () => {
    let sends = 0;
    const deliver = createDiscordDelivery(
        transport({
            get: async () => ({ guild_id: 'another', type: 0 }),
            post: async () => {
                sends++;
                return {};
            }
        }),
        new URL('https://monkeybot.example')
    );
    await assert.rejects(
        deliver(publication()),
        (error) => error instanceof DeliveryError && error.outcome === 'blocked'
    );
    assert.equal(sends, 0);
});

test('성공 보고가 유실되면 외부 메시지를 다시 보내지 않고 같은 결과만 재보고한다', async () => {
    let deliveries = 0;
    let claims = 0;
    const results: BotPublicationResult[] = [];
    const worker = new PublicationWorker(
        {
            claim: async () => {
                claims++;
                return { publications: [publication()] };
            },
            complete: async (_id, result) => {
                results.push(result);
                if (results.length === 1) throw new Error('ACK lost');
                return { ok: true };
            }
        },
        async () => {
            deliveries++;
            return '970000000000000099';
        }
    );
    await assert.rejects(worker.runOnce());
    assert.equal(worker.health.awaitingAcknowledgement, true);
    await worker.runOnce();
    assert.equal(deliveries, 1);
    assert.equal(claims, 1);
    assert.deepEqual(results[0], results[1]);
    assert.equal(worker.health.awaitingAcknowledgement, false);
});

test('만료된 점유의 성공 보고를 새 작업 성공으로 취급하지 않는다', async () => {
    const worker = new PublicationWorker(
        {
            claim: async () => ({ publications: [publication()] }),
            complete: async () => {
                throw new BotApiError(409, 'STALE_LEASE', '만료');
            }
        },
        async () => '970000000000000099'
    );
    await assert.rejects(worker.runOnce());
    assert.equal(worker.health.errorCode, 'LEASE_EXPIRED');
    assert.equal(worker.health.awaitingAcknowledgement, false);
});

test('Gateway 연결 전에는 게시 작업을 점유하지 않는다', async () => {
    const worker = new PublicationWorker(
        {
            claim: async () => {
                throw new Error('called');
            },
            complete: async () => ({ ok: true })
        },
        async () => null,
        () => false
    );
    assert.equal(await worker.runOnce(), false);
});

test('멈췄던 프로세스가 기한 뒤 재개해도 Discord 요청을 새로 보내지 않는다', async () => {
    let calls = 0;
    const deliver = createDiscordDelivery(
        transport({
            get: async () => {
                calls++;
                return {};
            }
        }),
        new URL('https://monkeybot.example')
    );
    await assert.rejects(
        deliver(publication(), Date.now() - 1),
        (error) => error instanceof DeliveryError && error.code === 'DELIVERY_DEADLINE'
    );
    assert.equal(calls, 0);
});

test('Discord 큐와 실제 요청에 같은 작업 종료 신호를 전달한다', async () => {
    const signals: AbortSignal[] = [];
    const deliver = createDiscordDelivery(
        transport({
            get: async (_route, options) => {
                assert.ok(options?.signal);
                signals.push(options.signal);
                return { guild_id: GUILD, type: 0 };
            },
            post: async (_route, options) => {
                assert.ok(options?.signal);
                signals.push(options.signal);
                return { id: '970000000000000099' };
            }
        }),
        new URL('https://monkeybot.example')
    );
    await deliver(publication());
    assert.equal(signals.length, 2);
    assert.equal(signals[0], signals[1]);
});

test('기존 글이 삭제됐으면 새 생성으로 넘어가지 않고 운영자 복구를 기다린다', async () => {
    let creates = 0;
    const deliver = createDiscordDelivery(
        transport({
            patch: async () => {
                throw { status: 404 };
            },
            post: async () => {
                creates++;
                return { id: '970000000000000099' };
            }
        }),
        new URL('https://monkeybot.example')
    );
    await assert.rejects(
        deliver(publication({ messageId: '970000000000000098' })),
        (error) =>
            error instanceof DeliveryError && error.outcome === 'blocked' && error.code === 'MESSAGE_MISSING'
    );
    assert.equal(creates, 0);
});
