import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { unlinkRiotAccount } from '../../../../src/lib/server/accounts/service.ts';
import {
    cancelScrim,
    closeRecruitment,
    createRegistration,
    createManualRegistration,
    createManualRegistrations,
    createScrim,
    promoteDueStandby,
    reopenRecruitment,
    restoreCancelledScrim,
    setOwnStandbyInTransaction,
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
const join = (f: Fixture, index: number, availableAt?: string) =>
    createRegistration(
        f.db,
        f.actors[index]!,
        f.guildId,
        f.scrimId,
        { riotAccountId: f.accounts[index]!.id, positions: ['mid', 'top'], availableAt },
        f.access
    );
const registrations = (f: Fixture) =>
    f.db
        .select({
            id: schema.scrimParticipantRegistrations.id,
            status: schema.scrimParticipantRegistrations.status,
            availableAt: schema.scrimParticipantRegistrations.availableAt,
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

test('수동 추가도 운영 권한·실제 소속·대표 계정·중복·선발/대기 정원·모집 마감을 검사한다', async (t) => {
    const f = await createRecruitmentFixture(t);
    const add = (index: number) =>
        createManualRegistration(
            f.db,
            f.manager,
            f.guildId,
            f.scrimId,
            { userId: f.actors[index]!.userId },
            f.access
        );
    await assert.rejects(
        createManualRegistration(
            f.db,
            f.viewer,
            f.guildId,
            f.scrimId,
            { userId: f.actors[2]!.userId },
            f.access
        ),
        errorCode('FORBIDDEN')
    );
    await assert.rejects(
        createManualRegistration(
            f.db,
            f.manager,
            f.guildId,
            f.scrimId,
            { userId: '999000000000000001' },
            f.access
        ),
        errorCode('NOT_FOUND')
    );
    await fill(f, 10);
    await add(10);
    const [added] = await f.db
        .select()
        .from(schema.scrimParticipants)
        .where(eq(schema.scrimParticipants.userId, f.actors[10]!.userId));
    assert.equal(added!.riotAccountId, f.accounts[10]!.id);
    assert.equal(
        (await registrations(f)).find((row) => row.userId === f.actors[10]!.userId)!.status,
        'standby'
    );
    await assert.rejects(add(10), errorCode('CONFLICT'));
    await add(11);
    await assert.rejects(add(12), errorCode('CONFLICT'));
    await f.db.update(schema.scrims).set({ status: 'preparing' }).where(eq(schema.scrims.id, f.scrimId));
    await assert.rejects(add(12), errorCode('CONFLICT'));
    assert.equal((await registrations(f)).length, 12);
});

test('일괄 수동 추가는 순서대로 선발·대기를 채우고 사람별 실패와 실제 추가자를 보존한다', async (t) => {
    const f = await createRecruitmentFixture(t);
    await fill(f, 9);
    const target = f.actors[9]!;
    await f.db.delete(schema.guildRiotAccounts).where(eq(schema.guildRiotAccounts.userId, target.userId));
    const ids = [
        f.actors[0]!.userId,
        '999000000000000001',
        ...f.actors.slice(9, 13).map((actor) => actor.userId)
    ];
    const results = await createManualRegistrations(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        [...ids, target.userId],
        f.access
    );
    assert.deepEqual(
        results.map((result) => [result.userId, result.status]),
        ids.map((id, index) => [id, ['failed', 'failed', 'selected', 'standby', 'standby', 'failed'][index]])
    );
    assert.match(results[0]!.status === 'failed' ? results[0]!.message : '', /이미 신청/);
    assert.match(results[5]!.status === 'failed' ? results[5]!.message : '', /정원/);
    const added = await f.db
        .select()
        .from(schema.scrimParticipants)
        .where(eq(schema.scrimParticipants.userId, target.userId));
    assert.equal(added[0]!.riotAccountId, null);
    const saved = await f.db
        .select()
        .from(schema.scrimParticipantRegistrations)
        .where(eq(schema.scrimParticipantRegistrations.scrimParticipantId, added[0]!.id));
    assert.equal(saved[0]!.joinedByUserId, f.manager.userId);
    assert.equal((await registrations(f)).length, 12);
    await f.db.update(schema.scrims).set({ reserveCapacity: 3 }).where(eq(schema.scrims.id, f.scrimId));
    assert.deepEqual(
        await createManualRegistrations(
            f.db,
            f.manager,
            f.guildId,
            f.scrimId,
            [f.actors[12]!.userId],
            f.access
        ),
        [{ userId: f.actors[12]!.userId, status: 'standby' }]
    );
});

test('일괄 수동 추가는 권한·전체 입력을 먼저 검사하고 동시 요청에도 정원을 넘지 않는다', async (t) => {
    const f = await createRecruitmentFixture(t);
    const ids = f.actors.slice(2, 18).map((actor) => actor.userId);
    await assert.rejects(
        createManualRegistrations(f.db, f.viewer, f.guildId, f.scrimId, ids, f.access),
        errorCode('FORBIDDEN')
    );
    await assert.rejects(
        createManualRegistrations(f.db, f.manager, f.guildId, f.scrimId, [ids[0]!, 'invalid'], f.access),
        errorCode('INVALID_INPUT')
    );
    assert.equal((await registrations(f)).length, 0);
    const batches = await Promise.all([
        createManualRegistrations(f.db, f.manager, f.guildId, f.scrimId, ids.slice(0, 8), f.access),
        createManualRegistrations(f.db, f.manager, f.guildId, f.scrimId, ids.slice(8), f.access)
    ]);
    assert.equal(batches.flat().filter((result) => result.status === 'failed').length, 4);
    const active = await registrations(f);
    assert.equal(active.filter((row) => row.status === 'selected').length, 10);
    assert.equal(active.filter((row) => row.status === 'standby').length, 2);
});

test('Riot 계정 없이 신청·조회·수정·철회하고 기존 희망 포지션을 재사용한다', async (t) => {
    const f = await createRecruitmentFixture(t);
    const actor = f.actors[0]!;
    await f.db.delete(schema.guildRiotAccounts).where(eq(schema.guildRiotAccounts.userId, actor.userId));
    await createRegistration(
        f.db,
        actor,
        f.guildId,
        f.scrimId,
        { riotAccountId: null, positions: ['mid'] },
        f.access
    );
    let detail = await getScrimDetail(f.db, actor, f.guildId, f.scrimId, f.access);
    assert.ok(detail?.myRegistration);
    assert.equal(detail.myRegistration.riotAccountId, null);
    await updateRegistration(
        f.db,
        actor,
        f.guildId,
        f.scrimId,
        { riotAccountId: null, positions: ['support'] },
        f.access
    );
    detail = await getScrimDetail(f.db, actor, f.guildId, f.scrimId, f.access);
    assert.deepEqual(detail?.myRegistration?.positions, ['support']);
    await withdrawRegistration(f.db, actor, f.guildId, f.scrimId, f.access);
    detail = await getScrimDetail(f.db, actor, f.guildId, f.scrimId, f.access);
    assert.equal(detail?.myRegistration, null);
    assert.deepEqual(detail?.previousPositions, ['support']);
    assert.equal((await registrations(f)).length, 0);
});

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

test('3팀으로 생성하거나 변경할 수 없고 기존 내전은 그대로 남는다', async (t) => {
    const f = await createRecruitmentFixture(t);
    const before = await f.row();
    const invalid = { ...settings, teamCount: 3 };
    await assert.rejects(
        createScrim(f.db, f.manager, f.guildId, { ...invalid, requestId: randomUUID() }, f.access),
        errorCode('INVALID_INPUT')
    );
    await assert.rejects(
        updateScrimSettings(
            f.db,
            f.manager,
            f.guildId,
            f.scrimId,
            { expectedRevision: before.revision, settings: invalid },
            f.access
        ),
        errorCode('INVALID_INPUT')
    );
    assert.deepEqual(await f.db.select().from(schema.scrims), [before]);
});

test('모집 중에는 2팀을 4팀으로 늘리거나 다시 2팀으로 줄일 수 있다', async (t) => {
    const f = await createRecruitmentFixture(t);
    for (const teamCount of [4, 2]) {
        await updateScrimSettings(
            f.db,
            f.manager,
            f.guildId,
            f.scrimId,
            { ...(await f.revision()), settings: { ...settings, teamCount } },
            f.access
        );
        const saved = (await getScrimSettings(f.db, f.manager, f.guildId, f.scrimId, f.access))!;
        assert.equal(saved.teamCount, teamCount);
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

test('기존 대기는 시각 없이 마이그레이션하고 철회 뒤에도 유지하며 재신청은 새 이력이다', async (t) => {
    const f = await createRecruitmentFixture(t);
    await fill(f, 12);
    await f.pool.query('ALTER TABLE scrim_participant_registrations DROP COLUMN available_at');
    await f.pool.query(f.migrationSql('0023_standby_reservations'));
    const before = await registrations(f);
    const original = before.find((row) => row.userId === f.manager.userId)!;
    const waiting = before.filter((row) => row.status === 'standby');
    assert.ok(before.every((row) => row.availableAt === null));
    await withdrawRegistration(f.db, f.manager, f.guildId, f.scrimId, f.access);
    await promoteDueStandby(f.db);
    assert.deepEqual(
        (await registrations(f)).filter((row) => row.status === 'standby'),
        waiting
    );
    await join(f, 0);
    const renewed = (await registrations(f)).find((row) => row.userId === f.manager.userId)!;
    assert.notEqual(renewed.id, original.id);
    assert.equal(renewed.participantId, original.participantId);
    assert.equal(renewed.status, 'selected');
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

test('반복 철회·재신청·제외 뒤에도 참가자와 인원은 최신 신청 한 건이며 원본 이력은 보존한다', async (t) => {
    const f = await createRecruitmentFixture(t);
    const actor = f.actors[2]!;
    let participantId: string | undefined;
    const check = async (
        status: 'selected' | 'withdrawn' | 'excluded',
        registrationId: string,
        historyCount: number
    ) => {
        const detail = (await getScrimDetail(f.db, actor, f.guildId, f.scrimId, f.access))!;
        assert.equal(detail.participants.length, 1);
        const participant = detail.participants[0]!;
        assert.equal(participant.userId, actor.userId);
        assert.equal(participant.registrationId, registrationId);
        assert.equal(participant.status, status);
        participantId ??= participant.participantId;
        assert.equal(participant.participantId, participantId);
        assert.deepEqual(
            [detail.counts.selected, detail.counts.standby, detail.counts.withdrawn, detail.counts.excluded],
            [Number(status === 'selected'), 0, Number(status === 'withdrawn'), Number(status === 'excluded')]
        );
        assert.equal(detail.myRegistration?.id ?? null, status === 'selected' ? registrationId : null);
        const history = await f.db
            .select()
            .from(schema.scrimParticipantRegistrations)
            .where(eq(schema.scrimParticipantRegistrations.scrimParticipantId, participantId));
        assert.equal(history.length, historyCount);
        assert.equal(new Set(history.map((entry) => entry.scrimParticipantId)).size, 1);
    };

    for (let attempt = 1; attempt <= 2; attempt++) {
        await join(f, 2);
        const registrationId = (await registrations(f))[0]!.id;
        await check('selected', registrationId, attempt);
        await withdrawRegistration(f.db, actor, f.guildId, f.scrimId, f.access);
        await check('withdrawn', registrationId, attempt);
    }
    await join(f, 2);
    const registrationId = (await registrations(f))[0]!.id;
    await check('selected', registrationId, 3);
    await setParticipantStatus(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        {
            ...(await f.revision()),
            registrationIds: [registrationId],
            status: 'excluded'
        },
        f.access
    );
    await check('excluded', registrationId, 3);
    await createManualRegistration(f.db, f.manager, f.guildId, f.scrimId, { userId: actor.userId }, f.access);
    const restoredId = (await registrations(f))[0]!.id;
    await check('selected', restoredId, 4);
    const history = await f.db
        .select()
        .from(schema.scrimParticipantRegistrations)
        .where(eq(schema.scrimParticipantRegistrations.scrimParticipantId, participantId!));
    assert.deepEqual(
        history.map((entry) => entry.status).sort(),
        ['withdrawn', 'withdrawn', 'excluded', 'selected'].sort()
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
    for (const status of ['all', 'done'] as const) {
        const options = { status, page: 1, pageSize: 1 };
        const hidden = await listScrims(f.db, null, f.guildId, options);
        assert.equal(hidden.hasScrims, true);
        assert.equal(hidden.total, 0);
        assert.equal(hidden.counts[status], 0);
        assert.deepEqual(hidden.scrims, []);
        const shown = await listScrims(f.db, null, f.guildId, { ...options, includeCancelled: true });
        assert.equal(shown.total, 1);
        assert.equal(shown.counts[status], 1);
        assert.equal(shown.scrims[0]?.id, f.scrimId);
    }
});

test('수동 대기 전환·제외·설정 확장 후에도 기존 대기자는 자동 승급하지 않는다', async (t) => {
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
    await updateScrimSettings(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        {
            ...(await f.revision()),
            settings: { ...f.input, teamCount: 4 }
        },
        f.access
    );
    await promoteDueStandby(f.db);
    const after = await registrations(f);
    assert.equal(after.length, 11);
    assert.equal(after.filter((row) => row.status === 'selected').length, 8);
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

test('시간 지정 대기는 선발 자리를 비워 두며 만석일 때에는 합류 시각 순으로 빈자리만 채운다', async (t) => {
    const f = await createRecruitmentFixture(t);
    await fill(f, 9);
    const future = new Date(Date.now() + 3_600_000).toISOString();
    await Promise.all([join(f, 9, future), join(f, 10, future)]);
    assert.equal(
        await createManualRegistration(
            f.db,
            f.manager,
            f.guildId,
            f.scrimId,
            { userId: f.actors[11]!.userId },
            f.access
        ),
        'selected'
    );

    const standby = (await registrations(f)).filter((r) => r.status === 'standby');
    assert.equal(standby.length, 2);
    // 늦게 신청한 사람의 합류 시각이 먼저인 상황을 만든다.
    await f.db
        .update(schema.scrimParticipantRegistrations)
        .set({ availableAt: sql`now() - interval '1 minute'` })
        .where(eq(schema.scrimParticipantRegistrations.id, standby[0]!.id));
    await f.db
        .update(schema.scrimParticipantRegistrations)
        .set({ availableAt: sql`now() - interval '2 minutes'` })
        .where(eq(schema.scrimParticipantRegistrations.id, standby[1]!.id));
    const revision = (await f.row()).revision;
    await promoteDueStandby(f.db);
    assert.equal((await f.row()).revision, revision);
    assert.equal((await registrations(f)).filter((r) => r.availableAt !== null).length, 2);

    await withdrawRegistration(f.db, f.actors[0]!, f.guildId, f.scrimId, f.access);
    const after = await registrations(f);
    assert.equal(after.filter((r) => r.status === 'selected').length, 10);
    assert.equal(after.find((r) => r.id === standby[1]!.id)?.status, 'selected');
    assert.ok(after.find((r) => r.id === standby[0]!.id)?.availableAt);
    assert.equal((await f.row()).revision, revision + 1);

    const target = after.find((r) => r.userId === f.actors[1]!.userId)!;
    await setParticipantStatus(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        {
            ...(await f.revision()),
            registrationIds: [target.id],
            status: 'excluded'
        },
        f.access
    );
    const remaining = await registrations(f);
    assert.equal(remaining.filter((r) => r.status === 'selected').length, 10);
    assert.ok(remaining.every((r) => r.availableAt === null));
    await join(f, 12, future);
    await closeRecruitment(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    await reopenRecruitment(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    const waiting = (await registrations(f)).find((r) => r.userId === f.actors[12]!.userId);
    assert.equal(waiting?.status, 'standby');
    assert.equal(waiting.availableAt, null);
});

test('신규 신청보다 합류 가능한 대기가 먼저 이동하고 정원 증가 시 같은 시각의 대기자는 신청순으로 이동한다', async (t) => {
    const f = await createRecruitmentFixture(t, { reserveCapacity: 4 });
    await fill(f, 9);
    const future = new Date(Date.now() + 3_600_000).toISOString();
    for (const index of [9, 10, 11]) await join(f, index, future);
    const waiters = (await registrations(f)).filter((r) => r.status === 'standby');
    await f.db
        .update(schema.scrimParticipantRegistrations)
        .set({ availableAt: sql`now() - interval '1 second'` })
        .where(
            inArray(
                schema.scrimParticipantRegistrations.id,
                waiters.slice(0, 2).map((r) => r.id)
            )
        );

    await Promise.all([join(f, 12), promoteDueStandby(f.db)]);
    const full = await registrations(f);
    assert.equal(full.find((r) => r.id === waiters[0]!.id)?.status, 'selected');
    assert.equal(full.find((r) => r.id === waiters[1]!.id)?.status, 'standby');
    assert.equal(full.find((r) => r.userId === f.actors[12]!.userId)?.status, 'standby');
    assert.equal(full.filter((r) => r.status === 'selected').length, 10);

    await updateScrimSettings(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        {
            ...(await f.revision()),
            settings: { ...f.input, teamCount: 4 }
        },
        f.access
    );
    const expanded = await registrations(f);
    assert.equal(expanded.filter((r) => r.status === 'selected').length, 11);
    assert.equal(expanded.find((r) => r.id === waiters[1]!.id)?.status, 'selected');
    assert.equal(expanded.find((r) => r.id === waiters[2]!.id)?.availableAt?.toISOString(), future);
    assert.equal(expanded.find((r) => r.userId === f.actors[12]!.userId)?.status, 'standby');
});

test('합류 시각 전에는 바뀌지 않고 재시작한 워커와 동시에 기한을 처리해도 명단·게시 작업은 한 번만 갱신한다', async (t) => {
    const f = await createRecruitmentFixture(t);
    await f.db
        .insert(schema.guildDiscordSettings)
        .values({ guildId: f.guildId, recruitmentChannelId: '810000000000000003' });
    const future = new Date(Date.now() + 3_600_000).toISOString();
    for (let index = 0; index < 3; index++) await join(f, index, future);
    const before = await registrations(f);
    const revision = (await f.row()).revision;
    const job = async () =>
        (
            await f.db
                .select()
                .from(schema.discordPublicationJobs)
                .where(
                    and(
                        eq(schema.discordPublicationJobs.scrimId, f.scrimId),
                        eq(schema.discordPublicationJobs.kind, 'recruitment')
                    )
                )
        )[0]!;
    const jobRevision = (await job()).revision;
    await promoteDueStandby(f.db);
    assert.deepEqual(await registrations(f), before);
    assert.equal((await f.row()).revision, revision);
    assert.equal((await job()).revision, jobRevision);
    await f.db
        .update(schema.scrimParticipantRegistrations)
        .set({ availableAt: sql`now() - interval '1 millisecond'` })
        .where(
            inArray(
                schema.scrimParticipantRegistrations.id,
                before.slice(0, 2).map((row) => row.id)
            )
        );
    const pool = new Pool({ connectionString: f.connectionString });
    try {
        const restarted = drizzle(pool, { schema });
        await Promise.all([promoteDueStandby(restarted), promoteDueStandby(f.db)]);
        await promoteDueStandby(restarted);
    } finally {
        await pool.end();
    }
    const after = await registrations(f);
    assert.deepEqual(
        after.map((row) => row.status),
        ['selected', 'selected', 'standby']
    );
    assert.deepEqual(
        after.map((row) => row.availableAt?.toISOString() ?? null),
        [null, null, future]
    );
    assert.equal((await f.row()).revision, revision + 1);
    assert.equal((await job()).revision, jobRevision + 1);
});

test('대기 재지정·수동 배정·제외·철회·내전 취소가 합류 시각을 해제하고 취소 복구는 합류 시각을 되살리지 않는다', async (t) => {
    const f = await createRecruitmentFixture(t);
    const future = new Date(Date.now() + 3_600_000).toISOString();
    for (let index = 0; index < 5; index++) await join(f, index, future);
    const before = await registrations(f);
    const id = (index: number) => before.find((row) => row.userId === f.actors[index]!.userId)!.id;
    await f.db.transaction((tx) =>
        setOwnStandbyInTransaction(tx, f.manager, f.guildId, f.scrimId, { registrationId: id(0) })
    );
    for (const [index, status] of [
        [1, 'standby'],
        [2, 'excluded']
    ] as const)
        await setParticipantStatus(
            f.db,
            f.manager,
            f.guildId,
            f.scrimId,
            { ...(await f.revision()), registrationIds: [id(index)], status },
            f.access
        );
    await withdrawRegistration(f.db, f.actors[3]!, f.guildId, f.scrimId, f.access);
    const pending = await f.db.select().from(schema.scrimParticipantRegistrations);
    assert.deepEqual(
        pending.filter((row) => row.availableAt !== null).map((row) => row.id),
        [id(4)]
    );
    await cancelScrim(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    await restoreCancelledScrim(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    await promoteDueStandby(f.db);
    const restored = await registrations(f);
    assert.equal(restored.length, 3);
    assert.ok(restored.every((row) => row.status === 'standby' && row.availableAt === null));
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
