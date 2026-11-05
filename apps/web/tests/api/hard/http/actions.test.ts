import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { and, eq, isNull } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { assertAction, createHttpFixture, HTTP_IDS } from '../../support/http.ts';

const settings = {
    title: 'HTTP 모집',
    date: '',
    time: '',
    teamCount: '2',
    reserveCapacity: '2',
    hardFearless: 'false'
};
const guildPath = '/g/' + HTTP_IDS.guild;

test('HTTP: 기존 39개 form action은 유효한 입력이어도 비로그인 조작을 거절한다', async (t) => {
    const f = await createHttpFixture(t);
    const id = randomUUID();
    const scrimPath = guildPath + '/scrims/' + id;
    const revision = { expectedRevision: '0' };
    const entries: { path: string; name: string; fields: Record<string, string> }[] = [
        { path: guildPath + '/scrims', name: 'create', fields: { ...settings, requestId: randomUUID() } },
        ...['register', 'registration'].map((name) => ({
            path: scrimPath,
            name,
            fields: { riotAccountId: id, positions: 'mid' }
        })),
        { path: scrimPath, name: 'withdraw', fields: {} },
        { path: scrimPath, name: 'participants', fields: { ...revision, ids: id, status: 'selected' } },
        { path: scrimPath, name: 'advance', fields: { ...revision, key: 'close' } },
        { path: scrimPath, name: 'chooseMethod', fields: { ...revision, method: 'manual' } },
        ...['revert', 'endEarly', 'cancel'].map((name) => ({ path: scrimPath, name, fields: revision })),
        { path: scrimPath, name: 'settings', fields: { ...revision, ...settings } },
        {
            path: scrimPath + '/manual',
            name: 'move',
            fields: { ...revision, participantId: id, slot: id + ':top' }
        },
        ...['reset', 'confirm', 'changeMethod'].map((name) => ({
            path: scrimPath + '/manual',
            name,
            fields: revision
        })),
        { path: scrimPath + '/bracket', name: 'place', fields: { ...revision, seat: 'final-a', teamId: id } },
        {
            path: scrimPath + '/bracket',
            name: 'bestOf',
            fields: { ...revision, stage: 'final', bestOf: '3' }
        },
        ...['reset', 'confirm', 'unlock'].map((name) => ({
            path: scrimPath + '/bracket',
            name,
            fields: revision
        })),
        {
            path: scrimPath + '/auction',
            name: 'setup',
            fields: {
                ...revision,
                teams: JSON.stringify([
                    { captainId: null, startPoints: 100 },
                    { captainId: null, startPoints: 100 }
                ])
            }
        },
        ...['start', 'draw', 'shuffle', 'revert', 'reset', 'reopenSetup', 'changeMethod'].map((name) => ({
            path: scrimPath + '/auction',
            name,
            fields: revision
        })),
        {
            path: scrimPath + '/auction',
            name: 'award',
            fields: { ...revision, lotId: id, teamId: id, price: '0' }
        },
        { path: scrimPath + '/auction', name: 'pass', fields: { ...revision, lotId: id } },
        {
            path: scrimPath + '/auction',
            name: 'assign',
            fields: { ...revision, participantId: id, teamId: id }
        },
        {
            path: scrimPath + '/auction',
            name: 'assignCurrent',
            fields: { ...revision, lotId: id, teamId: id }
        },
        { path: scrimPath + '/auction', name: 'restore', fields: { ...revision, participantId: id } },
        {
            path: guildPath + '/admin',
            name: 'discord',
            fields: { key: 'recruitmentChannelId', value: HTTP_IDS.channel }
        },
        { path: guildPath + '/admin', name: 'lookup', fields: { riotId: 'HttpPlayer#KR1' } },
        {
            path: guildPath + '/admin',
            name: 'link',
            fields: { userId: HTTP_IDS.member, riotId: 'HttpPlayer#KR1' }
        },
        ...['primary', 'unlink'].map((name) => ({
            path: guildPath + '/admin',
            name,
            fields: { userId: HTTP_IDS.member, id }
        })),
        { path: guildPath + '/matches/' + id, name: 'upload', fields: {} }
    ];
    assert.equal(entries.length, 39);
    for (const entry of entries)
        await t.test(entry.path + '?/' + entry.name, async () => {
            assertAction(await f.action(entry.path, entry.name, entry.fields), 401);
        });
    assert.equal((await f.db.select().from(schema.scrims)).length, 0);
    assert.equal((await f.db.select().from(schema.guildRiotAccounts)).length, 0);
    assert.equal(f.upstreamCalls.length, 0);
});

test('HTTP: 관리자 모집 생성은 멱등이며 일반 멤버·잘못된 입력·교차 출처 요청은 저장하지 않는다', async (t) => {
    const f = await createHttpFixture(t);
    const admin = await f.session(HTTP_IDS.manager);
    const member = await f.session(HTTP_IDS.member);
    const path = guildPath + '/scrims';
    const input = { ...settings, requestId: randomUUID() };
    assertAction(await f.action(path, 'create', input, member.cookie), 403);
    assertAction(await f.action(path, 'create', { ...input, title: '' }, admin.cookie), 400);
    const crossSite = await f.request(path + '?/create', {
        method: 'POST',
        body: new URLSearchParams(input),
        headers: { cookie: admin.cookie, origin: 'https://other.invalid', accept: 'application/json' }
    });
    assert.equal(crossSite.status, 403);
    assert.equal((await f.db.select().from(schema.scrims)).length, 0);
    assertAction(await f.action(path, 'create', input, admin.cookie), 200);
    assertAction(await f.action(path, 'create', input, admin.cookie), 200);
    const rows = await f.db.select().from(schema.scrims);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.title, settings.title);
    assert.equal(rows[0]!.mmrSeasonId, f.season.id);
});

test('HTTP: 본인 신청·수정·철회는 저장되고 다른 계정 신청과 오래된 revision은 거절한다', async (t) => {
    const f = await createHttpFixture(t);
    const admin = await f.session(HTTP_IDS.manager);
    const member = await f.session(HTTP_IDS.member);
    assertAction(
        await f.action(
            guildPath + '/scrims',
            'create',
            { ...settings, requestId: randomUUID() },
            admin.cookie
        ),
        200
    );
    const [scrim] = await f.db.select().from(schema.scrims);
    const [account] = await f.db
        .insert(schema.riotAccounts)
        .values({ puuid: 'http-member-account', gameName: 'HTTP', tagLine: 'KR1' })
        .returning();
    await f.db.insert(schema.guildRiotAccounts).values({
        guildId: HTTP_IDS.guild,
        userId: HTTP_IDS.member,
        riotAccountId: account!.id,
        isPrimary: true
    });
    const path = guildPath + '/scrims/' + scrim!.id;
    assertAction(
        await f.action(path, 'register', { riotAccountId: account!.id, positions: 'mid' }, admin.cookie),
        400
    );
    assertAction(
        await f.action(path, 'register', { riotAccountId: account!.id, positions: 'mid,top' }, member.cookie),
        200
    );
    assertAction(
        await f.action(
            path,
            'registration',
            { riotAccountId: account!.id, positions: 'support' },
            member.cookie
        ),
        200
    );
    const [participant] = await f.db.select().from(schema.scrimParticipants);
    assert.equal(participant!.userId, HTTP_IDS.member);
    assert.deepEqual(
        (await f.db.select().from(schema.scrimParticipantPreferences)).map((row) => row.position),
        ['support']
    );
    assertAction(
        await f.action(
            path,
            'settings',
            { ...settings, title: '오래된 변경', expectedRevision: String(scrim!.revision) },
            admin.cookie
        ),
        409
    );
    assert.equal((await f.db.select().from(schema.scrims))[0]!.title, settings.title);
    assertAction(await f.action(path, 'withdraw', {}, member.cookie), 200);
    assert.equal((await f.db.select().from(schema.scrimParticipantRegistrations))[0]!.status, 'withdrawn');
    assert.equal((await f.db.select().from(schema.scrimParticipants)).length, 1);
});

test('HTTP: 서버별 계정 연결·대표 변경·해제가 실제 DB와 개인 페이지에 반영된다', async (t) => {
    const f = await createHttpFixture(t);
    const admin = await f.session(HTTP_IDS.manager);
    const member = await f.session(HTTP_IDS.member);
    for (const riotId of ['HttpPlayer#KR1', 'SecondPlayer#KR1'])
        assertAction(
            await f.action(guildPath + '/admin', 'link', { userId: HTTP_IDS.member, riotId }, admin.cookie),
            204
        );
    const accounts = await f.db.select().from(schema.riotAccounts);
    const second = accounts.find((row) => row.gameName === 'SecondPlayer')!;
    assertAction(
        await f.action(
            guildPath + '/admin',
            'primary',
            { userId: HTTP_IDS.member, id: second.id },
            admin.cookie
        ),
        204
    );
    const links = await f.db.select().from(schema.guildRiotAccounts);
    assert.deepEqual(
        links.filter((row) => row.isPrimary).map((row) => row.riotAccountId),
        [second.id]
    );
    const page = await f.request('/me', { headers: { cookie: member.cookie } });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /SecondPlayer/);
    assertAction(
        await f.action(
            guildPath + '/admin',
            'unlink',
            { userId: HTTP_IDS.member, id: second.id },
            admin.cookie
        ),
        204
    );
    assert.equal((await f.db.select().from(schema.guildRiotAccounts)).length, 1);
    assert.equal((await f.db.select().from(schema.riotAccounts)).length, 2);
});

test('HTTP: Discord 설정은 관리자 action의 실제 저장 경로를 거친다', async (t) => {
    const f = await createHttpFixture(t);
    const admin = await f.session(HTTP_IDS.manager);
    assertAction(
        await f.action(
            guildPath + '/admin',
            'discord',
            { key: 'recruitmentChannelId', value: HTTP_IDS.channel },
            admin.cookie
        ),
        204
    );
    const [settings] = await f.db
        .select()
        .from(schema.guildDiscordSettings)
        .where(eq(schema.guildDiscordSettings.guildId, HTTP_IDS.guild));
    assert.equal(settings!.recruitmentChannelId, HTTP_IDS.channel);
    assert.equal(settings!.resultChannelId, null);
});

test('HTTP: 수동 배정부터 대진 확정·시작까지 실제 form action으로 연결된다', async (t) => {
    const f = await createHttpFixture(t);
    const admin = await f.session(HTTP_IDS.manager);
    const [scrim] = await f.db
        .insert(schema.scrims)
        .values({
            guildId: HTTP_IDS.guild,
            title: 'HTTP 수동 편성',
            status: 'preparing',
            formationMethod: 'manual',
            mmrSeasonId: f.season.id
        })
        .returning();
    const teams = await f.db
        .insert(schema.scrimTeams)
        .values([1, 2].map((ordinal) => ({ scrimId: scrim!.id, name: ordinal + '팀', ordinal })))
        .returning();
    const players = Array.from({ length: 10 }, (_, index) => ({
        id: String(970000000000003000n + BigInt(index)),
        username: '출전자 ' + index
    }));
    await f.db.insert(schema.users).values(players);
    await f.db
        .insert(schema.guildMembers)
        .values(players.map((player) => ({ guildId: HTTP_IDS.guild, userId: player.id })));
    const people = await f.db
        .insert(schema.scrimParticipants)
        .values(
            players.map((player) => ({ scrimId: scrim!.id, userId: player.id, displayName: player.username }))
        )
        .returning();
    await f.db
        .insert(schema.scrimParticipantRegistrations)
        .values(people.map((person) => ({ scrimParticipantId: person.id, status: 'selected' as const })));
    const path = guildPath + '/scrims/' + scrim!.id;
    const revision = async () =>
        String((await f.db.select().from(schema.scrims).where(eq(schema.scrims.id, scrim!.id)))[0]!.revision);
    const positions = ['top', 'jungle', 'mid', 'bot', 'support'];
    for (const [index, person] of people.entries())
        assertAction(
            await f.action(
                path + '/manual',
                'move',
                {
                    participantId: person.id,
                    slot: teams[Math.floor(index / 5)]!.id + ':' + positions[index % 5],
                    expectedRevision: await revision()
                },
                admin.cookie
            ),
            204
        );
    assertAction(
        await f.action(path + '/manual', 'confirm', { expectedRevision: await revision() }, admin.cookie),
        204
    );
    assert.equal((await f.db.select().from(schema.scrims))[0]!.status, 'ready');
    for (const [index, team] of teams.entries())
        assertAction(
            await f.action(
                path + '/bracket',
                'place',
                {
                    seat: 'final-' + (index === 0 ? 'a' : 'b'),
                    teamId: team.id,
                    expectedRevision: await revision()
                },
                admin.cookie
            ),
            204
        );
    assertAction(
        await f.action(
            path + '/bracket',
            'bestOf',
            { stage: 'final', bestOf: '3', expectedRevision: await revision() },
            admin.cookie
        ),
        204
    );
    assertAction(
        await f.action(path + '/bracket', 'confirm', { expectedRevision: await revision() }, admin.cookie),
        204
    );
    assertAction(
        await f.action(path, 'advance', { key: 'start', expectedRevision: await revision() }, admin.cookie),
        200
    );
    const [match] = await f.db.select().from(schema.matches);
    assert.equal(match!.status, 'in_progress');
    assert.equal(match!.bestOf, 3);
    assert.equal((await f.db.select().from(schema.scrims))[0]!.status, 'in_progress');
    assert.equal((await f.request(guildPath + '/matches/' + match!.id)).status, 200);
    assertAction(await f.action(path, 'endEarly', { expectedRevision: await revision() }, admin.cookie), 200);
    assert.equal((await f.db.select().from(schema.scrims))[0]!.status, 'ended_early');
    assertAction(await f.action(path, 'revert', { expectedRevision: await revision() }, admin.cookie), 200);
    assert.equal((await f.db.select().from(schema.matches))[0]!.status, 'in_progress');
    assertAction(await f.action(guildPath + '/matches/' + match!.id, 'upload', {}, admin.cookie), 400);
    assert.equal((await f.db.select().from(schema.games)).length, 0);
});

test('HTTP: 경매 준비·시작·추첨·0점 낙찰·되돌리기를 영속 저장한다', async (t) => {
    const f = await createHttpFixture(t);
    const admin = await f.session(HTTP_IDS.manager);
    const [scrim] = await f.db
        .insert(schema.scrims)
        .values({
            guildId: HTTP_IDS.guild,
            title: 'HTTP 경매',
            status: 'preparing',
            formationMethod: 'auction',
            mmrSeasonId: f.season.id
        })
        .returning();
    const teams = await f.db
        .insert(schema.scrimTeams)
        .values([1, 2].map((ordinal) => ({ scrimId: scrim!.id, name: ordinal + '팀', ordinal })))
        .returning();
    const people = await f.db
        .insert(schema.scrimParticipants)
        .values(
            Array.from({ length: 10 }, (_, index) => ({
                scrimId: scrim!.id,
                displayName: '경매 출전자 ' + index
            }))
        )
        .returning();
    await f.db
        .insert(schema.scrimParticipantRegistrations)
        .values(people.map((person) => ({ scrimParticipantId: person.id, status: 'selected' as const })));
    await f.db.insert(schema.auctions).values({ scrimId: scrim!.id });
    const path = guildPath + '/scrims/' + scrim!.id + '/auction';
    const revision = async () =>
        String((await f.db.select().from(schema.scrims).where(eq(schema.scrims.id, scrim!.id)))[0]!.revision);
    assertAction(
        await f.action(
            path,
            'setup',
            {
                expectedRevision: await revision(),
                teams: JSON.stringify(
                    people.slice(0, 2).map((person) => ({ captainId: person.id, startPoints: 100 }))
                )
            },
            admin.cookie
        ),
        200
    );
    assertAction(await f.action(path, 'start', { expectedRevision: await revision() }, admin.cookie), 200);
    assertAction(await f.action(path, 'draw', { expectedRevision: await revision() }, admin.cookie), 200);
    const [lot] = await f.db.select().from(schema.auctionLots).where(eq(schema.auctionLots.status, 'open'));
    assert.ok(lot);
    assertAction(
        await f.action(
            path,
            'award',
            { expectedRevision: await revision(), lotId: lot.id, teamId: teams[0]!.id, price: '0' },
            admin.cookie
        ),
        200
    );
    const [acquisition] = await f.db
        .select()
        .from(schema.auctionAcquisitions)
        .where(isNull(schema.auctionAcquisitions.voidedAt));
    assert.equal(acquisition!.price, 0);
    assertAction(await f.action(path, 'revert', { expectedRevision: await revision() }, admin.cookie), 200);
    assert.equal(
        (
            await f.db
                .select()
                .from(schema.auctionAcquisitions)
                .where(
                    and(
                        eq(schema.auctionAcquisitions.id, acquisition!.id),
                        isNull(schema.auctionAcquisitions.voidedAt)
                    )
                )
        ).length,
        0
    );
    assert.equal((await f.db.select().from(schema.auctionAcquisitions)).length, 1);
});
