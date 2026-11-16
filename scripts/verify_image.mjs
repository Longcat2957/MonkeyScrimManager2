import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [image, ...extra] = process.argv.slice(2);
if (!image || extra.length) throw new Error('사용법: node scripts/verify_image.mjs 이미지');
const root = fileURLToPath(new URL('../', import.meta.url));
const identifier = 'msm2-image-check-' + randomUUID().slice(0, 12);
const label = 'dev.monkeybot.image-check=' + identifier;
const containers = [
    identifier + '-postgres',
    identifier + '-web',
    identifier + '-migrate',
    identifier + '-probe'
];
const temporary = mkdtempSync(join(tmpdir(), identifier + '-'));
const runtimePassword = randomBytes(32).toString('hex');
const migratorPassword = randomBytes(32).toString('hex');
const token = randomBytes(32).toString('hex');
const environment = { ...process.env };
for (const key of Object.keys(environment)) {
    if (/TOKEN|SECRET|DATABASE_URL|RIOT_API_KEY/.test(key)) delete environment[key];
}
const runtimeEnv = join(temporary, 'runtime.env');
const migrationEnv = join(temporary, 'migration.env');
writeFileSync(
    runtimeEnv,
    `DATABASE_URL=postgresql://msm2_runtime:${runtimePassword}@postgres:5432/msm2_main\nBOT_INTERNAL_TOKEN=${token}\nHOST=0.0.0.0\nPORT=3000\nPROTOCOL_HEADER=x-forwarded-proto\n`,
    { mode: 0o600 }
);
writeFileSync(
    migrationEnv,
    `DATABASE_URL=postgresql://msm2_migrator:${migratorPassword}@postgres:5432/msm2_main\n`,
    { mode: 0o600 }
);

function docker(args, options = {}) {
    return execFileSync('docker', args, {
        cwd: root,
        env: { ...environment, ...options.env },
        input: options.input,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 120_000
    }).trim();
}

try {
    const metadata = JSON.parse(docker(['image', 'inspect', image]))[0];
    assert.equal(metadata.Config.User, 'node');
    assert.equal(metadata.Architecture, 'amd64');
    assert.ok(
        !metadata.Config.Env.some((entry) => /^(DATABASE_URL|.*TOKEN|.*SECRET|RIOT_API_KEY)=/.test(entry))
    );
    if (process.env.GITHUB_SHA) {
        assert.equal(metadata.Config.Labels['org.opencontainers.image.revision'], process.env.GITHUB_SHA);
    }
    docker(['network', 'create', '--internal', '--label', label, identifier]);
    docker([
        'run',
        '-d',
        '--name',
        containers[0],
        '--label',
        label,
        '--network',
        identifier,
        '--network-alias',
        'postgres',
        '--tmpfs',
        '/var/lib/postgresql:rw,mode=1777',
        '-e',
        'POSTGRES_USER=msm2_check',
        '-e',
        'POSTGRES_DB=postgres',
        '-e',
        'POSTGRES_HOST_AUTH_METHOD=trust',
        'postgres:18.4-alpine3.23@sha256:996d0920e4ff9df1fc19dacb904492f3c1ec0ec1cc338f0ad7123be7731c5f5e'
    ]);
    const deadline = Date.now() + 30_000;
    while (true) {
        try {
            docker([
                'exec',
                containers[0],
                'pg_isready',
                '-h',
                '127.0.0.1',
                '-U',
                'msm2_check',
                '-d',
                'postgres'
            ]);
            break;
        } catch (cause) {
            if (Date.now() >= deadline) throw cause;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }
    docker(
        [
            'exec',
            '-i',
            '-e',
            'MSM2_RUNTIME_PASSWORD',
            '-e',
            'MSM2_MIGRATOR_PASSWORD',
            containers[0],
            'psql',
            '-h',
            '127.0.0.1',
            '-U',
            'msm2_check',
            '-d',
            'postgres',
            '-Xq',
            '-v',
            'ON_ERROR_STOP=1'
        ],
        {
            env: { MSM2_RUNTIME_PASSWORD: runtimePassword, MSM2_MIGRATOR_PASSWORD: migratorPassword },
            input: readFileSync(join(root, 'deploy/postgres/provision.sql'))
        }
    );
    docker([
        'run',
        '--rm',
        '--name',
        containers[2],
        '--label',
        label,
        '--network',
        identifier,
        '--env-file',
        migrationEnv,
        image,
        'node',
        'node_modules/drizzle-kit/bin.cjs',
        'migrate'
    ]);
    const count = Number(
        docker([
            'exec',
            containers[0],
            'psql',
            '-U',
            'msm2_check',
            '-d',
            'msm2_main',
            '-XAt',
            '-c',
            'SELECT count(*) FROM drizzle.__drizzle_migrations'
        ])
    );
    const journal = JSON.parse(readFileSync(join(root, 'apps/web/drizzle/meta/_journal.json'), 'utf8'));
    assert.equal(count, journal.entries.length);
    console.log(`공통 이미지 migration: ${count}개 적용 확인`);

    docker([
        'run',
        '-d',
        '--name',
        containers[1],
        '--label',
        label,
        '--network',
        identifier,
        '--network-alias',
        'web',
        '--env-file',
        runtimeEnv,
        image
    ]);
    docker(
        [
            'run',
            '--rm',
            '--name',
            containers[3],
            '--label',
            label,
            '-i',
            '--network',
            identifier,
            '--env-file',
            runtimeEnv,
            image,
            'node',
            '--input-type=module'
        ],
        {
            input: String.raw`
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { zstdDecompressSync } from 'node:zlib';
import pg from 'pg';
import { readConfig } from '/app/apps/bot/dist/config.js';

assert.equal(typeof zstdDecompressSync, 'function');
assert.equal(typeof createRequire('/app/apps/bot/package.json')('discord.js').Client, 'function');
for (const path of ['/app/.env.old', '/app/apps/web/.env', '/app/apps/bot/.env']) assert.equal(existsSync(path), false);
const config = readConfig({ DISCORD_TOKEN: 'fixture-only', BOT_INTERNAL_TOKEN: process.env.BOT_INTERNAL_TOKEN, BOT_API_URL: 'http://web:3000', WEB_ORIGIN: 'https://monkeybot.example' });
const deadline = Date.now() + 30_000;
while (true) {
    try {
        assert.equal((await fetch(new URL('/docs', config.apiUrl), { signal: AbortSignal.timeout(3000) })).status, 200);
        break;
    } catch (cause) {
        if (Date.now() >= deadline) throw cause;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}
for (const [supplied, status] of [[config.internalToken, 400], ['wrong-token', 401]]) {
    const response = await fetch(new URL('/internal/bot/reconciliation', config.apiUrl), {
        method: 'POST', headers: { authorization: 'Bearer ' + supplied, 'content-type': 'application/json' }, body: 'null', signal: AbortSignal.timeout(3000)
    });
    assert.equal(response.status, status);
    assert.equal((await response.text()).includes(config.internalToken), false);
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
    await client.connect();
    const result = await client.query("SELECT current_user AS name, has_schema_privilege(current_user, 'public', 'CREATE') AS ddl");
    assert.equal(result.rows[0].name, 'msm2_runtime');
    assert.equal(result.rows[0].ddl, false);
    assert.equal((await client.query('SELECT count(*) FROM public.users')).rows[0].count, '0');
} finally {
    await client.end();
}
`
        }
    );
    console.log('공통 이미지 웹·봇 구성·내부 인증·런타임 DB 권한·ROFL 런타임 확인');
    docker(['stop', '--time', '35', containers[1]]);
    const stopped = JSON.parse(docker(['inspect', containers[1]]))[0];
    assert.equal(stopped.State.ExitCode, 0);
    console.log('웹 SIGTERM 정상 종료 확인');
} finally {
    for (const name of containers.reverse()) {
        let metadata;
        try {
            metadata = JSON.parse(docker(['inspect', name]))[0];
        } catch {
            continue;
        }
        assert.equal(metadata.Config.Labels['dev.monkeybot.image-check'], identifier);
        docker(['rm', '-f', '-v', name]);
    }
    try {
        const network = JSON.parse(docker(['network', 'inspect', identifier]))[0];
        assert.equal(network.Labels['dev.monkeybot.image-check'], identifier);
        docker(['network', 'rm', identifier]);
    } finally {
        rmSync(temporary, { recursive: true, force: true });
    }
}
