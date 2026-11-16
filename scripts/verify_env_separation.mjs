import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'msm2-env-separation-'));
const context = join(temporary, 'context');
const project = basename(temporary).toLowerCase();
const image = project + ':fixture';
const volume = project + '-postgres';
const networks = [project + '-legacy', project + '-tunnel'];
const resources = [];
let composeArgs;
let composeEnvironment;
let imageCreated = false;

function write(relative, value) {
    const path = join(temporary, relative);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, value, { mode: 0o600 });
}

function docker(args, environment = process.env) {
    return execFileSync('docker', args, {
        cwd: temporary,
        env: environment,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    });
}

try {
    const required = [
        'package.json',
        'pnpm-lock.yaml',
        'pnpm-workspace.yaml',
        '.npmrc',
        'apps/web/package.json',
        'apps/web/src/env.ts',
        'apps/web/src/routes/+page.svelte',
        'apps/web/drizzle.config.ts',
        'apps/web/drizzle/0000_initial_schema.sql',
        'apps/web/drizzle/meta/_journal.json',
        'apps/bot/src/config.ts',
        'shared/bot-api.d.ts'
    ];
    const protectedFiles = [
        '.env',
        '.env.old',
        'apps/web/.env',
        'apps/web/.env.test',
        'apps/bot/.env',
        'deploy/env/web.env',
        'deploy/env/bot.env',
        'deploy/env/migration.env',
        'deploy/env/web.env.bak',
        'deploy/env/web.env.example',
        'certs/origin.pem',
        'certs/origin.key',
        '.ssh/id_ed25519',
        'keys/id_rsa',
        '.aws/credentials',
        'runtime/secrets.json',
        'runtime/credentials.json',
        'backups/database.dump',
        'backups/database.sql.gz',
        'runtime/settings.bak',
        'logs/service.log',
        'samples/replay.rofl',
        'node_modules/example/index.js',
        'apps/web/node_modules/example/index.js',
        'apps/web/.svelte-kit/output/server.js',
        'apps/web/build/env.js',
        'apps/bot/dist/index.js',
        '.git/config',
        '.github/workflows/ci.yml',
        '.codex/config.json',
        'artifacts/screenshot.png',
        'docs/private-notes.md'
    ];
    for (const path of required) write('context/' + path, 'public-build-fixture\n');
    // 실제 운영 자료 대신 구분 가능한 가짜 자료로 Docker의 필터링을 검사한다.
    for (const path of protectedFiles) write('context/' + path, 'private-fixture-must-not-enter-image\n');
    copyFileSync(join(repository, '.dockerignore'), join(context, '.dockerignore'));
    write('context-check.Dockerfile', 'FROM scratch\nCOPY . /context/\n');
    docker([
        'buildx',
        'build',
        '--progress=plain',
        '--file',
        join(temporary, 'context-check.Dockerfile'),
        '--output',
        'type=local,dest=' + join(temporary, 'output'),
        context
    ]);
    for (const path of required) {
        assert.ok(existsSync(join(temporary, 'output/context', path)), '필요한 빌드 파일 누락: ' + path);
    }
    for (const path of protectedFiles) {
        assert.ok(!existsSync(join(temporary, 'output/context', path)), '빌드 컨텍스트 제외 실패: ' + path);
    }
    console.log(
        `Docker 빌드 컨텍스트: 필수 ${required.length}개 포함·보호 ${protectedFiles.length}개 제외 확인`
    );

    mkdirSync(join(temporary, 'deploy'), { recursive: true });
    for (const name of ['compose.yml', 'compose.app.yml']) {
        copyFileSync(join(repository, 'deploy', name), join(temporary, 'deploy', name));
    }
    const literal = 'fixture$MSM2_EXPAND_CHECK"quoted"#suffix';
    write('env/postgres.env', 'POSTGRES_USER=fixture\nPOSTGRES_DB=postgres\nPOSTGRES_PASSWORD=fixture\n');
    write(
        'env/web.env',
        `DATABASE_URL=postgresql://runtime:fixture@postgres:5432/msm2_fixture\nDISCORD_CLIENT_SECRET=${literal}\nBOT_INTERNAL_TOKEN=${literal}\n`
    );
    write('env/bot.env', `DISCORD_TOKEN=${literal}\nBOT_INTERNAL_TOKEN=${literal}\n`);
    write('env/migration.env', 'DATABASE_URL=postgresql://migrator:fixture@postgres:5432/msm2_fixture\n');
    docker([
        'buildx',
        'build',
        '--load',
        '--tag',
        image,
        '--label',
        'msm2.env-separation=' + project,
        '--file',
        join(temporary, 'context-check.Dockerfile'),
        context
    ]);
    imageCreated = true;
    for (const [kind, name] of [['volume', volume], ...networks.map((name) => ['network', name])]) {
        docker([kind, 'create', '--label', 'msm2.env-separation=' + project, name]);
        resources.push([kind, name]);
    }
    const environment = {
        ...process.env,
        MSM2_ENV_DIR: join(temporary, 'env'),
        MSM2_APP_IMAGE: image,
        MSM2_POSTGRES_VOLUME: volume,
        MSM2_LEGACY_DATA_NETWORK: networks[0],
        MSM2_TUNNEL_NETWORK: networks[1],
        MSM2_EXPAND_CHECK: 'must-not-be-expanded'
    };
    composeArgs = [
        'compose',
        '-p',
        project,
        '-f',
        join(temporary, 'deploy/compose.yml'),
        '-f',
        join(temporary, 'deploy/compose.app.yml')
    ];
    composeEnvironment = environment;
    const configuration = JSON.parse(docker([...composeArgs, 'config', '--format', 'json'], environment));
    const { web, bot, migrate } = configuration.services;
    assert.deepEqual(Object.keys(migrate.environment), ['DATABASE_URL']);
    assert.ok(!Object.hasOwn(bot.environment, 'DATABASE_URL'));
    assert.ok(!Object.hasOwn(bot.environment, 'DISCORD_CLIENT_SECRET'));
    assert.ok(!Object.hasOwn(bot.environment, 'RIOT_API_KEY'));
    assert.equal(bot.environment.BOT_API_URL, 'http://web:3000');
    assert.equal(bot.environment.WEB_ORIGIN, 'https://monkeybot.lol');
    assert.notEqual(web.environment.DATABASE_URL, migrate.environment.DATABASE_URL);

    // config 직렬화의 달러 이스케이프 대신 실제 생성된 컨테이너의 환경을 검사한다.
    // scratch 이미지는 실행하지 않으므로 외부 API·DB·봇에는 연결하지 않는다.
    docker(
        [...composeArgs, 'up', '--no-start', '--no-deps', '--pull', 'never', 'web', 'bot', 'migrate'],
        environment
    );
    const effective = {};
    for (const service of ['web', 'bot', 'migrate']) {
        const id = docker([...composeArgs, 'ps', '-a', '-q', service], environment).trim();
        assert.ok(id);
        const container = JSON.parse(docker(['inspect', id]))[0];
        assert.equal(container.State.Running, false);
        assert.equal(container.Config.Labels['com.docker.compose.project'], project);
        effective[service] = Object.fromEntries(
            container.Config.Env.map((line) => {
                const separator = line.indexOf('=');
                return [line.slice(0, separator), line.slice(separator + 1)];
            })
        );
    }
    assert.equal(effective.web.DISCORD_CLIENT_SECRET, literal);
    assert.equal(effective.web.BOT_INTERNAL_TOKEN, literal);
    assert.equal(effective.bot.DISCORD_TOKEN, literal);
    assert.equal(effective.bot.BOT_INTERNAL_TOKEN, literal);
    console.log('Compose 환경: raw 값 보존·서비스별 비밀 값 분리·내부 주소 확인');
} finally {
    if (composeArgs) {
        docker([...composeArgs, 'down', '--volumes', '--timeout', '10'], composeEnvironment);
    }
    for (const [kind, name] of resources.reverse()) {
        const resource = JSON.parse(docker([kind, 'inspect', name]))[0];
        assert.equal(resource.Labels['msm2.env-separation'], project);
        docker([kind, 'rm', name]);
    }
    if (imageCreated) {
        const metadata = JSON.parse(docker(['image', 'inspect', image]))[0];
        assert.equal(metadata.Config.Labels['msm2.env-separation'], project);
        docker(['image', 'rm', image]);
    }
    // 직접 만든 임시 디렉터리만 정리하며 실제 환경 파일이나 서버에는 접근하지 않는다.
    rmSync(temporary, { recursive: true, force: true });
}
