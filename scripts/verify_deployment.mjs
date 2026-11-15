#!/usr/bin/env node
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile, mkdtemp, mkdir, rm, stat, access } from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import { dirname, join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import http from 'node:http';
import https from 'node:https';

const root = fileURLToPath(new URL('../', import.meta.url));
const web = join(root, 'apps/web');
const [option, reportPath, ...extra] = process.argv.slice(2);
if (extra.length || (option && (option !== '--report' || !reportPath))) {
    console.error('사용법: node scripts/verify_deployment.mjs [--report 결과.json]');
    process.exit(1);
}
const identifier = 'msm2-deploy-check-' + randomUUID().slice(0, 12);
const label = 'dev.monkeybot.validation=' + identifier;
const containers = [identifier + '-postgres', identifier + '-nginx'];
const temporary = await mkdtemp(join(tmpdir(), identifier + '-'));
const environment = { ...process.env };
for (const key of Object.keys(environment)) {
    if (/TOKEN|SECRET|DATABASE_URL|RIOT_API_KEY/.test(key) || key.startsWith('PG')) delete environment[key];
}
Object.assign(environment, {
    DATABASE_URL: '',
    DISCORD_CLIENT_ID: '',
    DISCORD_CLIENT_SECRET: '',
    DISCORD_REDIRECT_URI: '',
    DISCORD_BOT_TOKEN: '',
    BOT_INTERNAL_TOKEN: '',
    RIOT_API_KEY: '',
    BOT_STATUS_URL: ''
});
delete environment.NODE_OPTIONS;

const result = {
    startedAt: new Date().toISOString(),
    node: process.version,
    scope: '직접 만든 임시 PostgreSQL·nginx와 기존 production build의 로컬 검사',
    containers,
    label,
    stages: [],
    limits: [
        '실제 운영 서비스·DB·계정·토큰·인증서를 사용하지 않는다.',
        '로컬 자체 서명 인증서 검사는 공인 인증서 발급·갱신이나 실제 VPS 설정의 검증이 아니다.',
        'systemd는 렌더링한 예제의 정적 검사만 하며 서비스를 시작하지 않는다.',
        'GitHub Actions 원격 실행·실제 Discord·물리 기기는 이 검사 범위에 없다.'
    ]
};
let app;
let interrupted = false;
let activeStage;
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
        interrupted = true;
        app?.kill('SIGTERM');
    });
}

async function command(program, args, options = {}) {
    return new Promise((resolvePromise, reject) => {
        const child = spawn(program, args, {
            cwd: options.cwd ?? root,
            env: options.env ?? environment,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        let output = '';
        let errors = '';
        child.stdout.on('data', (chunk) => (output += chunk));
        child.stderr.on('data', (chunk) => (errors += chunk));
        child.stdin.on('error', () => {});
        child.stdin.end(options.input);
        const timer = setTimeout(() => child.kill('SIGKILL'), options.timeout ?? 120_000);
        child.once('error', () => {
            clearTimeout(timer);
            reject(new Error(program + ' 실행 파일을 확인해 주세요.'));
        });
        child.once('close', (code) => {
            clearTimeout(timer);
            resolvePromise({ code, output, errors });
        });
    });
}

async function succeed(program, args, options = {}) {
    const reply = await command(program, args, options);
    assert.equal(reply.code, 0, options.description ?? program + ' 실행 실패');
    return reply.output.trim();
}

async function stage(name, run) {
    if (interrupted) throw new Error('검사를 중단했습니다.');
    activeStage = name;
    const started = performance.now();
    await run();
    result.stages.push({ name, passed: true, durationMs: Math.round(performance.now() - started) });
    console.log(name + ': 통과');
}

async function freePort() {
    const server = createServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = server.address().port;
    await new Promise((resolvePromise) => server.close(resolvePromise));
    return port;
}

function request(protocol, port, path, headers = {}, method = 'GET', ca) {
    return new Promise((resolvePromise, reject) => {
        const outgoing = protocol.request(
            {
                hostname: '127.0.0.1',
                port,
                path,
                method,
                headers: { Host: 'monkeybot.example', ...headers },
                ca,
                servername: 'monkeybot.example',
                timeout: 5000
            },
            (response) => {
                response.resume();
                response.once('end', () =>
                    resolvePromise({ status: response.statusCode, location: response.headers.location })
                );
            }
        );
        outgoing.once('error', reject);
        outgoing.once('timeout', () => outgoing.destroy(new Error('로컬 응답 시간 초과')));
        outgoing.end();
    });
}

async function waitFor(check) {
    const until = Date.now() + 30_000;
    while (Date.now() < until) {
        if (interrupted) throw new Error('검사를 중단했습니다.');
        try {
            if (await check()) return;
        } catch {}
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    }
    throw new Error('격리 서비스가 제한 시간 안에 준비되지 않았습니다.');
}

const sourceDatabase = 'msm2_deployment_source';
const targetDatabase = 'msm2_deployment_restore';
async function sql(database, text) {
    return succeed(
        'docker',
        [
            'exec',
            '-i',
            containers[0],
            'psql',
            '-U',
            'msm2_check',
            '-d',
            database,
            '-XAt',
            '-v',
            'ON_ERROR_STOP=1'
        ],
        { input: text }
    );
}

function quoted(identifier) {
    return '"' + identifier.replaceAll('"', '""') + '"';
}

async function snapshot(database) {
    const tables = JSON.parse(
        await sql(
            database,
            `select coalesce(json_agg(t order by n, r), '[]') from (
        select n.nspname as n, c.relname as r, c.relkind as k from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname !~ '^pg_' and n.nspname <> 'information_schema' and c.relkind in ('r', 'S')
    ) t;`
        )
    );
    const rows = [];
    for (const table of tables) {
        const relation = quoted(table.n) + '.' + quoted(table.r);
        const digest =
            table.k === 'S'
                ? await sql(
                      database,
                      `select row_to_json(t)::text from (select last_value, is_called from ${relation}) t;`
                  )
                : await sql(
                      database,
                      `select md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by to_jsonb(t)::text), '')) from ${relation} t;`
                  );
        rows.push({ ...table, digest });
    }
    const constraints = JSON.parse(
        await sql(
            database,
            `select coalesce(json_agg(t order by n, r, c), '[]') from (
        select n.nspname n, r.relname r, c.conname c, pg_get_constraintdef(c.oid, true) d
        from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace
        where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
    ) t;`
        )
    );
    return { rows, constraints };
}

try {
    await stage('도구·운영 빌드 확인', async () => {
        await access(join(web, 'build/index.js'));
        await access(join(root, 'apps/bot/dist/index.js'));
        result.docker = await succeed('docker', ['version', '--format', '{{.Server.Version}}']);
        await succeed('openssl', ['version']);
        await succeed('systemd-analyze', ['--version']);
        result.nodeMajor = Number(process.versions.node.split('.')[0]);
        assert.ok(result.nodeMajor >= 24, '검증 도구는 검증된 Node 24 이상을 사용합니다.');
        result.files = [];
        for (const path of [
            '.github/workflows/ci.yml',
            'deploy/monkeybot-web.service.example',
            'deploy/monkeybot-bot.service.example',
            'deploy/nginx.conf.example',
            'deploy/nginx-internal.conf.example',
            'scripts/database_backup.mjs',
            'scripts/verify_deployment.mjs',
            'apps/web/build/handler.js',
            'apps/web/build/server/index.js'
        ]) {
            result.files.push({
                path,
                sha256: createHash('sha256')
                    .update(await readFile(join(root, path)))
                    .digest('hex')
            });
        }
    });

    await stage('systemd 예제 정적 검사', async () => {
        for (const kind of ['web', 'bot']) {
            const source = await readFile(join(root, `deploy/monkeybot-${kind}.service.example`), 'utf8');
            const rendered = source
                .replace('User=monkeybot', 'User=' + userInfo().uid)
                .replace('Group=monkeybot', 'Group=' + userInfo().gid)
                .replace('/srv/monkeybot/current', root.replace(/\/$/, ''))
                .replace('/usr/bin/node', process.execPath)
                .replace(`/etc/monkeybot/${kind}.env`, join(temporary, kind + '.env'));
            await writeFile(join(temporary, kind + '.env'), '', { mode: 0o600 });
            await writeFile(join(temporary, `monkeybot-${kind}.service`), rendered);
        }
        await succeed('systemd-analyze', [
            'verify',
            '--man=no',
            join(temporary, 'monkeybot-web.service'),
            join(temporary, 'monkeybot-bot.service')
        ]);
    });

    let sourceUrl;
    let targetUrl;
    const executableDirectory = join(temporary, 'bin');
    await stage('직접 만든 PostgreSQL·실제 migration 준비', async () => {
        await succeed('docker', [
            'run',
            '-d',
            '--name',
            containers[0],
            '--label',
            label,
            '--tmpfs',
            '/var/lib/postgresql/data:rw,mode=0700',
            '-p',
            '127.0.0.1::5432',
            '-e',
            'POSTGRES_USER=msm2_check',
            '-e',
            'POSTGRES_DB=' + sourceDatabase,
            '-e',
            'POSTGRES_HOST_AUTH_METHOD=trust',
            'postgres:17-bookworm'
        ]);
        await waitFor(
            async () =>
                (
                    await command('docker', [
                        'exec',
                        containers[0],
                        'pg_isready',
                        '-U',
                        'msm2_check',
                        '-d',
                        sourceDatabase
                    ])
                ).code === 0
        );
        const address = await succeed('docker', ['port', containers[0], '5432/tcp']);
        assert.match(address, /^127\.0\.0\.1:\d+$/);
        sourceUrl = `postgresql://msm2_check@${address}/${sourceDatabase}`;
        targetUrl = `postgresql://msm2_check@${address}/${targetDatabase}`;
        await succeed(process.execPath, ['node_modules/drizzle-kit/bin.cjs', 'migrate'], {
            cwd: web,
            env: { ...environment, DATABASE_URL: sourceUrl }
        });
        const journal = JSON.parse(await readFile(join(web, 'drizzle/meta/_journal.json'), 'utf8'));
        result.migrations = [];
        for (const entry of journal.entries) {
            const bytes = await readFile(join(web, 'drizzle', entry.tag + '.sql'));
            result.migrations.push({
                tag: entry.tag,
                sha256: createHash('sha256').update(bytes).digest('hex')
            });
        }
        await sql(
            sourceDatabase,
            `create schema msm2_deploy_probe;
            create table msm2_deploy_probe.parent (id bigint primary key, label text not null, nullable_text text, exact_number numeric not null);
            create table msm2_deploy_probe.child (id bigint generated always as identity primary key, parent_id bigint not null references msm2_deploy_probe.parent(id));
            insert into msm2_deploy_probe.parent values (9007199254740991, '격리 복원 검증 Ω', null, 1500.123456789);
            insert into msm2_deploy_probe.child(parent_id) values (9007199254740991), (9007199254740991);`
        );
        await succeed('docker', ['exec', containers[0], 'createdb', '-U', 'msm2_check', targetDatabase]);
        await mkdir(executableDirectory);
        // 호스트 PostgreSQL CLI 대신 이 검사가 소유한 컨테이너의 같은 버전 CLI를 사용한다.
        for (const tool of ['pg_dump', 'pg_restore', 'psql']) {
            await writeFile(
                join(executableDirectory, tool),
                `#!/bin/sh\nexec docker exec -i --env PGDATABASE --env PGUSER --env PGPASSWORD --env PGSSLMODE --env PGCONNECT_TIMEOUT --env PGAPPNAME --env PGCLIENTENCODING --env PGHOST=127.0.0.1 --env PGPORT=5432 ${containers[0]} ${tool} "$@"\n`,
                { mode: 0o700 }
            );
        }
    });

    await stage('전용 백업·빈 DB 복원·거절 경로', async () => {
        const tool = join(root, 'scripts/database_backup.mjs');
        const file = join(temporary, 'verification.dump');
        const ownEnvironment = {
            ...environment,
            PATH: executableDirectory + delimiter + environment.PATH,
            MSM2_BACKUP_DATABASE_URL: sourceUrl,
            MSM2_RESTORE_DATABASE_URL: targetUrl
        };
        const before = await snapshot(sourceDatabase);
        await succeed(process.execPath, [tool, 'backup', file], { env: ownEnvironment });
        assert.equal((await stat(file)).mode & 0o777, 0o600);
        assert.equal((await stat(file + '.sha256')).mode & 0o777, 0o600);
        const refused = async (args, env, phrase) => {
            const reply = await command(process.execPath, [tool, ...args], { env });
            assert.equal(reply.code, 1);
            assert.ok(reply.errors.includes(phrase));
        };
        await refused(['backup', file], ownEnvironment, '이미 있습니다');
        await refused(['restore', file], ownEnvironment, '--confirm-empty-database');
        await refused(
            ['restore', file, '--confirm-empty-database'],
            { ...ownEnvironment, MSM2_RESTORE_DATABASE_URL: sourceUrl },
            '비어 있지 않습니다'
        );
        const checksum = await readFile(file + '.sha256', 'utf8');
        await writeFile(file + '.sha256', '0'.repeat(64));
        await refused(['restore', file, '--confirm-empty-database'], ownEnvironment, 'SHA256');
        await writeFile(file + '.sha256', checksum);
        await succeed(process.execPath, [tool, 'restore', file, '--confirm-empty-database'], {
            env: ownEnvironment
        });
        assert.deepEqual(await snapshot(targetDatabase), before);
        await refused(['restore', file, '--confirm-empty-database'], ownEnvironment, '비어 있지 않습니다');
        const failedFile = join(temporary, 'failed.dump');
        await refused(
            ['backup', failedFile],
            {
                ...ownEnvironment,
                MSM2_BACKUP_DATABASE_URL: sourceUrl.replace(sourceDatabase, 'msm2_missing_database')
            },
            'pg_dump'
        );
        await assert.rejects(access(failedFile));
        await assert.rejects(access(failedFile + '.sha256'));
        assert.deepEqual(await snapshot(sourceDatabase), before);
        result.backup = {
            applicationTables: before.rows.filter((row) => row.n === 'public' && row.k === 'r').length,
            allTables: before.rows.filter((row) => row.k === 'r').length,
            foreignKeys: before.constraints.filter((constraint) => constraint.d.startsWith('FOREIGN KEY'))
                .length,
            allConstraints: before.constraints.length,
            archiveBytes: (await stat(file)).size,
            completeSnapshotEqual: true,
            verified: [
                '모든 테이블 행 hash·제약·sequence 상태 일치',
                'Unicode·null·정밀 숫자·큰 정수·FK 보존',
                '파일과 SHA256 권한 0600',
                '기존 파일 덮어쓰기 거절',
                '명시적 복원 확인 필요',
                '기존 DB 복원 거절',
                'SHA256 불일치 거절',
                '실패 백업 파일 제거',
                '원본 격리 DB 무변경'
            ]
        };
    });

    await stage('실제 운영 앱·로컬 TLS 프록시', async () => {
        const appPort = await freePort();
        const httpPort = await freePort();
        const httpsPort = await freePort();
        app = spawn(
            process.execPath,
            ['--import', './tests/api/support/network-guard.mjs', 'build/index.js'],
            {
                cwd: web,
                env: {
                    ...environment,
                    DATABASE_URL: sourceUrl,
                    HOST: '127.0.0.1',
                    PORT: String(appPort),
                    BODY_SIZE_LIMIT: '70M',
                    PROTOCOL_HEADER: 'x-forwarded-proto',
                    SHUTDOWN_TIMEOUT: '3',
                    MSM2_ALLOW_TEST_HTTP: '1'
                },
                stdio: 'ignore'
            }
        );
        await waitFor(async () => (await request(http, appPort, '/docs')).status === 200);
        await succeed('openssl', [
            'req',
            '-x509',
            '-newkey',
            'rsa:2048',
            '-nodes',
            '-days',
            '1',
            '-subj',
            '/CN=monkeybot.example',
            '-addext',
            'subjectAltName=DNS:monkeybot.example',
            '-keyout',
            join(temporary, 'key.pem'),
            '-out',
            join(temporary, 'cert.pem')
        ]);
        let site = await readFile(join(root, 'deploy/nginx.conf.example'), 'utf8');
        site = site
            .replace('listen 80;', `listen 127.0.0.1:${httpPort};`)
            .replace('listen 443 ssl;', `listen 127.0.0.1:${httpsPort} ssl;`)
            .replace('/etc/letsencrypt/live/monkeybot.example/fullchain.pem', '/check/cert.pem')
            .replace('/etc/letsencrypt/live/monkeybot.example/privkey.pem', '/check/key.pem')
            .replace('/etc/nginx/snippets/monkeybot-internal.conf', '/check/proxy.conf')
            .replace('/var/log/nginx/monkeybot-error.log', '/dev/stderr');
        const proxy = (await readFile(join(root, 'deploy/nginx-internal.conf.example'), 'utf8')).replaceAll(
            '127.0.0.1:3000',
            '127.0.0.1:' + appPort
        );
        await writeFile(join(temporary, 'site.conf'), site);
        await writeFile(join(temporary, 'proxy.conf'), proxy);
        await writeFile(
            join(temporary, 'nginx.conf'),
            'pid /tmp/nginx.pid;\nevents {}\nhttp { access_log off; error_log /dev/stderr warn; include /check/site.conf; }\n'
        );
        await succeed('docker', [
            'run',
            '-d',
            '--name',
            containers[1],
            '--label',
            label,
            '--network',
            'host',
            '--read-only',
            '--tmpfs',
            '/var/cache/nginx',
            '--tmpfs',
            '/tmp',
            '--mount',
            `type=bind,src=${temporary},dst=/check,readonly`,
            '--entrypoint',
            'nginx',
            'nginx:stable-alpine',
            '-c',
            '/check/nginx.conf',
            '-g',
            'daemon off;'
        ]);
        const certificate = await readFile(join(temporary, 'cert.pem'));
        await waitFor(
            async () => (await request(https, httpsPort, '/docs', {}, 'GET', certificate)).status === 200
        );
        await succeed('docker', ['exec', containers[1], 'nginx', '-t', '-c', '/check/nginx.conf']);
        assert.deepEqual(await request(http, httpPort, '/docs'), {
            status: 308,
            location: 'https://monkeybot.example/docs'
        });
        for (const path of ['/internal', '/internal/', '/internal/bot/status', '/%69nternal/bot/status'])
            assert.equal((await request(https, httpsPort, path, {}, 'GET', certificate)).status, 404);
        const form = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': '0',
            Origin: 'https://monkeybot.example'
        };
        assert.equal((await request(https, httpsPort, '/docs', form, 'POST', certificate)).status, 405);
        assert.equal(
            (
                await request(
                    https,
                    httpsPort,
                    '/docs',
                    { ...form, 'X-Forwarded-Proto': 'http' },
                    'POST',
                    certificate
                )
            ).status,
            405
        );
        assert.equal(
            (
                await request(
                    https,
                    httpsPort,
                    '/docs',
                    { ...form, Origin: 'https://other.invalid' },
                    'POST',
                    certificate
                )
            ).status,
            403
        );
        assert.equal(
            (
                await request(
                    https,
                    httpsPort,
                    '/docs',
                    { ...form, 'Content-Length': String(75 * 1024 * 1024) },
                    'POST',
                    certificate
                )
            ).status,
            413
        );
        result.proxy = {
            docs: 200,
            redirect: 308,
            internalPaths: 4,
            internalStatus: 404,
            validOriginWithoutAction: 405,
            forgedForwardedProtoOverwritten: true,
            foreignOrigin: 403,
            excessiveContentLength: 413,
            publicCertificate: false
        };
        app.kill('SIGTERM');
        const [exitCode] = await once(app, 'exit');
        assert.equal(exitCode, 0);
        result.webSigtermExit = exitCode;
        app = null;
        // 앱이 내려간 뒤의 프록시 오류만 만들어 OAuth 제공자에 연결하지 않고 로그 제외를 확인한다.
        const callbackMarker = 'callback-check-' + randomUUID();
        const controlMarker = 'ordinary-check-' + randomUUID();
        assert.equal(
            (
                await request(
                    https,
                    httpsPort,
                    '/auth/discord/callback?code=' + callbackMarker,
                    {},
                    'GET',
                    certificate
                )
            ).status,
            502
        );
        assert.equal(
            (await request(https, httpsPort, '/docs?probe=' + controlMarker, {}, 'GET', certificate)).status,
            502
        );
        const proxyLog = await command('docker', ['logs', containers[1]]);
        assert.ok(proxyLog.errors.includes(controlMarker));
        assert.ok(!proxyLog.errors.includes(callbackMarker) && !proxyLog.output.includes(callbackMarker));
        Object.assign(result.proxy, { callbackFailureStatus: 502, callbackQueryExcludedFromErrorLog: true });
    });
    result.passed = true;
} catch (cause) {
    result.passed = false;
    result.failedStage = activeStage;
    // 요청·환경·하위 도구의 원시 출력은 증거 파일에 넣지 않는다.
    result.failure =
        cause instanceof assert.AssertionError ? '완료 조건 불일치' : '격리 검사 준비 또는 실행 실패';
    console.error(result.failure);
    process.exitCode = 1;
} finally {
    if (app) {
        app.kill('SIGTERM');
        await Promise.race([
            once(app, 'exit'),
            new Promise((resolvePromise) => setTimeout(resolvePromise, 5000))
        ]);
        if (app.exitCode === null) app.kill('SIGKILL');
    }
    result.cleanup = {};
    result.images = [];
    for (const container of containers) {
        const inspected = await command('docker', [
            'inspect',
            '--format',
            '{{index .Config.Labels "dev.monkeybot.validation"}} {{.Image}}',
            container
        ]).catch(() => ({ code: 1 }));
        if (inspected.code === 0) {
            const [owner, image] = inspected.output.trim().split(' ');
            if (owner === identifier) {
                result.images.push({ container, image });
                await command('docker', ['rm', '-f', '-v', container]);
            } else {
                result.cleanup[container] = false;
                continue;
            }
        }
        result.cleanup[container] =
            (await command('docker', ['inspect', container]).catch(() => ({ code: 1 }))).code !== 0;
    }
    await rm(temporary, { recursive: true, force: true });
    result.temporaryDirectoryRemoved = true;
    result.finishedAt = new Date().toISOString();
    if (!Object.values(result.cleanup).every(Boolean)) {
        result.passed = false;
        process.exitCode = 1;
    }
    if (interrupted) {
        result.passed = false;
        process.exitCode = 130;
    }
    if (reportPath) {
        await mkdir(dirname(reportPath), { recursive: true });
        await writeFile(reportPath, JSON.stringify(result, null, 4) + '\n');
    }
    console.log(
        result.passed
            ? '격리 배포 검사를 완료하고 임시 자원을 정리했습니다.'
            : '격리 배포 검사가 실패했습니다. 완료 단계와 정리 결과를 확인해 주세요.'
    );
}
