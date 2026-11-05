import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { TestContext } from 'node:test';
import { newSession } from '../../../src/lib/server/auth/session-core.ts';
import * as tables from '../../../src/lib/server/db/schema.ts';
import { createTestDatabase } from './database.ts';

export const HTTP_IDS = {
    guild: '970000000000000001',
    otherGuild: '970000000000000002',
    manager: '970000000000000011',
    member: '970000000000000012',
    outsider: '970000000000000013',
    serviceAdmin: '970000000000000014',
    bot: '970000000000000090',
    channel: '970000000000000091',
    role: '970000000000000092'
};
export interface UpstreamRule {
    method: string;
    url: string;
    body?: unknown;
    raw?: string;
    status?: number;
    headers?: Record<string, string>;
    authorization?: string;
}
export const HTTP_COOKIE = '__Host-monkeybot_session';
export const HTTP_BOT_TOKEN = 'fixture-internal-bot-token';
type HttpActionResult =
    | { type: 'success' | 'failure'; status: number; data?: string; location: string }
    | { type: 'error'; error: { status: number; message: string }; location: string }
    | { type: 'redirect'; status: number; location: string };

export function fixtureUpstreams(): UpstreamRule[] {
    const base = 'https://discord.com/api/v10';
    const guildIds = [HTTP_IDS.guild, HTTP_IDS.otherGuild];
    const people = [HTTP_IDS.manager, HTTP_IDS.member, HTTP_IDS.serviceAdmin];
    const rules: UpstreamRule[] = [
        {
            method: 'GET',
            url: base + '/users/@me/guilds?limit=200',
            body: guildIds.map((id) => ({ id, name: 'HTTP 검증 서버', icon: null }))
        },
        {
            method: 'GET',
            url: base + '/users/@me',
            authorization: 'Bot fixture-bot-token',
            body: { id: HTTP_IDS.bot, bot: true }
        },
        {
            method: 'POST',
            url: 'https://discord.com/api/oauth2/token',
            body: { access_token: 'fixture-access-token', token_type: 'Bearer', scope: 'identify' }
        },
        {
            method: 'GET',
            url: base + '/users/@me',
            authorization: 'Bearer fixture-access-token',
            body: { id: HTTP_IDS.member, username: 'OAuth 사용자', global_name: null, avatar: null }
        },
        { method: 'GET', url: 'https://ddragon.leagueoflegends.com/api/versions.json', body: ['26.21.1'] }
    ];
    for (const id of guildIds) {
        const roles = [
            { id, name: '@everyone', permissions: '68608', position: 0, managed: false },
            { id: HTTP_IDS.role, name: '운영 역할', permissions: '0', position: 1, managed: false }
        ];
        rules.push(
            {
                method: 'GET',
                url: base + '/guilds/' + id,
                body: { id, name: 'HTTP 검증 서버', icon: null, owner_id: HTTP_IDS.manager, roles }
            },
            { method: 'GET', url: base + '/guilds/' + id + '/roles', body: roles },
            {
                method: 'GET',
                url: base + '/guilds/' + id + '/channels',
                body: [
                    {
                        id: HTTP_IDS.channel,
                        guild_id: id,
                        type: 0,
                        name: '모집',
                        position: 0,
                        parent_id: null,
                        permission_overwrites: []
                    }
                ]
            }
        );
        for (const userId of [...people, HTTP_IDS.bot])
            rules.push({
                method: 'GET',
                url: base + '/guilds/' + id + '/members/' + userId,
                body: {
                    user: { id: userId, username: 'HTTP 사용자', global_name: null, avatar: null },
                    roles: []
                }
            });
        rules.push({
            method: 'GET',
            url: base + '/guilds/' + id + '/members/' + HTTP_IDS.outsider,
            status: 404,
            body: {}
        });
    }
    for (const resource of ['champion', 'item', 'summoner', 'profileicon', 'runesReforged']) {
        rules.push({
            method: 'GET',
            url: 'https://ddragon.leagueoflegends.com/cdn/26.21.1/data/ko_KR/' + resource + '.json',
            body: resource === 'runesReforged' ? [] : { version: '26.21.1', data: {} }
        });
    }
    for (const name of ['HttpPlayer', 'SecondPlayer']) {
        const puuid = 'fixture-' + name;
        rules.push(
            {
                method: 'GET',
                url: 'https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/' + name + '/KR1',
                body: { puuid, gameName: name, tagLine: 'KR1' }
            },
            {
                method: 'GET',
                url: 'https://asia.api.riotgames.com/riot/account/v1/accounts/by-puuid/' + puuid,
                body: { puuid, gameName: name, tagLine: 'KR1' }
            },
            {
                method: 'GET',
                url: 'https://asia.api.riotgames.com/riot/account/v1/region/by-game/lol/by-puuid/' + puuid,
                body: { puuid, game: 'lol', region: 'kr' }
            },
            {
                method: 'GET',
                url: 'https://kr.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/' + puuid,
                body: { puuid, profileIconId: 1, revisionDate: 1, summonerLevel: 30 }
            },
            {
                method: 'GET',
                url: 'https://kr.api.riotgames.com/lol/league/v4/entries/by-puuid/' + puuid,
                body: []
            }
        );
    }
    return rules;
}

/** 웹은 실제 DB 세션, 봇은 전용 서비스 토큰으로 인증한다. 테스트용 운영 endpoint는 없다. */
export async function createHttpFixture(
    t: TestContext,
    overrides: UpstreamRule[] = [],
    options: { botInternalToken?: string } = {}
) {
    await access(new URL('../../../build/handler.js', import.meta.url)).catch(() => {
        throw new Error('HTTP hard에는 최신 웹 빌드가 필요합니다. pnpm test:hard:http 명령을 사용해 주세요.');
    });
    let stopServer: (() => Promise<void>) | undefined;
    const isolated = await createTestDatabase(t, {
        beforeClose: async () => {
            await stopServer?.();
        }
    });
    const { db } = isolated;
    await db.insert(tables.users).values(
        [HTTP_IDS.manager, HTTP_IDS.member, HTTP_IDS.outsider, HTTP_IDS.serviceAdmin].map((id) => ({
            id,
            username: 'HTTP 사용자',
            isServiceAdmin: id === HTTP_IDS.serviceAdmin
        }))
    );
    await db.insert(tables.guilds).values(
        [HTTP_IDS.guild, HTTP_IDS.otherGuild].map((id) => ({
            id,
            name: 'HTTP 검증 서버',
            isActive: true
        }))
    );
    await db.insert(tables.guildMembers).values(
        [HTTP_IDS.guild, HTTP_IDS.otherGuild].flatMap((guildId) =>
            [HTTP_IDS.manager, HTTP_IDS.member, HTTP_IDS.serviceAdmin].map((userId) => ({
                guildId,
                userId,
                manageGuild: userId === HTTP_IDS.manager,
                isAdmin: userId === HTTP_IDS.manager,
                roleIds: [],
                syncedAt: new Date()
            }))
        )
    );
    const [season] = await db
        .insert(tables.mmrSeasons)
        .values({ guildId: HTTP_IDS.guild, name: 'HTTP 테스트 시즌' })
        .returning();
    const environment: NodeJS.ProcessEnv = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        SystemRoot: process.env.SystemRoot,
        NODE_ENV: 'production',
        DATABASE_URL: isolated.connectionString,
        DISCORD_CLIENT_ID: HTTP_IDS.bot,
        DISCORD_CLIENT_SECRET: 'fixture-oauth-secret',
        DISCORD_BOT_TOKEN: 'fixture-bot-token',
        BOT_INTERNAL_TOKEN: options.botInternalToken ?? HTTP_BOT_TOKEN,
        RIOT_API_KEY: 'fixture-riot-key',
        RIOT_ACCOUNT_REGION: 'asia',
        RIOT_PLATFORM: 'kr',
        RIOT_API_TIMEOUT_MS: '1000',
        BODY_SIZE_LIMIT: '70M',
        BOT_STATUS_URL: '',
        MSM2_TEST_UPSTREAMS: JSON.stringify([...overrides, ...fixtureUpstreams()])
    };
    const child = fork(fileURLToPath(new URL('./http-child.mjs', import.meta.url)), [], {
        cwd: fileURLToPath(new URL('../../../', import.meta.url)),
        env: environment,
        execArgv: [],
        stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });
    // 서버 내부 로그에 연결 URL이 포함될 수 있으므로 실패 보고에는 비밀 값이 없는 상태만 사용한다.
    child.stdout?.resume();
    child.stderr?.resume();
    const unexpected: string[] = [];
    const upstreamCalls: string[] = [];
    child.on('message', (message: unknown) => {
        if (message && typeof message === 'object' && 'type' in message && 'path' in message) {
            if (message.type === 'unexpected-upstream') unexpected.push(String(message.path));
            if (message.type === 'upstream') upstreamCalls.push(String(message.path));
        }
    });
    let stopping: Promise<void> | undefined;
    stopServer = () =>
        (stopping ??= new Promise<void>((resolve) => {
            if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
                resolve();
                return;
            }
            const timer = setTimeout(() => child.kill('SIGKILL'), 5_000);
            child.once('exit', () => {
                clearTimeout(timer);
                resolve();
            });
            child.kill('SIGTERM');
        }).then(() => {
            assert.deepEqual(unexpected, [], '테스트 fixture에 없는 외부 요청이 발생했습니다.');
        }));
    const ready = await new Promise<{ url: string; origin: string }>((resolve, reject) => {
        const timer = setTimeout(() => {
            finish();
            reject(new Error('테스트 SvelteKit 서버가 15초 안에 준비되지 않았습니다.'));
        }, 15_000);
        const finish = () => {
            clearTimeout(timer);
            child.off('message', onMessage);
            child.off('exit', onExit);
            child.off('error', onError);
        };
        const onMessage = (message: unknown) => {
            if (!message || typeof message !== 'object' || !('type' in message)) return;
            if (message.type === 'ready' && 'url' in message && 'origin' in message) {
                finish();
                resolve({ url: String(message.url), origin: String(message.origin) });
            } else if (message.type === 'startup-error') {
                finish();
                reject(new Error('테스트 SvelteKit 서버를 초기화하지 못했습니다.'));
            }
        };
        const onExit = () => {
            finish();
            reject(new Error('준비 전에 테스트 SvelteKit 프로세스가 종료됐습니다.'));
        };
        const onError = () => {
            finish();
            reject(new Error('테스트 SvelteKit 프로세스를 실행하지 못했습니다.'));
        };
        child.on('message', onMessage);
        child.once('exit', onExit);
        child.once('error', onError);
    });
    async function session(userId: string, expired = false) {
        const issued = newSession(userId, expired ? new Date(0) : new Date());
        await db.insert(tables.sessions).values(issued.record);
        return { cookie: HTTP_COOKIE + '=' + issued.token, tokenHash: issued.record.tokenHash };
    }
    let checkpointId = 0;
    async function checkpoint() {
        const id = ++checkpointId;
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                child.off('message', receive);
                reject(new Error('테스트 서버 기록을 동기화하지 못했습니다.'));
            }, 5_000);
            const receive = (message: unknown) => {
                if (
                    message &&
                    typeof message === 'object' &&
                    'type' in message &&
                    message.type === 'checkpoint' &&
                    'id' in message &&
                    message.id === id
                ) {
                    clearTimeout(timer);
                    child.off('message', receive);
                    resolve();
                }
            };
            child.on('message', receive);
            child.send({ type: 'checkpoint', id }, (error) => {
                if (error) {
                    clearTimeout(timer);
                    child.off('message', receive);
                    reject(new Error('테스트 서버 연결이 종료됐습니다.'));
                }
            });
        });
    }
    async function request(path: string, init: RequestInit = {}) {
        assert.ok(path.startsWith('/') && !path.startsWith('//'), '테스트 요청은 앱 내부 경로여야 합니다.');
        const headers = new Headers(init.headers);
        headers.set('x-forwarded-proto', 'https');
        const response = await fetch(ready.url + path, {
            ...init,
            headers,
            redirect: 'manual',
            signal: AbortSignal.timeout(15_000)
        });
        await checkpoint();
        return response;
    }
    async function action(
        path: string,
        name: string,
        fields: Record<string, string | Blob>,
        cookie?: string
    ) {
        const body = new FormData();
        for (const [key, value] of Object.entries(fields)) body.set(key, value);
        const response = await request(path + '?/' + name, {
            method: 'POST',
            body,
            headers: {
                accept: 'application/json',
                'x-sveltekit-action': 'true',
                origin: ready.origin,
                ...(cookie ? { cookie } : {})
            }
        });
        assert.match(response.headers.get('content-type') ?? '', /application\/json/);
        const result = (await response.json()) as HttpActionResult;
        return { response, result };
    }
    return { ...isolated, ...ready, season: season!, session, request, action, upstreamCalls };
}

export function assertAction(
    reply: Awaited<ReturnType<Awaited<ReturnType<typeof createHttpFixture>>['action']>>,
    status: number
) {
    // SvelteKit 3의 throw error 응답은 status를 error 안에 담고 fail 응답은 최상위에 담는다.
    if (reply.result.type === 'error') {
        assert.ok(status >= 400);
        assert.equal(reply.result.error.status, status);
        assert.equal(reply.response.status, status);
        assert.equal(typeof reply.result.error.message, 'string');
        return;
    }
    assert.equal(reply.result.status, status);
    if (status < 300) {
        assert.equal(reply.result.type, 'success');
        // SvelteKit의 반환값 없는 action은 200 응답에 status:204 결과를 담는다.
        assert.equal(reply.response.status, status === 204 ? 200 : status);
    } else {
        assert.equal(reply.result.type, 'failure');
        assert.equal(reply.response.status, status);
    }
}
