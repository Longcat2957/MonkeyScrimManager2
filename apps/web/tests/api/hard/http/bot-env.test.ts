import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { sveltekit } from '@sveltejs/kit/vite';
import { createServer, type ViteDevServer } from 'vite';

test('HTTP 봇: 개발 서버는 프로세스 변수 없이 .env의 내부 인증 키를 읽는다', async () => {
    const root = fileURLToPath(new URL('../../../../', import.meta.url));
    // 생성 모듈이 프로젝트 의존성을 찾도록 node_modules 아래에서 환경과 산출물을 격리한다.
    const directory = await mkdtemp(join(root, 'node_modules/.msm2-bot-env-test-'));
    const token = randomBytes(32).toString('hex');
    const previous = process.env.BOT_INTERNAL_TOKEN;
    let server: ViteDevServer | undefined;
    delete process.env.BOT_INTERNAL_TOKEN;
    try {
        await writeFile(join(directory, '.env'), `BOT_INTERNAL_TOKEN=${token}\n`);
        server = await createServer({
            root,
            configFile: false,
            // Vite와 SvelteKit의 환경 경로를 모두 격리해 실제 앱의 .env를 읽지 않는다.
            envDir: directory,
            cacheDir: join(directory, 'vite-cache'),
            plugins: [sveltekit({ env: { dir: directory }, outDir: join(directory, 'svelte-kit') })],
            server: { host: '127.0.0.1', port: 0, hmr: false },
            logLevel: 'silent'
        });
        await server.listen();
        const address = server.httpServer?.address();
        assert.ok(address && typeof address === 'object');
        const url = `http://127.0.0.1:${address.port}/internal/bot/reconciliation`;
        for (const [supplied, status, code] of [
            [token, 400, 'INVALID_INPUT'],
            ['wrong-token', 401, 'UNAUTHENTICATED']
        ] as const) {
            const response = await fetch(url, {
                method: 'POST',
                headers: { authorization: `Bearer ${supplied}`, 'content-type': 'application/json' },
                // 인증 뒤 JSON 검증에서 끝나므로 DB와 Discord를 호출하지 않는다.
                body: 'null',
                signal: AbortSignal.timeout(30_000)
            });
            const body = await response.text();
            assert.equal(body.includes(token), false, '응답에 인증 키를 노출하면 안 된다');
            assert.equal(response.status, status);
            assert.equal(JSON.parse(body).error.code, code);
        }
        assert.equal(process.env.BOT_INTERNAL_TOKEN, undefined);
    } finally {
        if (previous === undefined) delete process.env.BOT_INTERNAL_TOKEN;
        else process.env.BOT_INTERNAL_TOKEN = previous;
        try {
            await server?.close();
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    }
});
