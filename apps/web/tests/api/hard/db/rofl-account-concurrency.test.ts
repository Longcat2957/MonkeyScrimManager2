import assert from 'node:assert/strict';
import test from 'node:test';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { importMatchRofl } from '../../../../src/lib/server/matches/service.ts';
import { linkRiotAccount } from '../../../../src/lib/server/accounts/service.ts';
import { createMatchResultFixture, replayBytes } from '../../support/match-fixtures.ts';

function barrier() {
    let open!: () => void;
    const reached = new Promise<void>((resolve) => {
        open = resolve;
    });
    return { reached, open };
}

function settled<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
    return promise.then(
        (value) => ({ status: 'fulfilled', value }),
        (reason: unknown) => ({ status: 'rejected', reason })
    );
}

function committed<T>(result: PromiseSettledResult<T>, operation: string): T {
    if (result.status === 'fulfilled') return result.value;
    const reason: unknown = result.reason;
    const cause = reason instanceof Error && 'cause' in reason ? reason.cause : reason;
    const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : 'UNKNOWN';
    assert.fail(`${operation}이 실제 경합에서 커밋되지 않았습니다 (${code}).`);
}

async function reachBeforeCompletion(reached: Promise<void>, task: Promise<PromiseSettledResult<unknown>>) {
    await Promise.race([
        reached,
        task.then((result) => {
            if (result.status === 'rejected') throw result.reason;
            throw new Error('서비스가 잠금 관찰 지점에 도달하지 않았습니다.');
        })
    ]);
}

/** 테스트가 소유한 연결에서 쿼리 실행 순서만 제어한다. SQL과 반환 행은 수정하지 않는다. */
function observeQueries(pool: Pool, before: (text: string) => void, after: (text: string) => Promise<void>) {
    pool.on('connect', (client) => {
        const query = client.query;
        client.query = function (...args: unknown[]) {
            const first = args[0];
            const text =
                typeof first === 'string'
                    ? first
                    : first && typeof first === 'object' && 'text' in first
                      ? String(first.text)
                      : '';
            before(text);
            const result: unknown = Reflect.apply(query, client, args);
            if (!(result instanceof Promise)) return result;
            return result.then(async (value: unknown) => {
                await after(text);
                return value;
            });
        } as typeof client.query;
    });
}

test(
    'ROFL 부계정 자동 확인과 다른 서버의 계정 연결이 새 계정 생성 뒤 경합해도 둘 다 커밋한다',
    { timeout: 20_000 },
    async (t) => {
        const f = await createMatchResultFixture(t, { keepAutomaticLineup: true });
        const slot = await f.slot();
        const otherManager = f.actors[20]!;
        const shared = f.accounts[1]!;
        // 기존 v4 계정보다 먼저 잠기는 새 행을 확정하여 UUID 생성 순서에 기대지 않는다.
        const alternateId = '00000000-0000-1000-8000-000000000001';
        const alternate = { puuid: 'concurrent-alternate-top', gameName: 'ConcurrentTop', tagLine: 'KR1' };
        const originalLinks = await f.db
            .select()
            .from(schema.guildRiotAccounts)
            .where(eq(schema.guildRiotAccounts.guildId, f.guildId));
        await f.db.insert(schema.guildMembers).values({
            guildId: f.otherGuildId,
            userId: otherManager.userId,
            manageGuild: true,
            isAdmin: true,
            syncedAt: new Date()
        });
        await f.db.insert(schema.guildRiotAccounts).values({
            guildId: f.otherGuildId,
            userId: otherManager.userId,
            riotAccountId: shared.id,
            isPrimary: true
        });

        const importPool = new Pool({ connectionString: f.connectionString, max: 1 });
        const accountPool = new Pool({ connectionString: f.connectionString, max: 1 });
        const firstRead = barrier();
        const continueImport = barrier();
        const accountRead = barrier();
        const continueAccount = barrier();
        let importReads = 0;
        let accountHoldsRows = false;
        const tasks: Promise<PromiseSettledResult<unknown>>[] = [];
        const isImportRead = (text: string) =>
            text.includes('from "riot_accounts" where "riot_accounts"."puuid" in') &&
            /for (?:key share|no key update)$/.test(text);
        const isAccountRead = (text: string) =>
            text.includes('from "riot_accounts" where') && text.endsWith('for no key update');
        observeQueries(
            importPool,
            () => {},
            async (text) => {
                if (!isImportRead(text)) return;
                importReads++;
                if (importReads === 1) {
                    firstRead.open();
                    await continueImport.reached;
                }
            }
        );
        observeQueries(
            accountPool,
            (text) => {
                if (isAccountRead(text)) accountRead.open();
            },
            async (text) => {
                if (!isAccountRead(text)) return;
                accountHoldsRows = true;
                await continueAccount.reached;
            }
        );
        try {
            const importDb = drizzle({ client: importPool, schema });
            const accountDb = drizzle({ client: accountPool, schema });
            const accountPid = (await accountPool.query<{ pid: number }>('select pg_backend_pid() as pid'))
                .rows[0]!.pid;
            const upload = settled(
                importMatchRofl(
                    importDb,
                    f.manager,
                    f.guildId,
                    f.match.id,
                    {
                        ...slot,
                        bytes: replayBytes(
                            f
                                .players()
                                .map((player, index) =>
                                    index === 0
                                        ? { ...player, RIOT_ID_GAME_NAME: alternate.gameName }
                                        : player
                                )
                        )
                    },
                    {
                        ...f.dependencies,
                        riot: {
                            getAccountByRiotId: async (input) =>
                                input.gameName === alternate.gameName
                                    ? alternate
                                    : f.dependencies.riot.getAccountByRiotId(input)
                        }
                    }
                )
            );
            tasks.push(upload);
            await reachBeforeCompletion(firstRead.reached, upload);
            // 최초 조회 이후 다른 요청이 전역 계정을 만들지만 원래 서버의 연결은 만들지 않은 상태다.
            await f.db.insert(schema.riotAccounts).values({ id: alternateId, puuid: alternate.puuid });
            const changed = settled(
                linkRiotAccount(
                    accountDb,
                    otherManager,
                    f.otherGuildId,
                    otherManager.userId,
                    'ConcurrentTop#KR1',
                    {
                        discord: {
                            listGuilds: async () => [],
                            getGuild: async (id) => ({
                                id,
                                name: '다른 서버',
                                iconHash: null,
                                ownerId: otherManager.userId,
                                roles: [{ id, permissions: 0n }]
                            }),
                            getMember: async (guildId, userId) =>
                                guildId === f.otherGuildId && userId === otherManager.userId
                                    ? {
                                          user: {
                                              id: userId,
                                              username: '다른 운영자',
                                              globalName: null,
                                              avatarHash: null
                                          },
                                          roleIds: []
                                      }
                                    : null
                        },
                        riot: {
                            getAccountByRiotId: async () => alternate,
                            getActiveRegion: async () => ({
                                puuid: alternate.puuid,
                                game: 'lol',
                                region: 'kr'
                            })
                        }
                    }
                )
            );
            tasks.push(changed);
            await reachBeforeCompletion(accountRead.reached, changed);
            const deadline = Date.now() + 3000;
            let blocked = false;
            while (!accountHoldsRows && !blocked && Date.now() < deadline) {
                const { rows } = await f.pool.query<{ blocked: boolean }>(
                    "select wait_event_type = 'Lock' as blocked from pg_stat_activity where pid = $1",
                    [accountPid]
                );
                blocked = rows[0]?.blocked === true;
                if (!blocked && !accountHoldsRows) await new Promise((resolve) => setTimeout(resolve, 10));
            }
            // 구 NO KEY UPDATE는 새 행을 보유하고 기존 행을 기다리고, 현재 KEY SHARE는 함께 보유할 수 있다.
            assert.ok(accountHoldsRows || blocked, '계정 변경이 실제 행 잠금을 보유하거나 기다려야 한다');
            continueImport.open();
            const imported = await upload;
            continueAccount.open();
            const connected = await changed;
            const game = committed(imported, 'ROFL 저장');
            committed(connected, '다른 서버 계정 연결');
            assert.equal(importReads, 2, '새 계정 삽입 경합 뒤 실제 서비스가 계정들을 다시 확인해야 한다');
            const [played] = await f.db
                .select()
                .from(schema.gameParticipants)
                .where(
                    and(
                        eq(schema.gameParticipants.gameId, game.gameId),
                        eq(schema.gameParticipants.scrimParticipantId, f.participants[0]!.id)
                    )
                );
            assert.equal(played?.riotAccountId, alternateId);
            assert.equal(played?.position, 'top');
            assert.equal((await f.db.select().from(schema.gameMmrApplications)).length, 1);
            const [link] = await f.db
                .select()
                .from(schema.guildRiotAccounts)
                .where(
                    and(
                        eq(schema.guildRiotAccounts.guildId, f.otherGuildId),
                        eq(schema.guildRiotAccounts.riotAccountId, alternateId)
                    )
                );
            assert.equal(link?.userId, otherManager.userId);
            assert.equal(link?.isPrimary, false);
            assert.deepEqual(
                await f.db
                    .select()
                    .from(schema.guildRiotAccounts)
                    .where(eq(schema.guildRiotAccounts.guildId, f.guildId)),
                originalLinks
            );
        } finally {
            continueImport.open();
            continueAccount.open();
            await Promise.all(tasks);
            await Promise.all([importPool.end(), accountPool.end()]);
        }
    }
);
