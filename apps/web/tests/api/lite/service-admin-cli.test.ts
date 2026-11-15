import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('../../../', import.meta.url));
const run = (...args: string[]) =>
    spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/bootstrap-admin.mts', ...args], {
        cwd: webRoot,
        env: {
            ...process.env,
            DATABASE_URL: 'invalid-database-url',
            DISCORD_BOT_TOKEN: '',
            RIOT_API_KEY: ''
        },
        encoding: 'utf8',
        timeout: 5_000,
        maxBuffer: 65_536
    });

test('초기 지정 CLI의 도움말과 잘못된 인수는 DB 연결 전에 처리한다', () => {
    const help = run('--help');
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /사용법: pnpm admin:bootstrap/);
    for (const args of [[], ['bad-id'], ['1', '2']]) {
        const invalid = run(...args);
        assert.equal(invalid.status, 1);
        assert.match(invalid.stderr, /사용법: pnpm admin:bootstrap/);
        assert.equal(invalid.stderr.includes('invalid-database-url'), false);
    }
});
