import assert from 'node:assert/strict';
import { once } from 'node:events';
import { get } from 'node:http';
import test from 'node:test';
import type { Client } from 'discord.js';
import { startStatusServer } from '../src/status.ts';
import type { ApiHealth } from '../src/api/client.ts';

test('상태 서버는 Gateway만 연결된 상태와 실제 업무 연결 준비를 구분한다', async (t) => {
    const client = {
        isReady: () => true,
        ws: { ping: 20 },
        guilds: { cache: { size: 1 } },
        readyAt: new Date()
    } as unknown as Client;
    const api: ApiHealth = {
        connected: false,
        checkedAt: new Date().toISOString(),
        errorCode: 'UNAUTHENTICATED'
    };
    const server = startStatusServer(client, 0, () => ({
        api,
        delivery: { running: true, lastSuccessAt: null, errorCode: null, awaitingAcknowledgement: false }
    }));
    t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    assert.equal(address.address, '127.0.0.1');
    const request = () =>
        new Promise<Record<string, unknown>>((resolve, reject) => {
            get(`http://127.0.0.1:${address.port}/status`, (response) => {
                assert.equal(response.headers['cache-control'], 'no-store');
                let body = '';
                response.on('data', (part) => {
                    body += part;
                });
                response.on('end', () => resolve(JSON.parse(body)));
                response.on('error', reject);
            }).on('error', reject);
        });
    const initial = await request();
    assert.equal(initial.gatewayReady, true);
    assert.equal(initial.ready, false);
    api.connected = true;
    api.errorCode = null;
    assert.equal((await request()).ready, true);
    api.checkedAt = new Date(Date.now() - 31_000).toISOString();
    assert.equal((await request()).ready, false);
});
