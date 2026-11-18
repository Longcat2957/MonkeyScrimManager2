import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { type TestContext } from 'node:test';
import { and, eq } from 'drizzle-orm';
import {
    parseMatchDateFilters,
    type MatchArchiveFilters
} from '../../../../src/lib/features/matches/filters.ts';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { listMatches } from '../../../../src/lib/server/matches/queries.ts';
import { createGameFixture, errorCode } from '../../support/domain-fixtures.ts';
import { seedMatchFilterGame } from '../../support/http-match-filter-fixtures.ts';

const page = { page: 1, pageSize: 20 };

async function archiveFixture(t: TestContext, bestOf = 1) {
    const f = await createGameFixture(t);
    const archiveValues = {
        ...f.matchValues,
        bestOf,
        status: 'completed' as const,
        winnerTeamId: f.match.teamAId
    };
    await f.db.update(schema.matches).set(archiveValues).where(eq(schema.matches.id, f.match.id));
    return { ...f, archiveValues };
}

test('경기 필터 날짜는 실제 달력과 윤년을 검사하고 한국 시각의 포함·배타 경계를 만든다', () => {
    const parsed = parseMatchDateFilters({ from: '2026-11-15', to: '2026-11-15' });
    assert.equal(parsed.error, null);
    assert.equal(parsed.fromInclusive?.toISOString(), '2026-11-14T15:00:00.000Z');
    assert.equal(parsed.toExclusive?.toISOString(), '2026-11-15T15:00:00.000Z');
    assert.equal(parseMatchDateFilters({ from: '2024-02-29' }).error, null);
    assert.equal(parseMatchDateFilters({ to: '2000-02-29' }).error, null);
    assert.deepEqual(parseMatchDateFilters({}), {
        from: '',
        to: '',
        error: null,
        fromInclusive: null,
        toExclusive: null
    });
    for (const value of [
        '2026-02-29',
        '1900-02-29',
        '2026-04-31',
        '2026-00-01',
        '2026-13-01',
        '2026-01-00',
        '2026-1-01',
        '0000-01-01',
        ' 2026-11-15',
        '2026-11-15T00:00:00Z'
    ]) {
        for (const key of ['from', 'to']) {
            const invalid = parseMatchDateFilters({ [key]: value });
            assert.ok(invalid.error, `${key}: ${value}`);
            assert.equal(invalid.fromInclusive, null);
            assert.equal(invalid.toExclusive, null);
            assert.equal(invalid[key as 'from' | 'to'], value);
        }
    }
    assert.ok(parseMatchDateFilters({ from: '2026-11-16', to: '2026-11-15' }).error);
});

test('경기 필터는 한국 날짜의 첫 밀리초부터 마지막 밀리초까지 포함하고 미확인 시각은 제외한다', async (t) => {
    const f = await archiveFixture(t);
    const instants = [
        '2026-11-14T14:59:59.999Z',
        '2026-11-14T15:00:00.000Z',
        '2026-11-15T14:59:59.999Z',
        '2026-11-15T15:00:00.000Z',
        null
    ];
    const ids = [f.match.id];
    for (let index = 1; index < instants.length; index++) {
        const [row] = await f.db.insert(schema.matches).values(f.archiveValues).returning();
        ids.push(row!.id);
    }
    for (const [index, instant] of instants.entries())
        await f.createGame(f.db, 1, ids[index], 'a', { startedAt: instant ? new Date(instant) : null });
    const result = await listMatches(f.db, null, f.guildId, {
        ...page,
        from: '2026-11-15',
        to: '2026-11-15'
    });
    assert.deepEqual(
        result.matches.map((row) => row.id),
        [ids[2], ids[1]]
    );
    assert.equal(result.total, 2);
    assert.equal(result.from, '2026-11-15');
    assert.equal(result.to, '2026-11-15');
    assert.equal(result.empty, false);
    assert.equal((await listMatches(f.db, null, f.guildId, { ...page, to: '2026-11-14' })).total, 1);
    assert.equal((await listMatches(f.db, null, f.guildId, { ...page, from: '2026-11-16' })).total, 1);
    assert.equal((await listMatches(f.db, null, f.guildId, page)).total, 5);
});

test('경기 필터의 시각은 완료된 세트의 가장 이른 확인값이며 취소·대기 세트와 생성 시각을 섞지 않는다', async (t) => {
    const f = await archiveFixture(t, 3);
    await f.createGame(f.db, 1);
    await f.createGame(f.db, 2, f.match.id, 'b', { startedAt: new Date('2026-11-14T14:59:00Z') });
    await f.createGame(f.db, 3, f.match.id, 'a', { startedAt: new Date('2026-11-15T04:00:00Z') });
    const cancelled = await f.createGame(f.db, 4, f.match.id, 'a', {
        startedAt: new Date('2020-01-01T00:00:00Z')
    });
    await f.db
        .update(schema.games)
        .set({ status: 'cancelled', winnerSide: null })
        .where(eq(schema.games.id, cancelled.id));
    await f.db.insert(schema.games).values({
        scrimId: f.scrimId,
        matchId: f.match.id,
        gameNumber: 4,
        blueTeamSlot: 'a',
        startedAt: new Date('2019-01-01T00:00:00Z')
    });
    await f.db
        .update(schema.matches)
        .set({ createdAt: new Date('2026-11-15T06:00:00Z'), startedAt: new Date('2026-11-15T05:00:00Z') })
        .where(eq(schema.matches.id, f.match.id));
    const all = await listMatches(f.db, null, f.guildId, page);
    assert.equal(all.matches[0]!.playedAt, '2026-11-14T14:59:00.000Z');
    assert.equal(all.matches[0]!.scoreA, 2);
    assert.equal(all.matches[0]!.scoreB, 1);
    assert.equal((await listMatches(f.db, null, f.guildId, { ...page, from: '2026-11-15' })).total, 0);
    assert.equal(
        (await listMatches(f.db, null, f.guildId, { ...page, from: '2026-11-14', to: '2026-11-14' })).total,
        1
    );
});

test('경기 필터는 표시 시각 내림차순·미확인 마지막·식별자 동률 순서를 쪽 이동 전에 적용한다', async (t) => {
    const f = await archiveFixture(t);
    const ids = [
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000003',
        '00000000-0000-4000-8000-000000000004'
    ];
    await f.db
        .update(schema.matches)
        .set({ createdAt: new Date('2030-01-01T00:00:00Z') })
        .where(eq(schema.matches.id, f.match.id));
    await f.createGame(f.db, 1, f.match.id, 'a', { startedAt: new Date('2026-11-14T00:00:00Z') });
    for (const [index, id] of [...ids].reverse().entries()) {
        await f.db.insert(schema.matches).values({
            ...f.archiveValues,
            id,
            createdAt: new Date(`200${index}-01-01T00:00:00Z`)
        });
        await f.createGame(f.db, 1, id, 'a', {
            startedAt: id === ids[0] || id === ids[1] ? new Date('2026-11-15T00:00:00Z') : null
        });
    }
    const first = await listMatches(f.db, null, f.guildId, { ...page, pageSize: 2 });
    const second = await listMatches(f.db, null, f.guildId, { ...page, pageSize: 2, page: 2 });
    const third = await listMatches(f.db, null, f.guildId, { ...page, pageSize: 2, page: 3 });
    assert.deepEqual(
        first.matches.map((row) => row.id),
        ids.slice(0, 2)
    );
    assert.deepEqual(
        second.matches.map((row) => row.id),
        [f.match.id, ids[2]]
    );
    assert.deepEqual(
        third.matches.map((row) => row.id),
        [ids[3]]
    );
    assert.equal(first.total, 5);
    assert.equal(second.matches[1]!.playedAt, null);
    assert.equal(third.matches[0]!.playedAt, null);
    const distant = await listMatches(f.db, null, f.guildId, { ...page, page: 100_000 });
    assert.deepEqual(distant.matches, []);
    assert.equal(distant.total, 5);
    assert.equal(distant.empty, false);
});

test('경기 필터의 기본은 전체 시즌이고 명시한 시즌만 같은 서버에서 조회한다', async (t) => {
    const f = await archiveFixture(t);
    await f.createGame(f.db, 1);
    await f.db
        .update(schema.mmrSeasons)
        .set({ endedAt: new Date('2026-11-01T00:00:00Z') })
        .where(eq(schema.mmrSeasons.id, f.season.id));
    const [current] = await f.db
        .insert(schema.mmrSeasons)
        .values({ guildId: f.guildId, name: '새 시즌' })
        .returning();
    const [other] = await f.db
        .insert(schema.mmrSeasons)
        .values({ guildId: f.otherGuildId, name: '다른 서버 시즌' })
        .returning();
    const [scrim] = await f.db
        .insert(schema.scrims)
        .values({ guildId: f.guildId, mmrSeasonId: current!.id, title: '새 시즌 내전', teamCount: 2 })
        .returning();
    const teams = await f.db
        .insert(schema.scrimTeams)
        .values([1, 2].map((ordinal) => ({ scrimId: scrim!.id, ordinal, name: `현재 ${ordinal}팀` })))
        .returning();
    const [match] = await f.db
        .insert(schema.matches)
        .values({
            scrimId: scrim!.id,
            teamAId: teams[0]!.id,
            teamBId: teams[1]!.id,
            bestOf: 1,
            isHardFearless: true,
            status: 'completed',
            winnerTeamId: teams[0]!.id
        })
        .returning();
    await seedMatchFilterGame(f.db, match!, 1, null);
    const all = await listMatches(f.db, null, f.guildId, page);
    assert.equal(all.total, 2);
    assert.equal(all.selectedSeasonId, null);
    assert.deepEqual(
        all.seasons.map((season) => season.id),
        [current!.id, f.season.id]
    );
    const selected = await listMatches(f.db, null, f.guildId, {
        ...page,
        seasonId: f.season.id.toUpperCase()
    });
    assert.equal(selected.selectedSeasonId, f.season.id);
    assert.deepEqual(
        selected.matches.map((row) => row.id),
        [f.match.id]
    );
    assert.deepEqual(
        (await listMatches(f.db, null, f.guildId, { ...page, seasonId: current!.id })).matches.map(
            (row) => row.id
        ),
        [match!.id]
    );
    assert.equal((await listMatches(f.db, null, f.guildId, { ...page, seasonId: null })).total, 2);
    for (const seasonId of [other!.id, randomUUID()])
        await assert.rejects(
            listMatches(f.db, null, f.guildId, { ...page, seasonId }),
            errorCode('NOT_FOUND')
        );
    for (const seasonId of ['', 'all', 'invalid'])
        await assert.rejects(
            listMatches(f.db, null, f.guildId, { ...page, seasonId }),
            errorCode('INVALID_INPUT')
        );
});

test('내전 이름·기간·시즌·BO와 공개 출전자의 실제 픽을 함께 검색한다', async (t) => {
    const f = await archiveFixture(t);
    await f.db.update(schema.scrims).set({ title: '100%_내전\\Cup' }).where(eq(schema.scrims.id, f.scrimId));
    const game = await f.createGame(f.db, 1, f.match.id, 'a', {
        startedAt: new Date('2026-11-15T00:00:00Z')
    });
    await f.db
        .update(schema.roflParticipantDataV1)
        .set({ champion: 'Lux' })
        .where(
            and(
                eq(schema.roflParticipantDataV1.roflMetadataId, game.roflMetadataId!),
                eq(schema.roflParticipantDataV1.participantIndex, 0)
            )
        );
    const reversed = await f.createGame(f.db, 2, f.match.id, 'a', { champion: 'Ashe' });
    await f.db
        .update(schema.games)
        .set({ status: 'cancelled', winnerSide: null })
        .where(eq(schema.games.id, reversed.id));
    const filters = { ...page, from: '2026-11-15', to: '2026-11-15', seasonId: f.season.id, bestOf: 1 };
    for (const change of [
        { q: '100%_내전\\cup' },
        { q: '  CUP\t%_ ' },
        { q: '내전', player: '당시 이름 0', champion: 'lux' },
        { champion: '아리', championIds: ['Ahri'], player: '당시 이름 1' },
        { champion: 'HR' },
        { player: '이름 0' }
    ] satisfies Partial<MatchArchiveFilters>[]) {
        const result = await listMatches(f.db, null, f.guildId, { ...filters, ...change });
        assert.equal(result.total, 1);
        assert.equal(result.matches[0]!.matchedGameId, change.player || change.champion ? game.id : null);
    }
    for (const change of [
        { bestOf: 3 },
        { bestOf: 5 },
        { q: '%cup' },
        { q: '_내전x' },
        { q: 'cup 없는단어' },
        { q: '당시 이름' },
        { q: '기록0' },
        { player: '기록0' },
        { player: '사용자 0' },
        { champion: '아리', championIds: ['Ahri'], player: '당시 이름 0' },
        { champion: 'ash' },
        { champion: '%' },
        { player: '_' },
        { from: '2026-11-16', to: '' }
    ] satisfies Partial<MatchArchiveFilters>[]) {
        const result = await listMatches(f.db, null, f.guildId, { ...filters, ...change });
        assert.equal(result.total, 0);
        assert.equal(result.empty, false);
        assert.equal(result.seasons.length, 1);
        assert.equal(result.selectedSeasonId, f.season.id);
    }
    await f.db.update(schema.users).set({ publicProfile: false }).where(eq(schema.users.id, f.users[0]!.id));
    assert.equal((await listMatches(f.db, null, f.guildId, { ...page, player: '이름 0' })).total, 0);
    assert.equal(
        (await listMatches(f.db, null, f.guildId, { ...page, player: '이름 0', champion: 'lux' })).total,
        0
    );
    assert.equal((await listMatches(f.db, null, f.guildId, { ...page, champion: 'lux' })).total, 1);
    await f.db
        .update(schema.users)
        .set({ publicProfile: false, publicRiotIds: false, withdrawnAt: new Date() })
        .where(eq(schema.users.id, f.users[2]!.id));
    assert.equal((await listMatches(f.db, null, f.guildId, { ...page, player: '이름 2' })).total, 0);
    const empty = await listMatches(f.db, null, f.otherGuildId, page);
    assert.equal(empty.empty, true);
    assert.equal(empty.selectedSeasonId, null);
    assert.deepEqual(empty.matches, []);
    await assert.rejects(
        listMatches(f.db, null, f.guildId, { ...page, from: '2026-02-29' }),
        errorCode('INVALID_INPUT')
    );
    await assert.rejects(
        listMatches(f.db, null, f.guildId, { ...page, from: '2026-11-16', to: '2026-11-15' }),
        errorCode('INVALID_INPUT')
    );
});
