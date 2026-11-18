import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { and, eq, isNull } from 'drizzle-orm';
import type { Pool } from 'pg';
import type { PrivacyPreferences } from '../../../../src/lib/features/me/privacy.ts';
import type { Database } from '../../../../src/lib/server/db/types.ts';
import { getMyPrivacy, setMyPrivacy, withdrawAccount } from '../../../../src/lib/server/accounts/privacy.ts';
import { linkRiotAccount, unlinkRiotAccount } from '../../../../src/lib/server/accounts/service.ts';
import { createSessionStore } from '../../../../src/lib/server/auth/session-store.ts';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { synchronizeGuildMembership } from '../../../../src/lib/server/discord/membership.ts';
import { requireGuildMember } from '../../../../src/lib/server/guild/access.ts';
import { importMatchRofl, revertLastMatchGame } from '../../../../src/lib/server/matches/service.ts';
import { bootstrapServiceAdmin, setServiceAdmin } from '../../../../src/lib/server/service-admin/service.ts';
import {
    cancelScrim,
    createRegistration,
    restoreCancelledScrim
} from '../../../../src/lib/server/scrims/service.ts';
import { endScrimEarly, revertScrim } from '../../../../src/lib/server/scrims/workflow.ts';
import { createAccessFixture } from '../../support/access-fixtures.ts';
import {
    createFormationFixture,
    createRecruitmentFixture,
    errorCode
} from '../../support/domain-fixtures.ts';
import { createMatchResultFixture, replayBytes } from '../../support/match-fixtures.ts';
import { snapshotTables } from '../../support/database.ts';

const confirm = { confirm: true };

function retained(db: Database) {
    return snapshotTables(db, [
        schema.scrimParticipants,
        schema.scrimParticipantRegistrations,
        schema.scrimParticipantPreferences,
        schema.games,
        schema.gameParticipants,
        schema.matchLineups,
        schema.matchLineupPlayers,
        schema.gameMmrApplications,
        schema.mmrLedgerEntries,
        schema.userPositionMmr,
        schema.roflMetadata,
        schema.roflParticipantDataV1,
        schema.matchRoflImports
    ]);
}

/** 같은 잠금 대기열의 순서를 실제 PostgreSQL에서 확인한 뒤 두 요청을 풀어 양쪽 순서를 재현한다. */
async function lifecycleOrder(
    f: { pool: Pool; schemaName: string },
    first: () => Promise<void>,
    second: () => Promise<void>
) {
    const clients = await Promise.all([1, 2, 3, 4].map(() => f.pool.connect()));
    try {
        await Promise.all(
            clients.map((client) =>
                client.query("SELECT set_config('application_name', $1, false)", [f.schemaName])
            )
        );
    } finally {
        clients.forEach((client) => client.release());
    }
    const control = await f.pool.connect();
    let open = false;
    const settle = (pending: Promise<void>): Promise<PromiseSettledResult<void>> =>
        pending.then(
            (value) => ({ status: 'fulfilled', value }),
            (reason) => ({ status: 'rejected', reason })
        );
    let a: Promise<PromiseSettledResult<void>> | undefined;
    let b: Promise<PromiseSettledResult<void>> | undefined;
    const waiting = async (count: number) => {
        const end = Date.now() + 2_000;
        while (Date.now() < end) {
            const rows = await f.pool.query<{ total: number }>(
                "SELECT count(*)::int AS total FROM pg_stat_activity WHERE application_name = $1 AND wait_event_type = 'Lock' AND query LIKE '%pg_advisory_xact_lock(779002, 1)%'",
                [f.schemaName]
            );
            if (rows.rows[0]!.total === count) return;
            await delay(10);
        }
        throw new Error('사용자 생애주기 요청의 잠금 대기 순서를 확인하지 못했습니다.');
    };
    try {
        await control.query('BEGIN');
        open = true;
        await control.query('SELECT pg_advisory_xact_lock(779002, 1)');
        a = settle(first());
        await waiting(1);
        b = settle(second());
        await waiting(2);
        await control.query('COMMIT');
        open = false;
        return await Promise.all([a, b]);
    } finally {
        if (open) await control.query('ROLLBACK');
        control.release();
        await Promise.all([a, b]);
    }
}

test('공개 설정은 기본 공개이며 본인 값만 변경하고 잘못된 입력·없는 세션은 거절한다', async (t) => {
    const f = await createAccessFixture(t);
    assert.deepEqual(await getMyPrivacy(f.db, f.member), {
        publicProfile: true,
        publicRiotIds: true,
        withdrawalBlock: null
    });
    await setMyPrivacy(f.db, f.member, { publicProfile: false, publicRiotIds: true });
    assert.equal((await getMyPrivacy(f.db, f.member)).publicProfile, false);
    assert.equal((await getMyPrivacy(f.db, f.otherMember)).publicProfile, true);
    await assert.rejects(getMyPrivacy(f.db, null), errorCode('UNAUTHENTICATED'));
    await assert.rejects(
        setMyPrivacy(f.db, null, { publicProfile: false, publicRiotIds: false }),
        errorCode('UNAUTHENTICATED')
    );
    await assert.rejects(
        setMyPrivacy(f.db, f.member, null as unknown as PrivacyPreferences),
        errorCode('INVALID_INPUT')
    );
    await assert.rejects(withdrawAccount(f.db, f.member, { confirm: false }), errorCode('INVALID_INPUT'));
    assert.equal(
        (await f.db.select().from(schema.users).where(eq(schema.users.id, f.ids.member)))[0]!.withdrawnAt,
        null
    );
});

test('탈퇴는 모든 본인 세션·연결·멤버십·프로필 선호를 정리하고 공유 Riot 식별은 다른 사용자에게 보존한다', async (t) => {
    const f = await createAccessFixture(t);
    const shared = await f.seedAccount();
    const orphan = await f.seedAccount(f.ids.otherGuild);
    await f.db.insert(schema.guildRiotAccounts).values({
        guildId: f.ids.otherGuild,
        userId: f.ids.otherMember,
        riotAccountId: shared.id,
        isPrimary: true
    });
    await f.db
        .insert(schema.userChampionPreferences)
        .values({ userId: f.ids.member, position: 'top', championId: 266 });
    const store = createSessionStore(() => f.db);
    const first = await store.createSession({
        ...f.profile(f.ids.member),
        globalName: '숨길 이름',
        avatarHash: 'a'.repeat(32)
    });
    const second = await store.createSession(f.profile(f.ids.member));
    const other = await store.createSession(f.profile(f.ids.otherMember));
    await withdrawAccount(f.db, f.member, confirm);
    const [user] = await f.db.select().from(schema.users).where(eq(schema.users.id, f.ids.member));
    assert.ok(user!.withdrawnAt);
    assert.equal(user!.username, '탈퇴한 사용자');
    assert.equal(user!.globalName, null);
    assert.equal(user!.avatarHash, null);
    assert.equal(user!.publicProfile, false);
    assert.equal(user!.publicRiotIds, false);
    assert.equal(
        (await f.db.select().from(schema.guildMembers).where(eq(schema.guildMembers.userId, f.ids.member)))
            .length,
        0
    );
    assert.equal(
        (
            await f.db
                .select()
                .from(schema.guildRiotAccounts)
                .where(eq(schema.guildRiotAccounts.userId, f.ids.member))
        ).length,
        0
    );
    assert.equal((await f.db.select().from(schema.userChampionPreferences)).length, 0);
    assert.equal(await store.validateSession(first.token), null);
    assert.equal(await store.validateSession(second.token), null);
    assert.ok(await store.validateSession(other.token));
    assert.equal(await store.getUser(f.ids.member), null);
    const accounts = await f.db.select().from(schema.riotAccounts);
    assert.deepEqual(
        accounts.find((row) => row.id === shared.id),
        shared
    );
    const cleaned = accounts.find((row) => row.id === orphan.id)!;
    assert.equal(cleaned.puuid, orphan.puuid);
    assert.equal(cleaned.gameName, null);
    assert.equal(cleaned.tagLine, null);
    assert.equal(cleaned.platform, null);
    await withdrawAccount(f.db, f.member, confirm);
    assert.deepEqual(
        (await f.db.select().from(schema.users).where(eq(schema.users.id, f.ids.member)))[0],
        user
    );
    await assert.rejects(
        setMyPrivacy(f.db, f.member, { publicProfile: true, publicRiotIds: true }),
        errorCode('UNAUTHENTICATED')
    );
});

test('실제 ROFL 경기의 결과·출전·원장·MMR·식별자는 탈퇴 뒤 그대로 남는다', async (t) => {
    const f = await createMatchResultFixture(t, { bestOf: 1, keepAutomaticLineup: true });
    await importMatchRofl(
        f.db,
        f.manager,
        f.guildId,
        f.match.id,
        { ...(await f.slot()), bytes: replayBytes(f.players()) },
        f.dependencies
    );
    assert.equal((await f.row()).status, 'completed');
    const before = await retained(f.db);
    await withdrawAccount(f.db, f.actors[5]!, confirm);
    assert.deepEqual(await retained(f.db), before);
    const [identity] = await f.db
        .select()
        .from(schema.riotAccounts)
        .where(eq(schema.riotAccounts.id, f.accounts[5]!.id));
    assert.equal(identity!.puuid, f.accounts[5]!.puuid);
    assert.equal(identity!.gameName, null);
    await assert.rejects(
        revertScrim(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access),
        errorCode('CONFLICT')
    );
    const [game] = await f.db.select().from(schema.games);
    await assert.rejects(
        revertLastMatchGame(
            f.db,
            f.manager,
            f.guildId,
            f.match.id,
            {
                expectedRevision: (await f.matchRow()).revision,
                gameId: game!.id,
                reason: '탈퇴 후 정정 검사'
            },
            f.dependencies
        ),
        errorCode('CONFLICT')
    );
    assert.equal((await f.row()).status, 'completed');
    assert.deepEqual(await retained(f.db), before);
});

for (const status of ['recruit', 'preparing', 'ready', 'in_progress'] as const)
    test(`${status} 활성 신청 중 공개 설정은 변경할 수 있지만 탈퇴는 기존 참가·계정 연결을 보존한다`, async (t) => {
        const f = await createAccessFixture(t);
        const account = await f.seedAccount();
        const [scrim] = await f.db
            .insert(schema.scrims)
            .values({ guildId: f.ids.guild, title: '활성 참가', status, formationMethod: 'manual' })
            .returning();
        const [participant] = await f.db
            .insert(schema.scrimParticipants)
            .values({
                scrimId: scrim!.id,
                userId: f.ids.member,
                riotAccountId: account.id,
                displayName: '당시 참가자'
            })
            .returning();
        await f.db
            .insert(schema.scrimParticipantRegistrations)
            .values({ scrimParticipantId: participant!.id, status: 'selected' });
        await setMyPrivacy(f.db, f.member, { publicProfile: false, publicRiotIds: false });
        assert.match((await getMyPrivacy(f.db, f.member)).withdrawalBlock!, /참가 중인 내전/);
        await assert.rejects(withdrawAccount(f.db, f.member, confirm), errorCode('CONFLICT'));
        assert.equal(
            (await f.db.select().from(schema.users).where(eq(schema.users.id, f.ids.member)))[0]!.withdrawnAt,
            null
        );
        assert.equal((await f.db.select().from(schema.guildRiotAccounts)).length, 1);
        assert.equal((await f.db.select().from(schema.scrimParticipants))[0]!.riotAccountId, account.id);
    });

test('현재 신청이 없어도 실제 확정 라인업이 남은 계정은 탈퇴로 끊지 않는다', async (t) => {
    const f = await createMatchResultFixture(t, { keepAutomaticLineup: true });
    await f.db
        .update(schema.scrimParticipantRegistrations)
        .set({ status: 'withdrawn', withdrawnAt: new Date() })
        .where(eq(schema.scrimParticipantRegistrations.scrimParticipantId, f.participants[5]!.id));
    await assert.rejects(withdrawAccount(f.db, f.actors[5]!, confirm), errorCode('CONFLICT'));
    assert.match((await getMyPrivacy(f.db, f.actors[5]!)).withdrawalBlock!, /참가 중인 내전/);
});

test('서비스 운영자는 명시적으로 권한을 회수한 뒤 탈퇴하며 탈퇴 사용자의 운영자 지정은 거절한다', async (t) => {
    const f = await createAccessFixture(t);
    await bootstrapServiceAdmin(f.db, f.ids.member);
    await assert.rejects(withdrawAccount(f.db, f.member, confirm), errorCode('CONFLICT'));
    assert.match((await getMyPrivacy(f.db, f.member)).withdrawalBlock!, /운영자 권한/);
    await setServiceAdmin(f.db, f.member, f.ids.owner, true);
    await setServiceAdmin(f.db, f.member, f.ids.member, false);
    await withdrawAccount(f.db, f.member, confirm);
    await assert.rejects(setServiceAdmin(f.db, f.owner, f.ids.member, true), errorCode('CONFLICT'));
    await f.db.update(schema.users).set({ isServiceAdmin: false }).where(eq(schema.users.id, f.ids.owner));
    await assert.rejects(bootstrapServiceAdmin(f.db, f.ids.member), errorCode('CONFLICT'));
});

test('탈퇴 마지막 저장 실패는 세션·연결·멤버십·선호·Riot 표시 정리까지 모두 롤백한다', async (t) => {
    const f = await createAccessFixture(t);
    await f.seedAccount();
    const store = createSessionStore(() => f.db);
    const issued = await store.createSession(f.profile(f.ids.member));
    await f.db
        .insert(schema.userChampionPreferences)
        .values({ userId: f.ids.member, position: 'mid', championId: 103 });
    const snapshot = () =>
        Promise.all([
            f.db.select().from(schema.users),
            f.db.select().from(schema.riotAccounts),
            f.db.select().from(schema.guildRiotAccounts),
            f.db.select().from(schema.guildMembers),
            f.db.select().from(schema.userChampionPreferences)
        ]);
    const before = await snapshot();
    await f.pool.query(
        'ALTER TABLE users ADD CONSTRAINT fixture_withdrawal_failure CHECK (withdrawn_at IS NULL)'
    );
    await assert.rejects(withdrawAccount(f.db, f.member, confirm));
    assert.deepEqual(await snapshot(), before);
    assert.ok(await store.validateSession(issued.token));
});

test('Discord 동기화는 탈퇴를 되돌리지 않고 명시 OAuth 재로그인은 비공개와 같은 계정 ID를 유지한다', async (t) => {
    const f = await createAccessFixture(t);
    await linkRiotAccount(f.db, f.owner, f.ids.guild, f.ids.member, 'Return#KR1', f.dependencies);
    const [identity] = await f.db.select().from(schema.riotAccounts);
    const store = createSessionStore(() => f.db);
    const old = await store.createSession(f.profile(f.ids.member));
    const publicId = (await f.db.select().from(schema.users).where(eq(schema.users.id, f.ids.member)))[0]!
        .publicId;
    await withdrawAccount(f.db, f.member, confirm);
    assert.equal(await synchronizeGuildMembership(f.db, f.discord, f.ids.member, f.ids.guild), null);
    await assert.rejects(
        requireGuildMember(f.member, f.ids.guild, { db: f.db, discord: f.discord }),
        errorCode('NOT_FOUND')
    );
    await assert.rejects(
        linkRiotAccount(f.db, f.owner, f.ids.guild, f.ids.member, 'Return#KR1', f.dependencies),
        errorCode('NOT_FOUND')
    );
    const [stillWithdrawn] = await f.db.select().from(schema.users).where(eq(schema.users.id, f.ids.member));
    assert.equal(stillWithdrawn!.username, '탈퇴한 사용자');
    assert.ok(stillWithdrawn!.withdrawnAt);
    assert.equal(stillWithdrawn!.publicId, publicId);
    const returned = await store.createSession({ ...f.profile(f.ids.member), globalName: '다시 로그인' });
    assert.equal(await store.validateSession(old.token), null);
    assert.equal((await store.validateSession(returned.token))?.user.displayName, '다시 로그인');
    assert.deepEqual(await getMyPrivacy(f.db, f.member), {
        publicProfile: false,
        publicRiotIds: false,
        withdrawalBlock: null
    });
    await linkRiotAccount(f.db, f.owner, f.ids.guild, f.ids.member, 'Return#KR1', f.dependencies);
    const accounts = await f.db.select().from(schema.riotAccounts);
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0]!.id, identity!.id);
    assert.equal(accounts[0]!.puuid, identity!.puuid);
    assert.equal(accounts[0]!.gameName, 'Return');
    assert.equal(
        (await f.db.select().from(schema.users).where(eq(schema.users.id, f.ids.member)))[0]!.publicId,
        publicId
    );
});

for (const first of ['withdrawal', 'login'] as const)
    test(`명시 OAuth와 탈퇴의 ${first} 우선 순서는 프로필·세션·공개 설정을 함께 처리한다`, async (t) => {
        const f = await createAccessFixture(t);
        const store = createSessionStore(() => f.db);
        const withdraw = () => withdrawAccount(f.db, f.member, confirm);
        const login = () =>
            store.createSession({ ...f.profile(f.ids.member), globalName: 'OAuth 재로그인' }).then(() => {});
        const results = await lifecycleOrder(
            f,
            first === 'withdrawal' ? withdraw : login,
            first === 'withdrawal' ? login : withdraw
        );
        assert.ok(results.every((result) => result.status === 'fulfilled'));
        const [user] = await f.db.select().from(schema.users).where(eq(schema.users.id, f.ids.member));
        assert.equal(Boolean(user!.withdrawnAt), first === 'login');
        assert.equal(user!.publicProfile, false);
        assert.equal(user!.publicRiotIds, false);
        assert.equal((await f.db.select().from(schema.sessions)).length, first === 'login' ? 0 : 1);
        assert.equal(user!.globalName, first === 'login' ? null : 'OAuth 재로그인');
    });

test('가입 신청과 탈퇴가 겹쳐도 탈퇴 사용자에게 활성 신청·계정 연결을 남기지 않는다', async (t) => {
    const f = await createRecruitmentFixture(t);
    const target = f.actors[5]!;
    const results = await Promise.allSettled([
        createRegistration(
            f.db,
            target,
            f.guildId,
            f.scrimId,
            { riotAccountId: f.accounts[5]!.id, positions: ['top'] },
            f.access
        ),
        withdrawAccount(f.db, target, confirm)
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const [user] = await f.db.select().from(schema.users).where(eq(schema.users.id, target.userId));
    const registrations = await f.db
        .select()
        .from(schema.scrimParticipantRegistrations)
        .innerJoin(
            schema.scrimParticipants,
            eq(schema.scrimParticipants.id, schema.scrimParticipantRegistrations.scrimParticipantId)
        )
        .where(
            and(
                eq(schema.scrimParticipants.userId, target.userId),
                isNull(schema.scrimParticipantRegistrations.withdrawnAt)
            )
        );
    assert.equal(user!.withdrawnAt ? registrations.length : 0, 0);
    if (user!.withdrawnAt)
        assert.equal(
            (
                await f.db
                    .select()
                    .from(schema.guildRiotAccounts)
                    .where(eq(schema.guildRiotAccounts.userId, target.userId))
            ).length,
            0
        );
    else assert.equal(registrations.length, 1);
});

test('편성 복구는 과거 대기자의 탈퇴를 현재 선발 라인업으로 잘못 요구하지 않는다', async (t) => {
    const f = await createFormationFixture(t);
    const [reserve] = await f.db
        .insert(schema.scrimParticipants)
        .values({
            scrimId: f.scrimId,
            userId: f.users[15]!.id,
            riotAccountId: f.accounts[15]!.id,
            displayName: '당시 대기자'
        })
        .returning();
    const [registration] = await f.db
        .insert(schema.scrimParticipantRegistrations)
        .values({ scrimParticipantId: reserve!.id, status: 'standby' })
        .returning();
    await cancelScrim(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    await withdrawAccount(f.db, f.actors[15]!, confirm);
    await restoreCancelledScrim(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    assert.equal((await f.row()).status, 'preparing');
    assert.deepEqual(
        (
            await f.db
                .select()
                .from(schema.scrimParticipantRegistrations)
                .where(eq(schema.scrimParticipantRegistrations.id, registration!.id))
        )[0],
        registration
    );
    // 모집으로 되돌릴 때에는 다시 활성화할 대기열 자체도 검증한다.
    await assert.rejects(
        revertScrim(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access),
        errorCode('CONFLICT')
    );
});

for (const state of ['cancelled', 'ended_early'] as const)
    for (const first of ['withdrawal', 'recovery'] as const)
        test(`${state} ${first} 우선 경쟁은 탈퇴와 내전 재개 중 하나만 허용하고 이력을 보존한다`, async (t) => {
            const f = await createFormationFixture(t);
            if (state === 'cancelled')
                await cancelScrim(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
            else await endScrimEarly(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
            const version = await f.revision();
            const before = await retained(f.db);
            const withdraw = () => withdrawAccount(f.db, f.actors[5]!, confirm);
            const recover = () =>
                state === 'cancelled'
                    ? restoreCancelledScrim(f.db, f.manager, f.guildId, f.scrimId, version, f.access)
                    : revertScrim(f.db, f.manager, f.guildId, f.scrimId, version, f.access);
            const results = await lifecycleOrder(
                f,
                first === 'withdrawal' ? withdraw : recover,
                first === 'withdrawal' ? recover : withdraw
            );
            assert.equal(results[0]!.status, 'fulfilled');
            assert.equal(results[1]!.status, 'rejected');
            const rejected = results[1]!;
            assert.ok(rejected.status === 'rejected' && errorCode('CONFLICT')(rejected.reason));
            assert.equal((await f.row()).status, first === 'withdrawal' ? state : 'preparing');
            const [user] = await f.db
                .select()
                .from(schema.users)
                .where(eq(schema.users.id, f.actors[5]!.userId));
            assert.equal(Boolean(user!.withdrawnAt), first === 'withdrawal');
            assert.deepEqual(await retained(f.db), before);
        });

test('취소 복구와 계정 해제가 겹쳐도 활성 내전에 연결 없는 참가자를 만들지 않는다', async (t) => {
    const f = await createFormationFixture(t);
    await cancelScrim(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    const version = await f.revision();
    const results = await Promise.allSettled([
        restoreCancelledScrim(f.db, f.manager, f.guildId, f.scrimId, version, f.access),
        unlinkRiotAccount(f.db, f.manager, f.guildId, f.actors[5]!.userId, f.accounts[5]!.id, f.access)
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const link = await f.db
        .select()
        .from(schema.guildRiotAccounts)
        .where(
            and(
                eq(schema.guildRiotAccounts.guildId, f.guildId),
                eq(schema.guildRiotAccounts.riotAccountId, f.accounts[5]!.id)
            )
        );
    assert.equal(link.length, (await f.row()).status === 'preparing' ? 1 : 0);
});

for (const first of ['withdrawal', 'result_reversal'] as const)
    test(`완료 결과 정정과 탈퇴의 ${first} 우선 경쟁은 원장 변경 전에 재개 가능성을 확인한다`, async (t) => {
        const f = await createMatchResultFixture(t, { bestOf: 1, keepAutomaticLineup: true });
        await importMatchRofl(
            f.db,
            f.manager,
            f.guildId,
            f.match.id,
            { ...(await f.slot()), bytes: replayBytes(f.players()) },
            f.dependencies
        );
        const [game] = await f.db.select().from(schema.games);
        const before = await retained(f.db);
        const version = (await f.matchRow()).revision;
        const withdraw = () => withdrawAccount(f.db, f.actors[5]!, confirm);
        const reverse = () =>
            revertLastMatchGame(
                f.db,
                f.manager,
                f.guildId,
                f.match.id,
                { expectedRevision: version, gameId: game!.id, reason: '탈퇴와 결과 정정 경쟁' },
                f.dependencies
            ).then(() => {});
        const results = await lifecycleOrder(
            f,
            first === 'withdrawal' ? withdraw : reverse,
            first === 'withdrawal' ? reverse : withdraw
        );
        assert.equal(results[0]!.status, 'fulfilled');
        assert.equal(results[1]!.status, 'rejected');
        const rejected = results[1]!;
        assert.ok(rejected.status === 'rejected' && errorCode('CONFLICT')(rejected.reason));
        if (first === 'withdrawal') {
            assert.equal((await f.row()).status, 'completed');
            assert.deepEqual(await retained(f.db), before);
        } else {
            assert.equal((await f.row()).status, 'in_progress');
            assert.equal((await f.db.select().from(schema.games))[0]!.status, 'cancelled');
            assert.equal((await f.db.select().from(schema.mmrLedgerEntries)).length, 20);
            assert.equal(
                (await f.db.select().from(schema.users).where(eq(schema.users.id, f.actors[5]!.userId)))[0]!
                    .withdrawnAt,
                null
            );
        }
    });

test('0011은 기존 사용자·식별·점수를 보존하고 기존 계정은 공개·미탈퇴 상태로 시작한다', async (t) => {
    const f = await createAccessFixture(t);
    const [account] = await f.db
        .insert(schema.riotAccounts)
        .values({ puuid: 'keep-canonical', gameName: '보존', tagLine: 'KR1' })
        .returning();
    const before = await f.db.select().from(schema.users);
    // 새 열·제약을 제거해 직전 상태를 만들고 생성 SQL을 기존 프로필에 적용한다.
    await f.pool.query('ALTER TABLE users DROP CONSTRAINT users_withdrawn_private');
    await f.pool.query(
        'ALTER TABLE users DROP COLUMN withdrawn_at, DROP COLUMN public_profile, DROP COLUMN public_riot_ids, DROP COLUMN public_id'
    );
    await f.pool.query(f.migrationSql('0011_account_privacy'));
    const after = await f.db.select().from(schema.users);
    const existing = ({ publicId, ...row }: typeof schema.users.$inferSelect) => row;
    assert.deepEqual(after.map(existing), before.map(existing));
    assert.equal(new Set(after.map((row) => row.publicId)).size, after.length);
    assert.ok(
        after.every((row) =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(row.publicId)
        )
    );
    assert.deepEqual((await f.db.select().from(schema.riotAccounts))[0], account);
});
