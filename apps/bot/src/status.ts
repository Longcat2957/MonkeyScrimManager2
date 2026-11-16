import { createServer } from 'node:http';
import type { Client } from 'discord.js';
import type { ApiHealth } from './api/client.js';
import type { WorkerHealth } from './delivery/worker.js';

// 백오피스 상태 확인은 기본 loopback, Compose에서는 내부 네트워크에 바인딩한다.
export function startStatusServer(
    client: Client,
    port: number,
    details: () => { api: ApiHealth; delivery: WorkerHealth },
    host = '127.0.0.1'
) {
    const server = createServer((request, response) => {
        if (request.method !== 'GET' || request.url !== '/status') {
            response.writeHead(404).end();
            return;
        }
        const gatewayReady = client.isReady();
        const state = details();
        const fresh = state.api.checkedAt !== null && Date.now() - Date.parse(state.api.checkedAt) <= 30_000;
        const ready = gatewayReady && state.api.connected && fresh;
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(
            JSON.stringify({
                ready,
                gatewayReady,
                // 첫 heartbeat 전에는 discord.js가 -1을 반환한다.
                pingMs: gatewayReady && client.ws.ping >= 0 ? client.ws.ping : null,
                guildCount: gatewayReady ? client.guilds.cache.size : null,
                readyAt: client.readyAt?.toISOString() ?? null,
                ...state
            })
        );
    });
    server.on('error', () => {
        console.error('상태 확인 포트를 열 수 없습니다.');
    });
    server.listen(port, host);
    return server;
}
