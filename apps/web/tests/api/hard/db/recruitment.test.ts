import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { and, asc, eq, isNull } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { unlinkRiotAccount } from '../../../../src/lib/server/accounts/service.ts';
import {
    cancelScrim,
    closeRecruitment,
    createRegistration,
    createScrim,
    reopenRecruitment,
    setParticipantStatus,
    updateRegistration,
    updateScrimSettings,
    withdrawRegistration
} from '../../../../src/lib/server/scrims/service.ts';
import {
    getScrim,
    getScrimDetail,
    getScrimSettings,
    listActiveScrims,
    listRegistrationAccounts,
    listScrims
} from '../../../../src/lib/server/scrims/queries.ts';
import {
    createDomainFixture,
    createRecruitmentFixture,
    concurrently,
    errorCode,
    settings
} from '../../support/domain-fixtures.ts';

type Fixture = Awaited<ReturnType<typeof createRecruitmentFixture>>;
const join = (f: Fixture, index: number) =>
    createRegistration(
        f.db,
        f.actors[index]!,
        f.guildId,
        f.scrimId,
        { riotAccountId: f.accounts[index]!.id, positions: ['mid', 'top'] },
        f.access
    );
const registrations = (f: Fixture) =>
    f.db
        .select({
            id: schema.scrimParticipantRegistrations.id,
            status: schema.scrimParticipantRegistrations.status,
            userId: schema.scrimParticipants.userId,
            participantId: schema.scrimParticipants.id
        })
        .from(schema.scrimParticipantRegistrations)
        .innerJoin(
            schema.scrimParticipants,
            eq(schema.scrimParticipants.id, schema.scrimParticipantRegistrations.scrimParticipantId)
        )
        .where(
            and(
                eq(schema.scrimParticipants.scrimId, f.scrimId),
                isNull(schema.scrimParticipantRegistrations.withdrawnAt)
            )
        )
        .orderBy(
            asc(schema.scrimParticipantRegistrations.joinedAt),
            asc(schema.scrimParticipantRegistrations.id)
        );
async function fill(f: Fixture, count: number) {
    for (let i = 0; i < count; i++) await join(f, i);
}

test('생성 재요청은 동일 내전을 반환하고 별도 연결에서도 커밋한 행을 읽는다', async (t) => {
    const f = await createDomainFixture(t);
    const input = { ...settings, requestId: randomUUID() };
    // 관찰 연결을 먼저 점유하여 서비스가 다른 실제 연결에서 커밋하도록 한다.
    const observer = await f.pool.connect();
    try {
        const scrimId = await createScrim(f.db, f.manager, f.guildId, input, f.access);
        assert.equal(await createScrim(f.db, f.manager, f.guildId, input, f.access), scrimId);
        const saved = await observer.query('select id, mmr_season_id from scrims');
        assert.equal(saved.rowCount, 1);
        assert.equal(saved.rows[0].id, scrimId);
        assert.equal(saved.rows[0].mmr_season_id, f.season.id);
        await assert.rejects(
            createScrim(f.db, f.viewer, f.guildId, { ...input, requestId: randomUUID() }, f.access),
            errorCode('FORBIDDEN')
        );
    } finally {
        observer.release();
    }
});

test('공개 조회는 본인 신청과 운영 권한을 다른 실행자에게 노출하지 않는다', async (t) => {
    const f = await createRecruitmentFixture(t);
    await join(f, 0);
    assert.equal((await getScrim(f.db, null, f.guildId, f.scrimId))?.canManage, false);
    assert.equal((await getScrimDetail(f.db, null, f.guildId, f.scrimId))?.myRegistration, null);
    assert.equal(
        (await getScrimDetail(f.db, f.manager, f.guildId, f.scrimId, f.access))?.myRegistration?.status,
        'selected'
    );
    await assert.rejects(
        getScrimSettings(f.db, f.viewer, f.guildId, f.scrimId, f.access),
        errorCode('FORBIDDEN')
    );
    assert.equal(await getScrim(f.db, null, f.otherGuildId, f.scrimId), null);
    const list = await listScrims(f.db, null, f.guildId, { status: 'recruit', page: 1, pageSize: 20 });
    assert.equal(list.total, 1);
    assert.equal(list.scrims[0]?.registered, 1);
    assert.equal((await listActiveScrims(f.db, null, f.guildId)).length, 1);
    assert.equal(
        (await listRegistrationAccounts(f.db, f.manager, f.guildId)).primaryAccountId,
        f.accounts[0]!.id
    );
    assert.deepEqual((await listRegistrationAccounts(f.db, f.manager, f.otherGuildId)).accounts, []);
});

test('다른 사람의 연결 계정으로 신청하거나 신청 계정을 바꾸지 못한다', async (t) => {
    const f = await createRecruitmentFixture(t);
    const input = { riotAccountId: f.accounts[1]!.id, positions: ['mid'] as const };
    await assert.rejects(
        createRegistration(f.db, f.manager, f.guildId, f.scrimId, input, f.access),
        errorCode('INVALID_INPUT')
    );
    assert.equal((await registrations(f)).length, 0);
    await join(f, 0);
    await assert.rejects(
        updateRegistration(f.db, f.manager, f.guildId, f.scrimId, input, f.access),
        errorCode('INVALID_INPUT')
    );
    await updateRegistration(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        { riotAccountId: f.accounts[0]!.id, positions: ['support'] },
        f.access
    );
    assert.deepEqual(
        (await getScrimDetail(f.db, f.manager, f.guildId, f.scrimId, f.access))?.myRegistration?.positions,
        ['support']
    );
});

test('철회는 대기자를 승급시키고 재신청은 이전 이력을 덮어쓰지 않는다', async (t) => {
    const f = await createRecruitmentFixture(t);
    await fill(f, 12);
    const before = await registrations(f);
    const original = before.find((row) => row.userId === f.manager.userId)!;
    const promoted = before.find((row) => row.status === 'standby')!;
    await withdrawRegistration(f.db, f.manager, f.guildId, f.scrimId, f.access);
    assert.equal((await registrations(f)).find((row) => row.id === promoted.id)?.status, 'selected');
    await join(f, 0);
    const renewed = (await registrations(f)).find((row) => row.userId === f.manager.userId)!;
    assert.notEqual(renewed.id, original.id);
    assert.equal(renewed.participantId, original.participantId);
    assert.equal(renewed.status, 'standby');
    assert.equal(
        (
            await f.db
                .select()
                .from(schema.scrimParticipantRegistrations)
                .where(eq(schema.scrimParticipantRegistrations.id, original.id))
        )[0]?.status,
        'withdrawn'
    );
});

test('정원 초과와 정원 축소 실패는 신청·설정·revision을 바꾸지 않는다', async (t) => {
    const f = await createRecruitmentFixture(t);
    await fill(f, 12);
    const before = await f.row();
    await assert.rejects(join(f, 12), errorCode('CONFLICT'));
    await assert.rejects(
        updateScrimSettings(
            f.db,
            f.manager,
            f.guildId,
            f.scrimId,
            { ...(await f.revision()), settings: { ...f.input, reserveCapacity: 1 } },
            f.access
        ),
        errorCode('CONFLICT')
    );
    assert.equal((await registrations(f)).length, 12);
    assert.equal((await f.row()).revision, before.revision);
    assert.equal((await f.row()).reserveCapacity, 2);
});

test('일괄 상태 변경에 다른 신청이 섞이면 유효한 신청도 변경하지 않는다', async (t) => {
    const f = await createRecruitmentFixture(t);
    await fill(f, 2);
    const before = await registrations(f);
    const [otherScrim] = await f.db
        .insert(schema.scrims)
        .values({ guildId: f.guildId, title: '다른 모집' })
        .returning();
    const [otherParticipant] = await f.db
        .insert(schema.scrimParticipants)
        .values({ scrimId: otherScrim!.id, userId: f.users[15]!.id, displayName: '다른 내전 참가자' })
        .returning();
    const [otherRegistration] = await f.db
        .insert(schema.scrimParticipantRegistrations)
        .values({ scrimParticipantId: otherParticipant!.id, status: 'selected' })
        .returning();
    const revision = await f.revision();
    await assert.rejects(
        setParticipantStatus(
            f.db,
            f.manager,
            f.guildId,
            f.scrimId,
            { ...revision, registrationIds: [before[0]!.id, otherRegistration!.id], status: 'excluded' },
            f.access
        ),
        errorCode('CONFLICT')
    );
    assert.deepEqual(await registrations(f), before);
    assert.deepEqual(await f.revision(), revision);
});

test('같은 revision의 동시 설정 변경은 한 번만 저장한다', async (t) => {
    const f = await createRecruitmentFixture(t);
    const revision = await f.revision();
    const results = await concurrently(
        ['첫 변경', '둘째 변경'].map(
            (title) => () =>
                updateScrimSettings(
                    f.db,
                    f.manager,
                    f.guildId,
                    f.scrimId,
                    { ...revision, settings: { ...f.input, title } },
                    f.access
                )
        )
    );
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(
        results.filter((result) => result.status === 'rejected' && errorCode('CONFLICT')(result.reason))
            .length,
        1
    );
    assert.equal((await f.row()).revision, revision.expectedRevision + 1);
});

test('마지막 선발 자리에 동시에 신청하면 한 명은 선발되고 한 명은 대기한다', async (t) => {
    const f = await createRecruitmentFixture(t, { reserveCapacity: 1 });
    await fill(f, 9);
    const results = await concurrently([() => join(f, 9), () => join(f, 10)]);
    assert.ok(results.every((result) => result.status === 'fulfilled'));
    const active = await registrations(f);
    assert.equal(active.filter((row) => row.status === 'selected').length, 10);
    assert.equal(active.filter((row) => row.status === 'standby').length, 1);
    assert.equal(new Set(active.map((row) => row.userId)).size, 11);
});

test('마감·재개·취소는 실제 단계와 신청 이력을 보존한다', async (t) => {
    const f = await createRecruitmentFixture(t);
    await fill(f, 10);
    await closeRecruitment(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    assert.equal((await f.row()).status, 'preparing');
    assert.equal((await f.db.select().from(schema.scrimTeams)).length, 2);
    await assert.rejects(
        withdrawRegistration(f.db, f.manager, f.guildId, f.scrimId, f.access),
        errorCode('CONFLICT')
    );
    await reopenRecruitment(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    assert.equal((await f.row()).status, 'recruit');
    await cancelScrim(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    assert.equal((await f.row()).status, 'cancelled');
    assert.equal((await registrations(f)).length, 10);
});

test('수동 대기 전환은 유지하고 운영자 제외로 빈 자리만 자동 승급한다', async (t) => {
    const f = await createRecruitmentFixture(t);
    await fill(f, 12);
    const active = await registrations(f);
    await setParticipantStatus(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        { ...(await f.revision()), registrationIds: [active[0]!.id], status: 'standby' },
        f.access
    );
    assert.equal((await registrations(f)).filter((row) => row.status === 'selected').length, 9);
    await setParticipantStatus(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        { ...(await f.revision()), registrationIds: [active[1]!.id], status: 'excluded' },
        f.access
    );
    const after = await registrations(f);
    assert.equal(after.length, 11);
    assert.equal(after.filter((row) => row.status === 'selected').length, 10);
    assert.ok(!after.some((row) => row.id === active[1]!.id));
    assert.equal(
        (
            await f.db
                .select()
                .from(schema.scrimParticipantRegistrations)
                .where(eq(schema.scrimParticipantRegistrations.id, active[1]!.id))
        )[0]?.status,
        'excluded'
    );
});

test('계정 해제와 신청이 경쟁해도 연결 없는 활성 신청을 남기지 않는다', async (t) => {
    const f = await createRecruitmentFixture(t);
    const userId = f.actors[1]!.userId,
        accountId = f.accounts[1]!.id;
    const results = await concurrently([
        () => join(f, 1),
        () => unlinkRiotAccount(f.db, f.manager, f.guildId, userId, accountId, f.access)
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const active = await registrations(f);
    const links = await f.db
        .select()
        .from(schema.guildRiotAccounts)
        .where(
            and(
                eq(schema.guildRiotAccounts.guildId, f.guildId),
                eq(schema.guildRiotAccounts.riotAccountId, accountId)
            )
        );
    if (results[0]!.status === 'fulfilled') {
        assert.equal(active.length, 1);
        assert.equal(links.length, 1);
        assert.ok(results[1]!.status === 'rejected' && errorCode('CONFLICT')(results[1]!.reason));
    } else {
        assert.ok(errorCode('INVALID_INPUT')(results[0]!.reason));
        assert.equal(active.length, 0);
        assert.equal(links.length, 0);
    }
});
