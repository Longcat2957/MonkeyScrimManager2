#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, open, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const help = `사용법:
  MSM2_BACKUP_DATABASE_URL 설정 후 node scripts/database_backup.mjs backup /보호된/새파일.dump
  MSM2_RESTORE_DATABASE_URL 설정 후 node scripts/database_backup.mjs restore /보호된/파일.dump --confirm-empty-database

일반 DATABASE_URL을 자동으로 사용하지 않는다. PostgreSQL 17의 pg_dump·pg_restore·psql이 PATH에 필요하다.
복원은 신뢰하는 백업과 새로 준비한 빈 DB에만 수행하며 기존 객체를 삭제하지 않는다.`;

class OperationError extends Error {}

function connection(value) {
    let url;
    try {
        url = new URL(value ?? '');
        if (
            !['postgres:', 'postgresql:'].includes(url.protocol) ||
            !url.hostname ||
            !url.username ||
            url.pathname.length < 2 ||
            url.hash
        )
            throw new Error();
    } catch {
        throw new OperationError(
            '전용 DB 환경 변수에 사용자·호스트·DB 이름이 있는 PostgreSQL URL이 필요합니다.'
        );
    }
    const parameters = {
        sslmode: 'PGSSLMODE',
        sslrootcert: 'PGSSLROOTCERT',
        sslcert: 'PGSSLCERT',
        sslkey: 'PGSSLKEY',
        connect_timeout: 'PGCONNECT_TIMEOUT'
    };
    const environment = Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))
    );
    // libpq가 원치 않는 기본 DB·서비스·세션 옵션을 상속하지 않게 하고 비밀번호는 argv에 넣지 않는다.
    Object.assign(environment, {
        PGHOST: url.hostname.replace(/^\[|\]$/g, ''),
        PGPORT: url.port || '5432',
        PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
        PGUSER: decodeURIComponent(url.username),
        PGPASSWORD: decodeURIComponent(url.password),
        PGCONNECT_TIMEOUT: '10',
        PGAPPNAME: 'monkeybot-backup',
        PGCLIENTENCODING: 'UTF8'
    });
    if (process.env.PGPASSFILE) environment.PGPASSFILE = process.env.PGPASSFILE;
    for (const [key, value] of url.searchParams) {
        if (!Object.hasOwn(parameters, key))
            throw new OperationError(
                '지원하지 않는 DB URL 옵션입니다. 배포 문서의 연결 옵션을 확인해 주세요.'
            );
        environment[parameters[key]] = value;
    }
    if (!/^\d+$/.test(environment.PGCONNECT_TIMEOUT) || Number(environment.PGCONNECT_TIMEOUT) < 1)
        throw new OperationError('DB 연결 제한 시간은 양의 정수여야 합니다.');
    return environment;
}

let running;
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
        interrupted = true;
        running?.kill(signal);
    });
}

async function execute(command, args, environment, inputFile, outputFile) {
    if (interrupted) throw new OperationError('작업이 중단됐습니다.');
    const input = inputFile ? await open(inputFile, 'r') : null;
    try {
        return await new Promise((resolvePromise, reject) => {
            const child = spawn(command, args, {
                env: environment,
                stdio: [input?.fd ?? 'ignore', outputFile?.fd ?? 'pipe', 'pipe']
            });
            running = child;
            let output = '';
            if (!outputFile) child.stdout.on('data', (chunk) => (output += chunk));
            // 접속 주소·사용자 데이터가 포함될 수 있는 도구의 원시 오류는 출력하거나 보관하지 않는다.
            child.stderr.resume();
            child.once('error', () => reject(new OperationError(`${command}를 실행할 수 없습니다.`)));
            child.once('close', (code) => {
                running = null;
                if (code !== 0 || interrupted)
                    reject(
                        new OperationError(
                            `${command} 작업에 실패했습니다. DB 접속·권한·도구 버전을 확인해 주세요.`
                        )
                    );
                else resolvePromise(output);
            });
        });
    } finally {
        await input?.close();
    }
}

async function digest(file) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
}

async function backup(file) {
    const environment = connection(process.env.MSM2_BACKUP_DATABASE_URL);
    try {
        await access(file + '.sha256');
        throw new OperationError('같은 이름의 검증 파일이 이미 있습니다. 새 파일 경로를 사용해 주세요.');
    } catch (cause) {
        if (cause.code !== 'ENOENT') throw cause;
    }
    let output;
    let created = false;
    try {
        output = await open(file, 'wx', 0o600);
        created = true;
        await execute(
            'pg_dump',
            ['--format=custom', '--no-owner', '--no-acl', '--no-password'],
            environment,
            null,
            output
        );
        await output.close();
        output = null;
        await execute('pg_restore', ['--list'], environment, file);
        const checksum = await digest(file);
        if (interrupted) throw new OperationError('작업이 중단됐습니다.');
        await writeFile(file + '.sha256', `${checksum}\n`, { flag: 'wx', mode: 0o600 });
        console.log('백업과 SHA256 검증 파일을 만들었습니다.');
    } catch (cause) {
        await output?.close();
        if (created) await unlink(file).catch(() => {});
        if (cause.code === 'EEXIST')
            throw new OperationError('대상 파일이 이미 있습니다. 덮어쓰지 않았습니다.');
        throw cause;
    }
}

async function restore(file) {
    const environment = connection(process.env.MSM2_RESTORE_DATABASE_URL);
    if (['postgres', 'template0', 'template1'].includes(environment.PGDATABASE))
        throw new OperationError('기본 관리 DB에는 복원하지 않습니다. 별도의 빈 DB를 준비해 주세요.');
    const info = await stat(file);
    if (!info.isFile()) throw new OperationError('일반 백업 파일이 필요합니다.');
    const expected = (await readFile(file + '.sha256', 'utf8')).trim();
    if (!/^[a-f0-9]{64}$/.test(expected) || expected !== (await digest(file)))
        throw new OperationError('백업 SHA256이 일치하지 않습니다. 복원하지 않았습니다.');
    await execute('pg_restore', ['--list'], environment, file);
    const objects = await execute(
        'psql',
        [
            '--no-psqlrc',
            '--no-password',
            '--tuples-only',
            '--no-align',
            '--set=ON_ERROR_STOP=1',
            '--command',
            `select (
                (select count(*) from pg_namespace where nspname not in ('public', 'information_schema') and nspname !~ '^pg_') +
                (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public') +
                (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public') +
                (select count(*) from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public') +
                (select count(*) from pg_extension where extname <> 'plpgsql')
            )::text`
        ],
        environment
    );
    if (objects.trim() !== '0')
        throw new OperationError('대상 DB가 비어 있지 않습니다. 기존 객체를 삭제하거나 덮어쓰지 않았습니다.');
    await execute(
        'pg_restore',
        [
            '--dbname=' + environment.PGDATABASE,
            '--no-owner',
            '--no-acl',
            '--no-password',
            '--exit-on-error',
            '--single-transaction'
        ],
        environment,
        file
    );
    console.log('빈 DB 복원을 완료했습니다. 앱 전환 전에 행·제약·업무 결과를 확인해 주세요.');
}

try {
    const [mode, path, confirmation, ...extra] = process.argv.slice(2);
    if (mode === '--help') console.log(help);
    else if (
        !['backup', 'restore'].includes(mode) ||
        !path ||
        extra.length ||
        (mode === 'backup' && confirmation) ||
        (mode === 'restore' && confirmation !== '--confirm-empty-database')
    ) {
        throw new OperationError(help);
    } else {
        const file = resolve(path);
        if (/[\r\n]/.test(basename(file)))
            throw new OperationError('파일 이름에 줄바꿈을 사용할 수 없습니다.');
        if (mode === 'backup') await backup(file);
        else await restore(file);
    }
} catch (cause) {
    console.error(
        cause instanceof OperationError
            ? cause.message
            : '파일·접속 설정을 확인해 주세요. 작업을 완료하지 못했습니다.'
    );
    process.exitCode = interrupted ? 130 : 1;
}
