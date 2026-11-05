import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import type { BotRegistrationContext } from '../../../../../../shared/bot-api.js';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { assertAction, createHttpFixture, HTTP_BOT_TOKEN, HTTP_IDS } from '../../support/http.ts';

type HttpFixture = Awaited<ReturnType<typeof createHttpFixture>>;
const guildPath = (guildId = HTTP_IDS.guild) => '/internal/bot/guilds/' + guildId;
let interactionNumber = 980000000000000001n;
const interactionId = () => String(interactionNumber++);

async function requestBot(
    f: HttpFixture,
    path: string,
    method = 'GET',
    body?: unknown,
    token = HTTP_BOT_TOKEN
) {
    return f.request(path, {
        method,
        headers: {
            authorization: 'Bearer ' + token,
            accept: 'application/json',
            ...(body === undefined ? {} : { 'content-type': 'application/json' })
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
}

async function success<T>(response: Response): Promise<T> {
    assert.equal(response.status, 200, await response.clone().text());
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    return response.json() as Promise<T>;
}

async function seedAccount(f: HttpFixture, userId = HTTP_IDS.member, guildId = HTTP_IDS.guild) {
    const [account] = await f.db
        .insert(schema.riotAccounts)
        .values({ puuid: randomUUID(), gameName: '봇 신청자', tagLine: 'KR1', platform: 'kr' })
        .returning();
    await f.db
        .insert(schema.guildRiotAccounts)
        .values({ guildId, userId, riotAccountId: account!.id, isPrimary: true });
    return account!;
}

async function createRecruitment(f: HttpFixture, guildId = HTTP_IDS.guild) {
    return success<{ scrimId: string }>(
        await requestBot(f, guildPath(guildId) + '/scrims', 'POST', {
            actorId: HTTP_IDS.manager,
            interactionId: interactionId(),
            title: 'Discord에서 만든 내전',
            scheduledAt: null,
            teamCount: 2,
            reserveCapacity: 1,
            hardFearless: true
        })
    );
}

test('HTTP 봇: 모든 내부 경로는 브라우저 세션과 무관하게 서비스 인증을 요구한다', async (t) => {
    const f = await createHttpFixture(t);
    const manager = await f.session(HTTP_IDS.manager);
    const scrimId = randomUUID(),
        jobId = randomUUID();
    const cases = [
        ['POST', guildPath() + '/initialization'],
        ['POST', guildPath() + '/scrims'],
        ['GET', guildPath() + '/scrims/' + scrimId + '/registration?actorId=' + HTTP_IDS.member],
        ['POST', guildPath() + '/scrims/' + scrimId + '/registrations'],
        ['PATCH', guildPath() + '/scrims/' + scrimId + '/registrations'],
        ['PUT', guildPath() + '/sync'],
        ['GET', guildPath() + '/members'],
        ['POST', '/internal/bot/reconciliation'],
        ['POST', '/internal/bot/publication-claims'],
        ['PATCH', '/internal/bot/publications/' + jobId],
        ['GET', guildPath() + '/publications?actorId=' + HTTP_IDS.manager],
        ['POST', guildPath() + '/publications/' + jobId + '/retry']
    ] as const;
    for (const [method, path] of cases) {
        await t.test(method + ' ' + path.split('?')[0], async () => {
            const response = await f.request(path, {
                method,
                headers: {
                    cookie: manager.cookie,
                    origin: f.origin,
                    accept: 'application/json',
                    'content-type': 'application/json'
                },
                ...(method === 'GET' ? {} : { body: '{}' })
            });
            assert.equal(response.status, 401);
            assert.equal((await response.json()).error.code, 'UNAUTHENTICATED');
        });
    }
    assert.deepEqual(f.upstreamCalls, []);
    const badToken = await requestBot(
        f,
        '/internal/bot/publication-claims',
        'POST',
        { workerId: 'test-worker' },
        'invalid-token'
    );
    assert.equal(badToken.status, 401);
});

test('HTTP 봇: 내부 토큰 미설정은 명시적으로 503을 반환한다', async (t) => {
    const f = await createHttpFixture(t, [], { botInternalToken: '' });
    const response = await requestBot(f, '/internal/bot/publication-claims', 'POST', {
        workerId: 'test-worker'
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'SERVICE_UNAVAILABLE');
    assert.deepEqual(f.upstreamCalls, []);
});

test('HTTP 봇: 초기 설정은 실제 관리자만 실행하며 첫 시즌을 한 번만 준비한다', async (t) => {
    const f = await createHttpFixture(t);
    const path = guildPath(HTTP_IDS.otherGuild) + '/initialization';
    const denied = await requestBot(f, path, 'POST', {
        actorId: HTTP_IDS.member,
        interactionId: interactionId()
    });
    assert.equal(denied.status, 403);
    const input = { actorId: HTTP_IDS.manager, interactionId: interactionId() };
    const first = await success<{ seasonId: string }>(await requestBot(f, path, 'POST', input));
    const replay = await success<{ seasonId: string }>(await requestBot(f, path, 'POST', input));
    const repeat = await success<{ seasonId: string }>(
        await requestBot(f, path, 'POST', { ...input, interactionId: interactionId() })
    );
    assert.equal(first.seasonId, replay.seasonId);
    assert.equal(first.seasonId, repeat.seasonId);
    const seasons = await f.db
        .select()
        .from(schema.mmrSeasons)
        .where(eq(schema.mmrSeasons.guildId, HTTP_IDS.otherGuild));
    assert.equal(seasons.length, 1);
    assert.equal(seasons[0]!.endedAt, null);
});

test('HTTP 봇: 모집 생성은 현재 관리자와 활성 시즌을 요구하고 동일 요청을 재사용한다', async (t) => {
    const f = await createHttpFixture(t);
    const input = {
        actorId: HTTP_IDS.manager,
        interactionId: interactionId(),
        title: '단일 모집',
        scheduledAt: null,
        teamCount: 3,
        reserveCapacity: 2,
        hardFearless: false
    };
    const path = guildPath() + '/scrims';
    const denied = await requestBot(f, path, 'POST', { ...input, actorId: HTTP_IDS.member });
    assert.equal(denied.status, 403);
    const noSeason = await requestBot(f, guildPath(HTTP_IDS.otherGuild) + '/scrims', 'POST', {
        ...input,
        interactionId: interactionId()
    });
    assert.equal(noSeason.status, 409);
    const first = await success<{ scrimId: string }>(await requestBot(f, path, 'POST', input));
    const replay = await success<{ scrimId: string }>(await requestBot(f, path, 'POST', input));
    assert.equal(replay.scrimId, first.scrimId);
    assert.equal((await f.db.select().from(schema.scrims)).length, 1);
    const conflict = await requestBot(f, path, 'POST', { ...input, title: '같은 요청의 다른 내용' });
    assert.equal(conflict.status, 409);
});

test('HTTP 봇: 쿠키 없이 본인 계정으로 신청·수정·철회하고 오래된 생성 재전송은 재가입시키지 않는다', async (t) => {
    const f = await createHttpFixture(t);
    const account = await seedAccount(f);
    const { scrimId } = await createRecruitment(f);
    const base = guildPath() + '/scrims/' + scrimId;
    const context = await success<BotRegistrationContext>(
        await requestBot(f, base + '/registration?actorId=' + HTTP_IDS.member)
    );
    assert.equal(context.registration, null);
    assert.equal(context.accounts[0]!.id, account.id);
    assert.equal(context.canEdit, true);
    const create = {
        actorId: HTTP_IDS.member,
        interactionId: interactionId(),
        action: 'create',
        riotAccountId: account.id,
        positions: ['mid', 'support']
    };
    const joined = await success<BotRegistrationContext>(
        await requestBot(f, base + '/registrations', 'POST', create)
    );
    assert.equal(joined.registration?.status, 'selected');
    assert.deepEqual(joined.registration?.positions, ['mid', 'support']);
    const edited = await success<BotRegistrationContext>(
        await requestBot(f, base + '/registrations', 'PATCH', {
            ...create,
            interactionId: interactionId(),
            registrationId: joined.registration!.id,
            action: 'update',
            positions: ['top']
        })
    );
    assert.deepEqual(edited.registration?.positions, ['top']);
    const withdrawn = await success<BotRegistrationContext>(
        await requestBot(f, base + '/registrations', 'PATCH', {
            actorId: HTTP_IDS.member,
            interactionId: interactionId(),
            registrationId: joined.registration!.id,
            action: 'withdraw'
        })
    );
    assert.equal(withdrawn.registration?.status, 'withdrawn');
    await success<BotRegistrationContext>(await requestBot(f, base + '/registrations', 'POST', create));
    const rows = await f.db.select().from(schema.scrimParticipantRegistrations);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.status, 'withdrawn');
    const current = await success<BotRegistrationContext>(
        await requestBot(f, base + '/registration?actorId=' + HTTP_IDS.member)
    );
    assert.equal(current.registration?.status, 'withdrawn');
});

test('HTTP 봇: 다른 서버·탈퇴자·타인 연결 계정의 신청을 차단한다', async (t) => {
    const f = await createHttpFixture(t);
    const account = await seedAccount(f, HTTP_IDS.manager);
    const { scrimId } = await createRecruitment(f);
    const base = guildPath() + '/scrims/' + scrimId;
    const wrongGuild = await requestBot(
        f,
        guildPath(HTTP_IDS.otherGuild) + '/scrims/' + scrimId + '/registration?actorId=' + HTTP_IDS.member
    );
    assert.equal(wrongGuild.status, 404);
    const outsider = await requestBot(f, base + '/registration?actorId=' + HTTP_IDS.outsider);
    assert.equal(outsider.status, 404);
    const denied = await requestBot(f, base + '/registrations', 'POST', {
        actorId: HTTP_IDS.member,
        interactionId: interactionId(),
        action: 'create',
        riotAccountId: account.id,
        positions: ['mid']
    });
    assert.equal(denied.status, 400);
    assert.equal((await f.db.select().from(schema.scrimParticipantRegistrations)).length, 0);
});

test('HTTP 봇: 잘못된 JSON·입력 형태·신청 동작은 400이며 업무 자료를 저장하지 않는다', async (t) => {
    const f = await createHttpFixture(t);
    const account = await seedAccount(f);
    const { scrimId } = await createRecruitment(f);
    const path = guildPath() + '/scrims/' + scrimId + '/registrations';
    for (const body of [
        null,
        [],
        '잘못된 형태',
        {},
        { actorId: HTTP_IDS.member, interactionId: interactionId(), action: 'delete' }
    ]) {
        const response = await requestBot(f, path, 'POST', body);
        assert.equal(response.status, 400);
    }
    const wrongMethod = await requestBot(f, path, 'PATCH', {
        actorId: HTTP_IDS.member,
        interactionId: interactionId(),
        action: 'create',
        riotAccountId: account.id,
        positions: ['mid']
    });
    assert.equal(wrongMethod.status, 400);
    const noRegistration = await requestBot(f, path, 'PATCH', {
        actorId: HTTP_IDS.member,
        interactionId: interactionId(),
        action: 'withdraw'
    });
    assert.equal(noRegistration.status, 400);
    const malformed = await f.request(path, {
        method: 'POST',
        headers: { authorization: 'Bearer ' + HTTP_BOT_TOKEN, 'content-type': 'application/json' },
        body: '{'
    });
    assert.equal(malformed.status, 400);
    const badActor = await requestBot(
        f,
        guildPath() + '/scrims/' + scrimId + '/registration?actorId=invalid'
    );
    assert.equal(badActor.status, 400);
    assert.equal((await f.db.select().from(schema.scrimParticipantRegistrations)).length, 0);
});

test('HTTP 봇: 웹에서 만든 모집도 게시 작업으로 읽고 전송 완료 후 같은 글을 갱신한다', async (t) => {
    const f = await createHttpFixture(t);
    await f.db
        .insert(schema.guildDiscordSettings)
        .values({ guildId: HTTP_IDS.guild, recruitmentChannelId: HTTP_IDS.channel });
    const manager = await f.session(HTTP_IDS.manager);
    const action = await f.action(
        '/g/' + HTTP_IDS.guild + '/scrims',
        'create',
        {
            requestId: randomUUID(),
            title: '웹과 봇 공동 모집',
            date: '',
            time: '',
            teamCount: '2',
            reserveCapacity: '1',
            hardFearless: 'true'
        },
        manager.cookie
    );
    assertAction(action, 200);
    const [scrim] = await f.db.select().from(schema.scrims);
    assert.ok(scrim);
    const claimed = await success<{
        publications: {
            id: string;
            leaseToken: string;
            revision: number;
            channelId: string;
            messageId: string | null;
            data: { title: string };
        }[];
    }>(await requestBot(f, '/internal/bot/publication-claims', 'POST', { workerId: 'http-worker' }));
    assert.equal(claimed.publications.length, 1);
    const job = claimed.publications[0]!;
    assert.equal(job.data.title, scrim.title);
    assert.equal(job.channelId, HTTP_IDS.channel);
    assert.equal(job.messageId, null);
    await success(
        await requestBot(f, '/internal/bot/publications/' + job.id, 'PATCH', {
            leaseToken: job.leaseToken,
            revision: job.revision,
            outcome: 'sent',
            messageId: '970000000000000099'
        })
    );
    const settingsReply = await f.action(
        '/g/' + HTTP_IDS.guild + '/scrims/' + scrim.id,
        'settings',
        {
            expectedRevision: String(scrim.revision),
            title: '웹에서 변경한 모집',
            date: '',
            time: '',
            teamCount: '2',
            reserveCapacity: '1',
            hardFearless: 'true'
        },
        manager.cookie
    );
    assertAction(settingsReply, 200);
    const updated = await success<{ publications: { messageId: string | null; data: { title: string } }[] }>(
        await requestBot(f, '/internal/bot/publication-claims', 'POST', { workerId: 'http-worker' })
    );
    assert.equal(updated.publications[0]?.messageId, '970000000000000099');
    assert.equal(updated.publications[0]?.data.title, '웹에서 변경한 모집');
});

test('HTTP 봇: 동기화의 일시 unavailable은 길드를 비활성화하지 않는다', async (t) => {
    const f = await createHttpFixture(t);
    await success(await requestBot(f, guildPath() + '/sync', 'PUT', { state: 'unavailable' }));
    const [guild] = await f.db.select().from(schema.guilds).where(eq(schema.guilds.id, HTTP_IDS.guild));
    assert.equal(guild?.isActive, true);
});

test('HTTP 봇: 재시작 복구는 알려진 멤버 조회와 인증된 전체 길드 대조를 사용한다', async (t) => {
    const f = await createHttpFixture(t);
    const members = await success<{ memberIds: string[]; nextCursor: string | null }>(
        await requestBot(f, guildPath() + '/members')
    );
    assert.deepEqual(members.memberIds, [HTTP_IDS.manager, HTTP_IDS.member, HTTP_IDS.serviceAdmin]);
    assert.equal(members.nextCursor, null);
    assert.ok(!members.memberIds.includes(HTTP_IDS.outsider));
    const after = await success<{ memberIds: string[] }>(
        await requestBot(f, guildPath() + '/members?after=' + HTTP_IDS.member)
    );
    assert.deepEqual(after.memberIds, [HTTP_IDS.serviceAdmin]);
    const malformed = await requestBot(f, guildPath() + '/members?after=invalid');
    assert.equal(malformed.status, 400);
    await success(await requestBot(f, '/internal/bot/reconciliation', 'POST', {}));
    const guilds = await f.db.select().from(schema.guilds);
    assert.ok(guilds.every((guild) => guild.isActive));
});
