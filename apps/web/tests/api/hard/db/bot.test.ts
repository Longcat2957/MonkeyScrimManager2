import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { type TestContext } from 'node:test';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { BotPublication, BotRegistrationInput } from '../../../../../../shared/bot-api.js';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import {
    createBotScrim,
    getBotManualRegistration,
    addBotParticipant,
    getBotRegistration,
    initializeBotGuild,
    mutateBotRegistration,
    synchronizeBotGuild,
    listFailedPublications,
    retryBotPublication,
    listKnownBotMembers,
    reconcileBotGuilds
} from '../../../../src/lib/server/discord/bot-service.ts';
import { createDiscordClient, DiscordError } from '../../../../src/lib/server/discord/client.ts';
import { claimPublication, completePublication } from '../../../../src/lib/server/discord/publications.ts';
import { setGuildDiscordSetting } from '../../../../src/lib/server/guild/settings.ts';
import { confirmManualFormation } from '../../../../src/lib/server/scrims/manual.ts';
import {
    cancelScrim,
    createRegistration,
    createRegistrationInTransaction,
    createScrim,
    updateScrimSettings
} from '../../../../src/lib/server/scrims/service.ts';
import { revertScrim } from '../../../../src/lib/server/scrims/workflow.ts';
import { createAccessFixture } from '../../support/access-fixtures.ts';
import {
    concurrently,
    createFormationFixture,
    createRecruitmentFixture,
    errorCode,
    settings
} from '../../support/domain-fixtures.ts';

let interactionNumber = 990000000000000001n;
const nextInteractionId = () => String(interactionNumber++);
const messageId = '990000000000000091';

async function createBotFixture(t: TestContext, configured = true, scheduledAt: string | null = null) {
    const f = await createAccessFixture(t);
    await f.db
        .insert(schema.mmrSeasons)
        .values({ guildId: f.ids.guild, name: '봇 시즌', startedAt: new Date(0) });
    if (configured)
        await f.db
            .insert(schema.guildDiscordSettings)
            .values({ guildId: f.ids.guild, recruitmentChannelId: f.ids.channel });
    const account = await f.seedAccount();
    const scrimId = await createScrim(
        f.db,
        f.owner,
        f.ids.guild,
        { ...settings, scheduledAt, requestId: randomUUID() },
        f.dependencies
    );
    const row = async () =>
        (await f.db.select().from(schema.scrims).where(eq(schema.scrims.id, scrimId)))[0]!;
    const input = (): BotRegistrationInput => ({
        actorId: f.ids.member,
        interactionId: nextInteractionId(),
        action: 'create',
        riotAccountId: account.id,
        positions: ['mid', 'support']
    });
    const registrationRows = () => f.db.select().from(schema.scrimParticipantRegistrations);
    return { ...f, account, scrimId, row, input, registrationRows };
}

/** 실제 두 업무 연결의 충돌을 확인한 뒤 진행해 우연한 실행 순서로 교착이 숨지 않게 한다. */
async function registerWhilePublicationWaits(
    f: Awaited<ReturnType<typeof createBotFixture>>,
    publish: () => Promise<void>
) {
    let unlock!: () => void;
    const barrier = new Promise<void>((resolve) => {
        unlock = resolve;
    });
    let locked!: (pid: number) => void;
    let lockFailed!: (error: unknown) => void;
    const holder = new Promise<number>((resolve, reject) => {
        locked = resolve;
        lockFailed = reject;
    });
    const registration = f.db.transaction(async (tx) => {
        await tx
            .select({ id: schema.scrims.id })
            .from(schema.scrims)
            .where(eq(schema.scrims.id, f.scrimId))
            .for('update');
        const { rows } = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
        locked(rows[0]!.pid);
        await barrier;
        await createRegistrationInTransaction(tx, f.member, f.ids.guild, f.scrimId, {
            riotAccountId: f.account.id,
            positions: ['mid']
        });
    });
    void registration.catch(lockFailed);
    const publication = holder.then(publish);
    const results = Promise.allSettled([registration, publication]);
    try {
        const pid = await holder;
        const deadline = Date.now() + 3_000;
        let blocked = false;
        do {
            const result = await f.pool.query(
                'SELECT pid FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))',
                [pid]
            );
            blocked = result.rowCount !== 0;
            if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10));
        } while (!blocked && Date.now() < deadline);
        assert.ok(blocked, '게시 연결이 신청 트랜잭션의 실제 잠금을 기다려야 한다');
    } finally {
        unlock();
        const settled = await results;
        for (const result of settled) if (result.status === 'rejected') throw result.reason;
    }
}

test('봇 초기 설정은 일반 멤버를 자동 등록하고 동시·반복 실행에도 시즌과 멤버를 중복 생성하지 않는다', async (t) => {
    const f = await createAccessFixture(t);
    const newcomer = '990000000000000081';
    const bot = '990000000000000082';
    const withdrawn = '990000000000000083';
    f.members.get(f.ids.guild)!.set(newcomer, {
        user: { ...f.profile(newcomer), username: '신규 사용자' },
        nickname: '서버 새 별명',
        roleIds: []
    });
    f.members.get(f.ids.guild)!.set(bot, { user: f.profile(bot), isBot: true, roleIds: [] });
    f.members
        .get(f.ids.guild)!
        .set(withdrawn, { user: f.profile(withdrawn), nickname: '복원하지 않을 별명', roleIds: [] });
    await f.db.insert(schema.users).values({
        ...f.profile(withdrawn),
        username: '탈퇴한 사용자',
        withdrawnAt: new Date(),
        publicProfile: false,
        publicRiotIds: false
    });
    await assert.rejects(
        initializeBotGuild(
            f.db,
            f.ids.guild,
            { actorId: f.ids.member, interactionId: nextInteractionId() },
            f.dependencies
        ),
        errorCode('FORBIDDEN')
    );
    const results = await concurrently(
        [1, 2].map(
            () => () =>
                initializeBotGuild(
                    f.db,
                    f.ids.guild,
                    { actorId: f.ids.owner, interactionId: nextInteractionId() },
                    f.dependencies
                )
        )
    );
    assert.ok(results.every((result) => result.status === 'fulfilled'));
    const seasons = await f.db
        .select()
        .from(schema.mmrSeasons)
        .where(eq(schema.mmrSeasons.guildId, f.ids.guild));
    assert.equal(seasons.length, 1);
    assert.equal(seasons[0]!.endedAt, null);
    const repeated = await initializeBotGuild(
        f.db,
        f.ids.guild,
        { actorId: f.ids.owner, interactionId: nextInteractionId() },
        f.dependencies
    );
    assert.equal(repeated.seasonId, seasons[0]!.id);
    assert.equal(repeated.membersSynced, 4);
    const memberships = await f.db
        .select()
        .from(schema.guildMembers)
        .where(eq(schema.guildMembers.guildId, f.ids.guild));
    assert.equal(memberships.length, 4);
    assert.equal(memberships.find((member) => member.userId === newcomer)?.nickname, '서버 새 별명');
    assert.equal(memberships.find((member) => member.userId === newcomer)?.isAdmin, false);
    assert.ok(!memberships.some((member) => [bot, withdrawn, f.ids.bot].includes(member.userId)));
    const accounts = await f.db.select().from(schema.users);
    assert.equal(accounts.find((user) => user.id === newcomer)?.username, '신규 사용자');
    assert.equal(accounts.find((user) => user.id === newcomer)?.isServiceAdmin, false);
    assert.ok(!accounts.some((user) => user.id === bot));
    assert.equal(accounts.find((user) => user.id === withdrawn)?.username, '탈퇴한 사용자');
    assert.ok(accounts.find((user) => user.id === withdrawn)?.withdrawnAt);
    assert.equal((await f.db.select().from(schema.sessions)).length, 0);
});

test('초기 설정은 전체 명단 조회 실패나 조회 중 권한 회수 시 부분 멤버·시즌을 저장하지 않는다', async (t) => {
    for (const failure of ['조회 실패', '권한 회수']) {
        const f = await createAccessFixture(t);
        const newcomer = '990000000000000081';
        const discord = {
            ...f.discord,
            listMembers: async () => {
                if (failure === '조회 실패') throw new DiscordError(503, '멤버 목록을 가져올 수 없어요');
                f.guilds.get(f.ids.guild)!.ownerId = f.ids.otherMember;
                return [{ user: f.profile(newcomer), roleIds: [] }];
            }
        };
        await assert.rejects(
            initializeBotGuild(
                f.db,
                f.ids.guild,
                { actorId: f.ids.owner, interactionId: nextInteractionId() },
                { discord }
            ),
            (cause: unknown) =>
                failure === '조회 실패' ? cause instanceof DiscordError : errorCode('FORBIDDEN')(cause)
        );
        assert.equal((await f.db.select().from(schema.mmrSeasons)).length, 0);
        assert.equal((await f.db.select().from(schema.users).where(eq(schema.users.id, newcomer))).length, 0);
    }
});

test('종료된 시즌은 봇 초기 설정으로 임의 재개하거나 새 시즌으로 덮어쓰지 않는다', async (t) => {
    const f = await createAccessFixture(t);
    const [season] = await f.db
        .insert(schema.mmrSeasons)
        .values({ guildId: f.ids.guild, name: '종료 시즌', startedAt: new Date(0), endedAt: new Date(1_000) })
        .returning();
    await assert.rejects(
        initializeBotGuild(
            f.db,
            f.ids.guild,
            { actorId: f.ids.owner, interactionId: nextInteractionId() },
            f.dependencies
        ),
        errorCode('CONFLICT')
    );
    assert.deepEqual(await f.db.select().from(schema.mmrSeasons), [season]);
});

test('봇 모집 생성은 재전송에 같은 내전을 반환하고 같은 interaction의 다른 입력은 거절한다', async (t) => {
    const f = await createAccessFixture(t);
    const input = { ...settings, actorId: f.ids.owner, interactionId: nextInteractionId() };
    await assert.rejects(createBotScrim(f.db, f.ids.guild, input, f.dependencies), errorCode('CONFLICT'));
    assert.equal((await f.db.select().from(schema.scrims)).length, 0);
    await initializeBotGuild(
        f.db,
        f.ids.guild,
        { actorId: f.ids.owner, interactionId: nextInteractionId() },
        f.dependencies
    );
    const first = await createBotScrim(f.db, f.ids.guild, input, f.dependencies);
    const replay = await createBotScrim(f.db, f.ids.guild, input, f.dependencies);
    assert.equal(replay.scrimId, first.scrimId);
    await assert.rejects(
        createBotScrim(f.db, f.ids.guild, { ...input, title: '다른 내용' }, f.dependencies),
        errorCode('CONFLICT')
    );
    assert.equal((await f.db.select().from(schema.scrims)).length, 1);
});

test('같은 참가 interaction의 동시 처리와 재전송은 신청·revision을 한 번만 변경한다', async (t) => {
    const f = await createBotFixture(t);
    const input = f.input();
    const before = await f.row();
    const results = await concurrently(
        [1, 2].map(() => () => mutateBotRegistration(f.db, f.ids.guild, f.scrimId, input, f.dependencies))
    );
    assert.ok(results.every((result) => result.status === 'fulfilled'));
    const first = results[0];
    const second = results[1];
    assert.ok(first?.status === 'fulfilled' && second?.status === 'fulfilled');
    assert.deepEqual(first.value, second.value);
    assert.equal(first.value.registration?.status, 'selected');
    assert.equal((await f.registrationRows()).length, 1);
    assert.equal((await f.row()).revision, before.revision + 1);
    const receipts = await f.pool.query(
        'SELECT interaction_id FROM discord_interaction_receipts WHERE interaction_id=$1',
        [input.interactionId]
    );
    assert.equal(receipts.rowCount, 1);
    await assert.rejects(
        mutateBotRegistration(f.db, f.ids.guild, f.scrimId, { ...input, positions: ['top'] }, f.dependencies),
        errorCode('CONFLICT')
    );
    assert.equal((await f.row()).revision, before.revision + 1);
});

test('합류 시각은 본인의 신청에만 저장되며 변경·재전송에도 계정과 희망 포지션을 보존한다', async (t) => {
    const expectedScheduledAt = new Date().toISOString();
    const f = await createBotFixture(t, true, expectedScheduledAt);
    const waiting: BotRegistrationInput = {
        ...f.input(),
        action: 'standby',
        expectedScheduledAt,
        availableAt: new Date(Date.now() + 3_600_000).toISOString(),
        riotAccountId: null,
        positions: ['jungle', 'mid']
    };
    for (const [patch, code] of [
        [{ availableAt: undefined }, 'INVALID_INPUT'],
        [{ expectedScheduledAt: undefined }, 'INVALID_INPUT'],
        [{ expectedScheduledAt: waiting.availableAt }, 'CONFLICT']
    ] as const) {
        await assert.rejects(
            mutateBotRegistration(f.db, f.ids.guild, f.scrimId, { ...waiting, ...patch }, f.dependencies),
            errorCode(code)
        );
    }
    const joined = await mutateBotRegistration(f.db, f.ids.guild, f.scrimId, waiting, f.dependencies);
    assert.equal(joined.registration?.status, 'standby');
    assert.equal(joined.registration?.availableAt, waiting.availableAt);
    assert.equal(joined.registration?.riotAccountId, null);
    assert.deepEqual(joined.registration?.positions, ['jungle', 'mid']);
    assert.deepEqual(
        await mutateBotRegistration(f.db, f.ids.guild, f.scrimId, waiting, f.dependencies),
        joined
    );
    assert.equal((await f.registrationRows()).length, 1);
    const standby: BotRegistrationInput = {
        actorId: f.ids.member,
        interactionId: nextInteractionId(),
        action: 'standby',
        expectedScheduledAt,
        availableAt: new Date(Date.now() + 7_200_000).toISOString(),
        registrationId: joined.registration!.id
    };
    const demoted = await mutateBotRegistration(f.db, f.ids.guild, f.scrimId, standby, f.dependencies);
    assert.equal(demoted.registration?.status, 'standby');
    assert.equal(demoted.registration?.availableAt, standby.availableAt);
    assert.equal(demoted.registration?.id, joined.registration?.id);
    assert.equal(demoted.registration?.riotAccountId, null);
    assert.deepEqual(demoted.registration?.positions, ['jungle', 'mid']);
    assert.equal((await f.registrationRows()).length, 1);
    const revision = (await f.row()).revision;
    await mutateBotRegistration(f.db, f.ids.guild, f.scrimId, standby, f.dependencies);
    assert.equal((await f.row()).revision, revision);
    await assert.rejects(
        mutateBotRegistration(
            f.db,
            f.ids.guild,
            f.scrimId,
            { ...standby, interactionId: nextInteractionId(), registrationId: randomUUID() },
            f.dependencies
        ),
        errorCode('CONFLICT')
    );
    await assert.rejects(
        mutateBotRegistration(
            f.db,
            f.ids.guild,
            f.scrimId,
            { ...standby, actorId: f.ids.otherMember, interactionId: nextInteractionId() },
            f.dependencies
        ),
        errorCode('CONFLICT')
    );
    await cancelScrim(f.db, f.owner, f.ids.guild, f.scrimId, { expectedRevision: revision }, f.dependencies);
    await assert.rejects(
        mutateBotRegistration(
            f.db,
            f.ids.guild,
            f.scrimId,
            { ...standby, interactionId: nextInteractionId() },
            f.dependencies
        ),
        errorCode('CONFLICT')
    );
    await assert.rejects(
        mutateBotRegistration(
            f.db,
            f.ids.guild,
            f.scrimId,
            { ...waiting, actorId: f.ids.otherMember, interactionId: nextInteractionId() },
            f.dependencies
        ),
        errorCode('CONFLICT')
    );
});

test('선발 만석에서도 봇으로 합류 시각을 등록·변경하고 전체 신청 정원을 지킨다', async (t) => {
    const expectedScheduledAt = new Date().toISOString();
    const f = await createRecruitmentFixture(t, { scheduledAt: expectedScheduledAt });
    for (let index = 0; index < 10; index++)
        await createRegistration(
            f.db,
            f.actors[index]!,
            f.guildId,
            f.scrimId,
            { riotAccountId: null, positions: ['mid'] },
            f.access
        );
    const availableAt = new Date(Date.now() + 3_600_000).toISOString();
    const waiting: BotRegistrationInput = {
        actorId: f.actors[10]!.userId,
        interactionId: nextInteractionId(),
        action: 'standby',
        riotAccountId: null,
        positions: ['mid'],
        expectedScheduledAt,
        availableAt
    };
    const save = (input: BotRegistrationInput) =>
        mutateBotRegistration(f.db, f.guildId, f.scrimId, input, f.access);
    const timed = await save(waiting);
    assert.equal(timed.registration?.status, 'standby');
    assert.equal(timed.registration?.availableAt, availableAt);
    const immediate = await save({
        action: 'create',
        actorId: f.actors[11]!.userId,
        interactionId: nextInteractionId(),
        riotAccountId: null,
        positions: ['mid']
    });
    assert.equal(immediate.registration?.status, 'standby');
    assert.equal(immediate.registration?.availableAt, null);
    await assert.rejects(
        save({ ...waiting, actorId: f.actors[12]!.userId, interactionId: nextInteractionId() }),
        errorCode('CONFLICT')
    );
    const change = { ...waiting, registrationId: immediate.registration!.id, actorId: f.actors[11]!.userId };
    const edited = await save({ ...change, interactionId: nextInteractionId() });
    assert.equal(edited.registration?.availableAt, availableAt);
    await assert.rejects(
        save({ ...change, availableAt: undefined, interactionId: nextInteractionId() }),
        errorCode('INVALID_INPUT')
    );
    await f.db
        .update(schema.scrimParticipantRegistrations)
        .set({ availableAt: sql`now() - interval '1 minute'` })
        .where(eq(schema.scrimParticipantRegistrations.id, timed.registration!.id));
    const actorId = f.actors[0]!.userId;
    const selected = await getBotRegistration(f.db, f.guildId, f.scrimId, actorId, f.access);
    const switched = await save({
        ...change,
        actorId,
        registrationId: selected.registration!.id,
        interactionId: nextInteractionId()
    });
    assert.equal(switched.registration?.status, 'standby');
    const all = await f.db.select().from(schema.scrimParticipantRegistrations);
    assert.equal(all.find((r) => r.id === timed.registration!.id)?.status, 'selected');
    assert.equal(all.filter((r) => r.status === 'selected').length, 10);
    assert.equal(all.filter((r) => r.status === 'standby' && r.availableAt !== null).length, 2);
});

test('웹 가입·Riot 연결 없는 Discord 멤버도 참가 화면에서 자동 사용자 생성 후 모든 포지션으로 신청한다', async (t) => {
    const f = await createBotFixture(t);
    const userId = '990000000000102001';
    const profile = { ...f.profile(userId), globalName: '신규 Discord 참가자' };
    f.members.get(f.ids.guild)!.set(userId, { user: profile, roleIds: [] });
    assert.deepEqual(await f.db.select().from(schema.users).where(eq(schema.users.id, userId)), []);
    assert.deepEqual(
        await f.db.select().from(schema.guildMembers).where(eq(schema.guildMembers.userId, userId)),
        []
    );
    const context = await getBotRegistration(f.db, f.ids.guild, f.scrimId, userId, f.dependencies);
    assert.equal(context.canEdit, true);
    assert.deepEqual(context.accounts, []);
    assert.equal(context.registration, null);
    const input: BotRegistrationInput = {
        actorId: userId,
        interactionId: nextInteractionId(),
        action: 'create',
        riotAccountId: null,
        positions: ['top', 'jungle', 'mid', 'bot', 'support']
    };
    const joined = await mutateBotRegistration(f.db, f.ids.guild, f.scrimId, input, f.dependencies);
    assert.equal(joined.registration?.status, 'selected');
    assert.equal(joined.registration?.riotAccountId, null);
    assert.deepEqual(joined.registration?.positions, input.positions);
    const [user] = await f.db.select().from(schema.users).where(eq(schema.users.id, userId));
    assert.ok(user);
    assert.equal(user.globalName, profile.globalName);
    assert.equal(user.isServiceAdmin, false);
    const [membership] = await f.db
        .select()
        .from(schema.guildMembers)
        .where(and(eq(schema.guildMembers.guildId, f.ids.guild), eq(schema.guildMembers.userId, userId)));
    assert.ok(membership);
    assert.equal(membership.isAdmin, false);
    const [participant] = await f.db
        .select()
        .from(schema.scrimParticipants)
        .where(
            and(eq(schema.scrimParticipants.scrimId, f.scrimId), eq(schema.scrimParticipants.userId, userId))
        );
    assert.ok(participant);
    assert.equal(participant.riotAccountId, null);
    assert.equal(participant.displayName, profile.globalName);
    const registrations = await f.db
        .select()
        .from(schema.scrimParticipantRegistrations)
        .where(eq(schema.scrimParticipantRegistrations.scrimParticipantId, participant.id));
    assert.equal(registrations.length, 1);
    assert.equal(registrations[0]!.joinedByUserId, userId);
    assert.equal(registrations[0]!.status, 'selected');
    assert.deepEqual(await f.db.select().from(schema.sessions).where(eq(schema.sessions.userId, userId)), []);
    assert.deepEqual(
        await f.db.select().from(schema.guildRiotAccounts).where(eq(schema.guildRiotAccounts.userId, userId)),
        []
    );
});

test('봇 운영자는 웹 미가입 멤버를 별명으로 대신 신청하며 재전송·대상·권한 경계를 지킨다', async (t) => {
    const f = await createBotFixture(t);
    const userId = '990000000000102011';
    const elsewhere = '990000000000102012';
    f.members.get(f.ids.guild)!.set(userId, {
        user: { ...f.profile(userId), globalName: '전역 표시 이름' },
        nickname: '현재 서버 별명',
        roleIds: []
    });
    f.members.get(f.ids.otherGuild)!.set(elsewhere, { user: f.profile(elsewhere), roleIds: [] });
    assert.equal((await f.db.select().from(schema.users).where(eq(schema.users.id, userId))).length, 0);
    const input = { actorId: f.ids.owner, userId, interactionId: nextInteractionId() };
    await assert.rejects(
        getBotManualRegistration(f.db, f.ids.guild, f.scrimId, f.ids.member, f.dependencies),
        errorCode('FORBIDDEN')
    );
    await assert.rejects(
        addBotParticipant(f.db, f.ids.guild, f.scrimId, { ...input, actorId: f.ids.member }, f.dependencies),
        errorCode('FORBIDDEN')
    );
    for (const target of [elsewhere, f.ids.bot])
        await assert.rejects(
            addBotParticipant(
                f.db,
                f.ids.guild,
                f.scrimId,
                { ...input, userId: target, interactionId: nextInteractionId() },
                f.dependencies
            ),
            errorCode('NOT_FOUND')
        );
    await assert.rejects(
        getBotManualRegistration(f.db, f.ids.otherGuild, f.scrimId, f.ids.owner, f.dependencies),
        errorCode('NOT_FOUND')
    );
    const context = await getBotManualRegistration(f.db, f.ids.guild, f.scrimId, f.ids.owner, f.dependencies);
    assert.equal(context.canAdd, true);
    const result = await addBotParticipant(f.db, f.ids.guild, f.scrimId, input, f.dependencies);
    assert.equal(result.participant.name, '현재 서버 별명');
    assert.equal(result.participant.status, 'selected');
    assert.deepEqual(await addBotParticipant(f.db, f.ids.guild, f.scrimId, input, f.dependencies), result);
    const [participant] = await f.db
        .select()
        .from(schema.scrimParticipants)
        .where(
            and(eq(schema.scrimParticipants.scrimId, f.scrimId), eq(schema.scrimParticipants.userId, userId))
        );
    assert.ok(participant);
    assert.equal(participant.displayName, '현재 서버 별명');
    assert.equal(participant.riotAccountId, null);
    const registrations = await f.registrationRows();
    assert.equal(registrations.length, 1);
    assert.equal(registrations[0]!.joinedByUserId, f.ids.owner);
    assert.deepEqual(
        (
            await f.db
                .select()
                .from(schema.scrimParticipantPreferences)
                .where(eq(schema.scrimParticipantPreferences.scrimParticipantId, participant.id))
        )
            .map((preference) => preference.position)
            .sort(),
        ['top', 'jungle', 'mid', 'bot', 'support'].sort()
    );
    const [user] = await f.db.select().from(schema.users).where(eq(schema.users.id, userId));
    assert.ok(user);
    assert.equal(user.isServiceAdmin, false);
    assert.equal(
        (await f.db.select().from(schema.sessions).where(eq(schema.sessions.userId, userId))).length,
        0
    );
    const [membership] = await f.db
        .select()
        .from(schema.guildMembers)
        .where(and(eq(schema.guildMembers.guildId, f.ids.guild), eq(schema.guildMembers.userId, userId)));
    assert.equal(membership?.nickname, '현재 서버 별명');
    assert.equal(membership?.isAdmin, false);
});

test('철회 후 옛 참가 재전송은 재가입하지 않고 새 신청에는 새 이력이 생긴다', async (t) => {
    const f = await createBotFixture(t);
    const input = f.input();
    const joined = await mutateBotRegistration(f.db, f.ids.guild, f.scrimId, input, f.dependencies);
    const oldId = joined.registration!.id;
    const withdrawal: BotRegistrationInput = {
        actorId: f.ids.member,
        interactionId: nextInteractionId(),
        action: 'withdraw',
        registrationId: oldId
    };
    await mutateBotRegistration(f.db, f.ids.guild, f.scrimId, withdrawal, f.dependencies);
    await mutateBotRegistration(f.db, f.ids.guild, f.scrimId, input, f.dependencies);
    assert.equal((await f.registrationRows()).length, 1);
    assert.equal((await f.registrationRows())[0]!.status, 'withdrawn');
    const renewed = await mutateBotRegistration(
        f.db,
        f.ids.guild,
        f.scrimId,
        { ...input, interactionId: nextInteractionId() },
        f.dependencies
    );
    assert.notEqual(renewed.registration!.id, oldId);
    await mutateBotRegistration(f.db, f.ids.guild, f.scrimId, withdrawal, f.dependencies);
    assert.equal(
        (await getBotRegistration(f.db, f.ids.guild, f.scrimId, f.ids.member, f.dependencies)).registration
            ?.id,
        renewed.registration!.id
    );
    await assert.rejects(
        mutateBotRegistration(
            f.db,
            f.ids.guild,
            f.scrimId,
            { ...withdrawal, interactionId: nextInteractionId() },
            f.dependencies
        ),
        errorCode('CONFLICT')
    );
});

test('봇의 신청은 다른 서버·다른 사람 계정·다른 신청 ID를 사용할 수 없다', async (t) => {
    const f = await createBotFixture(t);
    const foreignAccount = await f.seedAccount(f.ids.otherGuild, f.ids.member);
    const otherAccount = await f.seedAccount(f.ids.guild, f.ids.otherMember);
    await assert.rejects(
        getBotRegistration(f.db, f.ids.otherGuild, f.scrimId, f.ids.member, f.dependencies),
        errorCode('NOT_FOUND')
    );
    for (const riotAccountId of [foreignAccount.id, otherAccount.id]) {
        await assert.rejects(
            mutateBotRegistration(
                f.db,
                f.ids.guild,
                f.scrimId,
                { ...f.input(), riotAccountId },
                f.dependencies
            ),
            errorCode('INVALID_INPUT')
        );
    }
    const joined = await mutateBotRegistration(f.db, f.ids.guild, f.scrimId, f.input(), f.dependencies);
    await assert.rejects(
        mutateBotRegistration(
            f.db,
            f.ids.guild,
            f.scrimId,
            {
                actorId: f.ids.otherMember,
                interactionId: nextInteractionId(),
                action: 'withdraw',
                registrationId: joined.registration!.id
            },
            f.dependencies
        ),
        errorCode('NOT_FOUND')
    );
    assert.equal((await f.registrationRows())[0]!.status, 'selected');
    f.members.get(f.ids.guild)!.delete(f.ids.member);
    await assert.rejects(
        getBotRegistration(f.db, f.ids.guild, f.scrimId, f.ids.member, f.dependencies),
        errorCode('NOT_FOUND')
    );
});

test('처리 결과 저장이 실패하면 신청·게시 작업·revision·interaction 기록을 함께 롤백한다', async (t) => {
    const f = await createBotFixture(t);
    const before = await f.row();
    const jobs = (await f.pool.query('SELECT * FROM discord_publication_jobs ORDER BY id')).rows;
    const input = f.input();
    await f.pool.query(
        "CREATE FUNCTION reject_bot_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '처리 결과 실패 검증'; END $$"
    );
    await f.pool.query(
        'CREATE TRIGGER reject_bot_receipt BEFORE UPDATE ON discord_interaction_receipts FOR EACH ROW EXECUTE FUNCTION reject_bot_receipt()'
    );
    await assert.rejects(
        mutateBotRegistration(f.db, f.ids.guild, f.scrimId, input, f.dependencies),
        (error: unknown) => {
            let cause = error;
            while (cause instanceof Error) {
                if (
                    'code' in cause &&
                    cause.code === 'P0001' &&
                    cause.message.includes('처리 결과 실패 검증')
                )
                    return true;
                cause = cause.cause;
            }
            return false;
        }
    );
    assert.equal((await f.registrationRows()).length, 0);
    assert.equal((await f.row()).revision, before.revision);
    assert.deepEqual((await f.pool.query('SELECT * FROM discord_publication_jobs ORDER BY id')).rows, jobs);
    assert.equal(
        (
            await f.pool.query('SELECT * FROM discord_interaction_receipts WHERE interaction_id=$1', [
                input.interactionId
            ])
        ).rowCount,
        0
    );
});

test('웹과 봇이 마지막 자리에 동시에 신청해도 선발·대기 정원을 준수한다', async (t) => {
    const f = await createRecruitmentFixture(t, { reserveCapacity: 1 });
    for (let index = 0; index < 9; index++) {
        await createRegistration(
            f.db,
            f.actors[index]!,
            f.guildId,
            f.scrimId,
            { riotAccountId: f.accounts[index]!.id, positions: ['mid'] },
            f.access
        );
    }
    const results = await concurrently<unknown>([
        () =>
            createRegistration(
                f.db,
                f.actors[9]!,
                f.guildId,
                f.scrimId,
                { riotAccountId: f.accounts[9]!.id, positions: ['top'] },
                f.access
            ),
        () =>
            mutateBotRegistration(
                f.db,
                f.guildId,
                f.scrimId,
                {
                    actorId: f.actors[10]!.userId,
                    interactionId: nextInteractionId(),
                    action: 'create',
                    riotAccountId: f.accounts[10]!.id,
                    positions: ['support']
                },
                f.access
            )
    ]);
    assert.ok(results.every((result) => result.status === 'fulfilled'));
    const active = await f.db
        .select()
        .from(schema.scrimParticipantRegistrations)
        .where(isNull(schema.scrimParticipantRegistrations.withdrawnAt));
    assert.equal(active.filter((row) => row.status === 'selected').length, 10);
    assert.equal(active.filter((row) => row.status === 'standby').length, 1);
});

test('게시 채널이 없어도 웹 저장은 성공하고 채널을 설정하면 현재 모집을 게시한다', async (t) => {
    const f = await createBotFixture(t, false);
    assert.deepEqual(await claimPublication(f.db, 'worker-a'), []);
    await mutateBotRegistration(f.db, f.ids.guild, f.scrimId, f.input(), f.dependencies);
    assert.equal((await f.registrationRows()).length, 1);
    await setGuildDiscordSetting(
        f.db,
        f.owner,
        f.ids.guild,
        'recruitmentChannelId',
        f.ids.channel,
        f.dependencies
    );
    const [job] = await claimPublication(f.db, 'worker-a');
    assert.ok(job);
    assert.equal(job.channelId, f.ids.channel);
    assert.equal(job.data.selected, 1);
    assert.equal(job.data.title, settings.title);
});

test('동시에 게시 작업을 점유하면 한 worker만 처리하고 이전 revision 완료는 새 변경을 남긴다', async (t) => {
    const f = await createBotFixture(t);
    const claims = await Promise.all([
        claimPublication(f.db, 'worker-a'),
        claimPublication(f.db, 'worker-b')
    ]);
    assert.equal(claims.flat().length, 1);
    const first = claims.flat()[0]!;
    await assert.rejects(
        completePublication(f.db, first.id, {
            leaseToken: randomUUID(),
            revision: first.revision,
            outcome: 'sent',
            messageId
        }),
        errorCode('CONFLICT')
    );
    const before = await f.row();
    await updateScrimSettings(
        f.db,
        f.owner,
        f.ids.guild,
        f.scrimId,
        { expectedRevision: before.revision, settings: { ...settings, title: '점유 중 변경' } },
        f.dependencies
    );
    await completePublication(f.db, first.id, {
        leaseToken: first.leaseToken,
        revision: first.revision,
        outcome: 'sent',
        messageId
    });
    const [next] = await claimPublication(f.db, 'worker-b');
    assert.ok(next);
    assert.ok(next.revision > first.revision);
    assert.equal(next.messageId, messageId);
    assert.equal(next.data.title, '점유 중 변경');
    await assert.rejects(
        completePublication(f.db, first.id, {
            leaseToken: first.leaseToken,
            revision: first.revision,
            outcome: 'sent',
            messageId: '990000000000000092'
        }),
        errorCode('CONFLICT')
    );
    await completePublication(f.db, next.id, {
        leaseToken: next.leaseToken,
        revision: next.revision,
        outcome: 'sent',
        messageId
    });
    assert.deepEqual(await claimPublication(f.db, 'worker-c'), []);
});

test('신규 전송의 점유가 만료되면 자동 재생성하지 않고 전달 불명으로 남긴다', async (t) => {
    const f = await createBotFixture(t);
    const now = new Date();
    const [first] = await claimPublication(f.db, 'worker-a', now);
    assert.ok(first);
    assert.equal(first.messageId, null);
    assert.deepEqual(await claimPublication(f.db, 'worker-b', new Date(now.getTime() + 120_000)), []);
    const failures = await listFailedPublications(f.db, f.ids.guild, f.ids.owner, f.dependencies);
    assert.equal(failures.publications.length, 1);
    await assert.rejects(
        listFailedPublications(f.db, f.ids.guild, f.ids.member, f.dependencies),
        errorCode('FORBIDDEN')
    );
    await assert.rejects(
        retryBotPublication(
            f.db,
            f.ids.guild,
            first.id,
            { actorId: f.ids.member, interactionId: nextInteractionId(), confirmAbsent: true },
            f.dependencies
        ),
        errorCode('FORBIDDEN')
    );
    await assert.rejects(
        retryBotPublication(
            f.db,
            f.ids.otherGuild,
            first.id,
            { actorId: f.ids.owner, interactionId: nextInteractionId(), confirmAbsent: true },
            f.dependencies
        ),
        errorCode('NOT_FOUND')
    );
    await assert.rejects(
        retryBotPublication(
            f.db,
            f.ids.guild,
            first.id,
            { actorId: f.ids.owner, interactionId: nextInteractionId() },
            f.dependencies
        )
    );
    await retryBotPublication(
        f.db,
        f.ids.guild,
        first.id,
        { actorId: f.ids.owner, interactionId: nextInteractionId(), confirmAbsent: true },
        f.dependencies
    );
    const [retry] = await claimPublication(f.db, 'worker-c', new Date(now.getTime() + 120_001));
    assert.ok(retry);
    assert.notEqual(retry.leaseToken, first.leaseToken);
    await assert.rejects(
        completePublication(f.db, first.id, {
            leaseToken: first.leaseToken,
            revision: first.revision,
            outcome: 'sent',
            messageId
        }),
        errorCode('CONFLICT')
    );
});

test('이미 식별된 글의 재시도는 지정한 시각 이후 동일 메시지를 갱신한다', async (t) => {
    const f = await createBotFixture(t);
    const [first] = await claimPublication(f.db, 'worker-a');
    assert.ok(first);
    await completePublication(f.db, first.id, {
        leaseToken: first.leaseToken,
        revision: first.revision,
        outcome: 'sent',
        messageId
    });
    await mutateBotRegistration(f.db, f.ids.guild, f.scrimId, f.input(), f.dependencies);
    const now = new Date();
    const [update] = await claimPublication(f.db, 'worker-a', now);
    assert.ok(update);
    await completePublication(
        f.db,
        update.id,
        {
            leaseToken: update.leaseToken,
            revision: update.revision,
            outcome: 'retry',
            errorCode: 'RATE_LIMITED',
            retryAfterSeconds: 30
        },
        now
    );
    assert.deepEqual(await claimPublication(f.db, 'worker-b', new Date(now.getTime() + 29_000)), []);
    const [retry] = await claimPublication(f.db, 'worker-b', new Date(now.getTime() + 31_000));
    assert.equal(retry?.messageId, messageId);
    assert.notEqual(retry?.leaseToken, update.leaseToken);
});

for (const kind of ['recruitment', 'entry'] as const) {
    test(`${kind} 복구는 같은 채널의 다른 종류 불명 글을 거절하고 자기 작업의 글만 연결한다`, async (t) => {
        const f = await createFormationFixture(t);
        const channelId = '990000000000000094';
        const botId = '990000000000000095';
        await f.db.insert(schema.guildDiscordSettings).values({
            guildId: f.guildId,
            recruitmentChannelId: channelId,
            entryChannelId: channelId
        });
        await f.fill();
        await confirmManualFormation(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
        const publications: BotPublication[] = [];
        for (let index = 0; index < 2; index++) {
            const [job] = await claimPublication(f.db, 'first-worker');
            assert.ok(job);
            publications.push(job);
            await completePublication(f.db, job.id, {
                leaseToken: job.leaseToken,
                revision: job.revision,
                outcome: 'uncertain'
            });
        }
        const job = publications.find((publication) => publication.kind === kind)!;
        const other = publications.find((publication) => publication.kind !== kind)!;
        assert.ok(job && other);
        let messageJob = other;
        const discord = {
            ...f.access.discord,
            getCurrentUserId: async () => botId,
            getMessage: async (channel: string, id: string) => ({
                id,
                channelId: channel,
                authorId: botId,
                components: [
                    {
                        url: `https://monkeybot.test/g/${f.guildId}/scrims/${f.scrimId}${messageJob.kind === 'entry' ? '/bracket' : ''}?publication=${messageJob.id}`
                    }
                ]
            })
        };
        const retry = () =>
            retryBotPublication(
                f.db,
                f.guildId,
                job.id,
                { actorId: f.manager.userId, interactionId: nextInteractionId(), messageId },
                { discord }
            );
        await assert.rejects(retry(), errorCode('CONFLICT'));
        assert.equal((await f.db.select().from(schema.scrimDiscordMessages)).length, 0);
        assert.ok(
            (await f.db.select().from(schema.discordPublicationJobs)).every(
                (publication) => publication.status === 'uncertain'
            )
        );
        messageJob = job;
        await retry();
        const [recovered] = await claimPublication(f.db, 'next-worker');
        assert.equal(recovered?.id, job.id);
        assert.equal(recovered?.kind, kind);
        assert.equal(recovered?.messageId, messageId);
    });
}

test('식별자가 없는 이전 형식의 불명 글은 추정 연결하지 않고 부재 확인 후에만 재생성한다', async (t) => {
    const f = await createBotFixture(t);
    const [first] = await claimPublication(f.db, 'first-worker');
    assert.ok(first);
    await completePublication(f.db, first.id, {
        leaseToken: first.leaseToken,
        revision: first.revision,
        outcome: 'uncertain'
    });
    const discord = {
        ...f.discord,
        getMessage: async (channelId: string, id: string) => ({
            id,
            channelId,
            authorId: f.ids.bot,
            components: [{ url: `https://monkeybot.test/g/${f.ids.guild}/scrims/${f.scrimId}` }]
        })
    };
    await assert.rejects(
        retryBotPublication(
            f.db,
            f.ids.guild,
            first.id,
            { actorId: f.ids.owner, interactionId: nextInteractionId(), messageId },
            { discord }
        ),
        errorCode('CONFLICT')
    );
    assert.equal((await f.db.select().from(schema.scrimDiscordMessages)).length, 0);
    assert.deepEqual(await claimPublication(f.db, 'next-worker'), []);
    await retryBotPublication(
        f.db,
        f.ids.guild,
        first.id,
        { actorId: f.ids.owner, interactionId: nextInteractionId(), confirmAbsent: true },
        f.dependencies
    );
    const [recreated] = await claimPublication(f.db, 'next-worker');
    assert.equal(recreated?.id, first.id);
    assert.equal(recreated?.messageId, null);
    assert.notEqual(recreated?.nonce, first.nonce);
});

test('이미 저장된 이전 형식의 글은 메시지 옵션 없는 실패 재시도로 같은 ID를 유지한다', async (t) => {
    const f = await createBotFixture(t);
    const [first] = await claimPublication(f.db, 'first-worker');
    assert.ok(first);
    await completePublication(f.db, first.id, {
        leaseToken: first.leaseToken,
        revision: first.revision,
        outcome: 'sent',
        messageId
    });
    await mutateBotRegistration(f.db, f.ids.guild, f.scrimId, f.input(), f.dependencies);
    const [update] = await claimPublication(f.db, 'first-worker');
    assert.ok(update);
    await completePublication(f.db, update.id, {
        leaseToken: update.leaseToken,
        revision: update.revision,
        outcome: 'blocked',
        errorCode: 'DISCORD_50013'
    });
    await retryBotPublication(
        f.db,
        f.ids.guild,
        update.id,
        { actorId: f.ids.owner, interactionId: nextInteractionId() },
        f.dependencies
    );
    const [retry] = await claimPublication(f.db, 'next-worker');
    assert.equal(retry?.id, first.id);
    assert.equal(retry?.messageId, messageId);
    assert.equal(retry?.nonce, first.nonce);
});

test('채널 제거·모집 취소는 기존 모집 글 삭제를 예약하고 참가 이력을 보존한다', async (t) => {
    const f = await createBotFixture(t);
    const joined = await mutateBotRegistration(f.db, f.ids.guild, f.scrimId, f.input(), f.dependencies);
    const [first] = await claimPublication(f.db, 'worker-a');
    assert.ok(first);
    await completePublication(f.db, first.id, {
        leaseToken: first.leaseToken,
        revision: first.revision,
        outcome: 'sent',
        messageId
    });
    await setGuildDiscordSetting(f.db, f.owner, f.ids.guild, 'recruitmentChannelId', null, f.dependencies);
    const [removed] = await claimPublication(f.db, 'worker-a');
    assert.ok(removed);
    assert.equal(removed.operation, 'delete');
    assert.equal(removed.messageId, messageId);
    await completePublication(f.db, removed.id, {
        leaseToken: removed.leaseToken,
        revision: removed.revision,
        outcome: 'sent',
        messageId
    });
    assert.equal((await f.registrationRows())[0]!.id, joined.registration!.id);
    await setGuildDiscordSetting(
        f.db,
        f.owner,
        f.ids.guild,
        'recruitmentChannelId',
        f.ids.channel,
        f.dependencies
    );
    const [recreated] = await claimPublication(f.db, 'worker-b');
    assert.ok(recreated);
    await completePublication(f.db, recreated.id, {
        leaseToken: recreated.leaseToken,
        revision: recreated.revision,
        outcome: 'sent',
        messageId: '990000000000000093'
    });
    await cancelScrim(
        f.db,
        f.owner,
        f.ids.guild,
        f.scrimId,
        { expectedRevision: (await f.row()).revision },
        f.dependencies
    );
    const [cancelled] = await claimPublication(f.db, 'worker-b');
    assert.equal(cancelled?.operation, 'delete');
    assert.equal((await f.registrationRows())[0]!.status, 'selected');
});

test('수동 편성 확정은 실제 팀 구성을 게시하고 편성 복귀 시 기존 엔트리를 제거한다', async (t) => {
    const f = await createFormationFixture(t);
    const channelId = '990000000000000094';
    await f.db.insert(schema.guildDiscordSettings).values({ guildId: f.guildId, entryChannelId: channelId });
    await f.fill();
    assert.deepEqual(await claimPublication(f.db, 'worker-a'), []);
    await confirmManualFormation(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    const [entry] = await claimPublication(f.db, 'worker-a');
    assert.ok(entry);
    assert.equal(entry.kind, 'entry');
    assert.equal(entry.channelId, channelId);
    assert.equal(entry.data.teams.length, 2);
    assert.equal(entry.data.teams.flatMap((team) => team.players).length, 10);
    assert.ok(entry.data.teams.every((team) => team.players.every((player) => player.position !== null)));
    await completePublication(f.db, entry.id, {
        leaseToken: entry.leaseToken,
        revision: entry.revision,
        outcome: 'sent',
        messageId
    });
    await revertScrim(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    const [reverted] = await claimPublication(f.db, 'worker-a');
    assert.equal(reverted?.kind, 'entry');
    assert.equal(reverted?.operation, 'delete');
});

test('Gateway의 일시 장애는 활성 상태를 유지하고 확인된 탈퇴는 현재 소속만 제거한다', async (t) => {
    const f = await createBotFixture(t);
    await mutateBotRegistration(f.db, f.ids.guild, f.scrimId, f.input(), f.dependencies);
    await synchronizeBotGuild(f.db, f.ids.guild, { state: 'unavailable' }, f.dependencies);
    assert.equal(
        (await f.db.select().from(schema.guilds).where(eq(schema.guilds.id, f.ids.guild)))[0]?.isActive,
        true
    );
    f.members.get(f.ids.guild)!.delete(f.ids.member);
    await synchronizeBotGuild(
        f.db,
        f.ids.guild,
        { state: 'available', memberId: f.ids.member, memberRemoved: true },
        f.dependencies
    );
    assert.equal(
        (
            await f.db
                .select()
                .from(schema.guildMembers)
                .where(
                    and(
                        eq(schema.guildMembers.guildId, f.ids.guild),
                        eq(schema.guildMembers.userId, f.ids.member)
                    )
                )
        ).length,
        0
    );
    assert.equal((await f.registrationRows()).length, 1);
    assert.equal((await f.db.select().from(schema.users).where(eq(schema.users.id, f.ids.member))).length, 1);
});

test('재시작 복구는 알려진 서버 멤버만 cursor로 누락·중복 없이 조회한다', async (t) => {
    const f = await createAccessFixture(t);
    const people = Array.from({ length: 205 }, (_, index) => ({
        id: String(990000000000100000n + BigInt(index)),
        username: '알려진 멤버 ' + index
    }));
    await f.db.insert(schema.users).values(people);
    await f.db
        .insert(schema.guildMembers)
        .values(people.map((person) => ({ guildId: f.ids.guild, userId: person.id })));
    const expected = [
        f.ids.owner,
        f.ids.member,
        f.ids.otherMember,
        ...people.map((person) => person.id)
    ].sort();
    const first = await listKnownBotMembers(f.db, f.ids.guild);
    assert.equal(first.memberIds.length, 100);
    assert.ok(first.nextCursor);
    const second = await listKnownBotMembers(f.db, f.ids.guild, first.nextCursor);
    assert.equal(second.memberIds.length, 100);
    assert.ok(second.nextCursor);
    const last = await listKnownBotMembers(f.db, f.ids.guild, second.nextCursor);
    assert.equal(last.memberIds.length, 8);
    assert.equal(last.nextCursor, null);
    assert.deepEqual([...first.memberIds, ...second.memberIds, ...last.memberIds], expected);
    assert.ok(!expected.includes(f.ids.outsider));
    await assert.rejects(
        listKnownBotMembers(f.db, f.ids.guild, 'invalid-cursor'),
        errorCode('INVALID_INPUT')
    );
    assert.equal((await f.db.select().from(schema.users)).length, 210);
});

test('길드 전체 동기화와 멤버 이벤트는 서비스에 연결되지 않은 사용자 명단을 적재하지 않는다', async (t) => {
    const f = await createAccessFixture(t);
    const unknownId = '990000000000101000';
    f.members.get(f.ids.guild)!.set(unknownId, { user: f.profile(unknownId), roleIds: [] });
    const userCount = (await f.db.select().from(schema.users)).length;
    const membershipCount = (await f.db.select().from(schema.guildMembers)).length;
    let unknownFetches = 0;
    const discord = {
        ...f.discord,
        getMember: async (guildId: string, userId: string) => {
            if (userId === unknownId) unknownFetches++;
            return f.discord.getMember(guildId, userId);
        }
    };
    await synchronizeBotGuild(f.db, f.ids.guild, { state: 'available' }, { discord });
    await synchronizeBotGuild(f.db, f.ids.guild, { state: 'available', memberId: unknownId }, { discord });
    assert.equal(unknownFetches, 0);
    assert.equal((await f.db.select().from(schema.users)).length, userCount);
    assert.equal((await f.db.select().from(schema.guildMembers)).length, membershipCount);
});

test('봇이 오프라인인 동안 퇴장한 길드는 완전한 목록 대조 후 비활성화하고 업무 이력은 보존한다', async (t) => {
    const f = await createBotFixture(t);
    await mutateBotRegistration(f.db, f.ids.guild, f.scrimId, f.input(), f.dependencies);
    f.guilds.delete(f.ids.guild);
    await reconcileBotGuilds(f.db, f.dependencies);
    const guildRows = await f.db.select().from(schema.guilds);
    assert.equal(guildRows.find((guild) => guild.id === f.ids.guild)?.isActive, false);
    assert.equal(guildRows.find((guild) => guild.id === f.ids.otherGuild)?.isActive, true);
    const oldMembers = await f.db
        .select()
        .from(schema.guildMembers)
        .where(eq(schema.guildMembers.guildId, f.ids.guild));
    assert.equal(oldMembers.length, 3);
    assert.ok(oldMembers.every((member) => member.syncedAt === null));
    assert.equal((await f.registrationRows()).length, 1);
    assert.equal((await f.row()).title, settings.title);
});

test('Discord 길드 목록의 다음 페이지가 실패하면 부분 목록으로 기존 길드를 비활성화하지 않는다', async (t) => {
    const f = await createAccessFixture(t);
    const before = await f.db.select().from(schema.guilds);
    let requests = 0;
    const page = Array.from({ length: 200 }, (_, index) => ({
        id: String(990000000000200000n + BigInt(index)),
        name: '외부 서버',
        icon: null
    }));
    const discord = createDiscordClient({
        token: 'fixture-bot-token',
        fetch: async () => {
            requests++;
            return requests === 1
                ? new Response(JSON.stringify(page), { status: 200 })
                : new Response('{}', { status: 503 });
        }
    });
    await assert.rejects(
        reconcileBotGuilds(f.db, { discord }),
        (error: unknown) => error instanceof DiscordError
    );
    assert.equal(requests, 2);
    assert.deepEqual(await f.db.select().from(schema.guilds), before);
});

test('게시 완료와 참가 신청이 실제 잠금에서 경합해도 교착 없이 끝나고 최신 게시를 남긴다', async (t) => {
    const f = await createBotFixture(t);
    const [first] = await claimPublication(f.db, 'first-worker');
    assert.ok(first);
    await registerWhilePublicationWaits(f, () =>
        completePublication(f.db, first.id, {
            leaseToken: first.leaseToken,
            revision: first.revision,
            outcome: 'sent',
            messageId
        })
    );
    assert.equal((await f.registrationRows()).length, 1);
    const [job] = await f.db
        .select()
        .from(schema.discordPublicationJobs)
        .where(eq(schema.discordPublicationJobs.id, first.id));
    assert.equal(job?.status, 'pending');
    assert.ok(job.revision > first.revision);
    const [next] = await claimPublication(f.db, 'next-worker');
    assert.equal(next?.messageId, messageId);
    assert.equal(next?.data.selected, 1);
    assert.equal(next?.revision, job.revision);
});

test('불명 메시지 복구와 참가 신청이 실제 잠금에서 경합해도 복구 ID와 최신 참가자를 보존한다', async (t) => {
    const f = await createBotFixture(t);
    const [first] = await claimPublication(f.db, 'first-worker');
    assert.ok(first);
    await completePublication(f.db, first.id, {
        leaseToken: first.leaseToken,
        revision: first.revision,
        outcome: 'uncertain'
    });
    const discord = {
        ...f.discord,
        getMessage: async (channelId: string, id: string) => ({
            id,
            channelId,
            authorId: f.ids.bot,
            components: [
                { url: `https://monkeybot.test/g/${f.ids.guild}/scrims/${f.scrimId}?publication=${first.id}` }
            ]
        })
    };
    await registerWhilePublicationWaits(f, () =>
        retryBotPublication(
            f.db,
            f.ids.guild,
            first.id,
            {
                actorId: f.ids.owner,
                interactionId: nextInteractionId(),
                messageId
            },
            { discord }
        )
    );
    assert.equal((await f.registrationRows()).length, 1);
    const [job] = await f.db
        .select()
        .from(schema.discordPublicationJobs)
        .where(eq(schema.discordPublicationJobs.id, first.id));
    assert.equal(job?.status, 'pending');
    assert.ok(job.revision > first.revision);
    const [next] = await claimPublication(f.db, 'next-worker');
    assert.equal(next?.messageId, messageId);
    assert.equal(next?.data.selected, 1);
    assert.equal(next?.revision, job.revision);
});
