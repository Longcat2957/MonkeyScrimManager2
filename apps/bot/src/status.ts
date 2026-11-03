import { createServer } from 'node:http';
import type { Client } from 'discord.js';

// 백오피스의 서비스 상태 확인용이다. 같은 서버 안에서만 읽도록 127.0.0.1에만 연다.
export function startStatusServer(client: Client, port: number) {
  const server = createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/status') {
      response.writeHead(404).end();
      return;
    }
    const ready = client.isReady();
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({
      ready,
      // 첫 heartbeat 전에는 discord.js가 -1을 준다.
      pingMs: ready && client.ws.ping >= 0 ? client.ws.ping : null,
      guildCount: ready ? client.guilds.cache.size : null,
      readyAt: client.readyAt?.toISOString() ?? null
    }));
  });
  server.on('error', (error) => {
    console.error('상태 확인 서버 오류:', error);
  });
  server.listen(port, '127.0.0.1');
  return server;
}
