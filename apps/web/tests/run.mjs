import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('../', import.meta.url));
const mode = process.argv[2] ?? 'default';
const extra = process.argv.slice(3);
const scopes = {
    default: ['.', 'api/lite'],
    lite: ['api/lite'],
    hard: ['api/hard/db', 'api/hard/http'],
    'hard:db': ['api/hard/db'],
    'hard:http': ['api/hard/http']
};
if (!Object.hasOwn(scopes, mode))
    throw new Error('테스트 범위는 default, lite, hard, hard:db, hard:http 중 하나여야 합니다.');

const hard = mode.startsWith('hard');
if (hard) {
    try {
        process.loadEnvFile(fileURLToPath(new URL('../.env.test', import.meta.url)));
    } catch (cause) {
        if (cause.code !== 'ENOENT') throw cause;
    }
    if (!process.env.TEST_DATABASE_URL?.trim()) {
        console.error(
            'hard 테스트에는 TEST_DATABASE_URL이 필요합니다. apps/web/.env.test.example을 참고해 .env.test를 설정해 주세요.'
        );
        process.exit(1);
    }
    try {
        const url = new URL(process.env.TEST_DATABASE_URL.trim());
        if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname.length < 2)
            throw new Error();
    } catch {
        console.error('TEST_DATABASE_URL에는 PostgreSQL 프로토콜과 테스트 DB 이름이 필요합니다.');
        process.exit(1);
    }
}

// 실제 키와 앱 DB 주소는 테스트 프로세스로 전달하지 않는다. hard DB helper만 TEST_DATABASE_URL을 소비한다.
const environment = {
    ...process.env,
    DATABASE_URL: '',
    DISCORD_CLIENT_ID: '',
    DISCORD_CLIENT_SECRET: '',
    DISCORD_REDIRECT_URI: '',
    DISCORD_BOT_TOKEN: '',
    RIOT_API_KEY: '',
    BOT_STATUS_URL: '',
    MSM2_ALLOW_TEST_HTTP: mode === 'hard' || mode === 'hard:http' ? '1' : '0'
};
if (!hard) delete environment.TEST_DATABASE_URL;

async function execute(args) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, args, { cwd: webRoot, env: environment, stdio: 'inherit' });
        const forward = (signal) => child.kill(signal);
        const interrupt = () => forward('SIGINT');
        const terminate = () => forward('SIGTERM');
        process.on('SIGINT', interrupt);
        process.on('SIGTERM', terminate);
        const cleanup = () => {
            process.off('SIGINT', interrupt);
            process.off('SIGTERM', terminate);
        };
        child.once('error', (cause) => {
            cleanup();
            reject(cause);
        });
        child.once('exit', (code, signal) => {
            cleanup();
            resolve(code ?? (signal ? 1 : 0));
        });
    });
}

if (mode === 'hard' || mode === 'hard:http') {
    // HTTP hard는 방금 작성한 운영 코드로 매번 빌드한다. 이전 build 디렉터리를 성공 근거로 재사용하지 않는다.
    const result = await execute(['node_modules/vite/bin/vite.js', 'build']);
    if (result !== 0) process.exit(result);
}
const files = [];
for (const scope of scopes[mode]) {
    const directory = new URL(scope + '/', import.meta.url);
    const names = (await readdir(directory)).filter((name) => name.endsWith('.test.ts')).sort();
    if (!names.length) throw new Error('비어 있는 테스트 범위: ' + scope);
    files.push(...names.map((name) => fileURLToPath(new URL(name, directory))));
}
const result = await execute([
    '--experimental-strip-types',
    '--import',
    './tests/api/support/network-guard.mjs',
    '--test',
    '--test-concurrency=2',
    ...extra,
    ...files
]);
process.exitCode = result;
