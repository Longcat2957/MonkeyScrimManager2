import http from 'node:http';

// 이 파일은 HTTP hard 테스트의 자식 프로세스에서만 실행한다. 운영 코드에 테스트 분기를 추가하지 않는다.
const rules = JSON.parse(process.env.MSM2_TEST_UPSTREAMS ?? '[]');
globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const method = (init?.method ?? request.method).toUpperCase();
    const url = new URL(request.url);
    const headers = new Headers(init?.headers ?? request.headers);
    const rule = rules.find(
        (item) =>
            item.method === method &&
            item.url === url.href &&
            (!item.authorization || headers.get('authorization') === item.authorization)
    );
    if (!rule) {
        process.send?.({ type: 'unexpected-upstream', method, path: url.origin + url.pathname });
        throw new Error('등록되지 않은 외부 요청을 차단했습니다.');
    }
    process.send?.({ type: 'upstream', method, path: url.origin + url.pathname });
    return new Response(rule.raw ?? JSON.stringify(rule.body), {
        status: rule.status ?? 200,
        headers: { 'content-type': 'application/json', ...rule.headers }
    });
};

let handler;
const server = http.createServer((request, response) => {
    if (!handler) {
        response.writeHead(503).end();
        return;
    }
    handler(request, response, () => {
        response.writeHead(404).end();
    });
});
server.listen(0, '127.0.0.1', async () => {
    try {
        const address = server.address();
        if (!address || typeof address === 'string')
            throw new Error('테스트 서버 포트를 확인할 수 없습니다.');
        const url = 'http://127.0.0.1:' + address.port;
        // 실제 배포의 TLS 프록시 뒤 HTTP 연결과 같은 구성을 사용해 Secure 쿠키 계약을 유지한다.
        const origin = 'https://127.0.0.1:' + address.port;
        process.env.PROTOCOL_HEADER = 'x-forwarded-proto';
        process.env.DISCORD_REDIRECT_URI = origin + '/auth/discord/callback';
        ({ handler } = await import('../../../build/handler.js'));
        process.send?.({ type: 'ready', url, origin });
    } catch {
        process.send?.({ type: 'startup-error' });
        server.close();
        process.exitCode = 1;
    }
});

function stop() {
    server.closeIdleConnections();
    server.closeAllConnections();
    server.close(() => process.exit(0));
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
process.on('disconnect', stop);
process.on('message', (message) => {
    // 앞선 외부 요청 기록이 부모에게 도착한 다음 HTTP 관찰을 이어가도록 순서를 맞춘다.
    if (message?.type === 'checkpoint') process.send?.({ type: 'checkpoint', id: message.id });
});
