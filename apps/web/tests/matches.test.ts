import assert from 'node:assert/strict';
import test from 'node:test';
import { DomainError } from '../src/lib/server/errors.ts';
import sample from '../src/lib/mocks/fixtures/rofl-sample.json' with { type: 'json' };
import {
    getMockMatch,
    listMockMatches,
    recordMockGame,
    setMockMatchStatus,
    setMockMatchSide,
    type GameResolvers,
    type RawGame
} from '../src/lib/mocks/matches.ts';

const guildId = 'devGuild001';
const resolvers: GameResolvers = {
    champion: (id) => ({ id, name: id, iconUrl: null }),
    item: (id) => (id ? { id, name: String(id), iconUrl: null } : null),
    spell: (id) => (id ? { id, name: String(id), iconUrl: null } : null),
    rune: (id) => (id ? { id, name: String(id), iconUrl: null } : null),
    splash: () => null
};

test('시리즈 승부를 확정한 기록만 검색·집계하고 쪽을 나눈다', async () => {
    const options = { page: 1, pageSize: 20 };
    const first = await listMockMatches(guildId, options);
    const second = await listMockMatches(guildId, { ...options, page: 2 });
    const ids = [...first.matches, ...second.matches].map((match) => match.id);
    assert.equal(first.matches.length, 20);
    assert.equal(new Set(ids).size, first.total);
    assert.ok(ids.includes('devMatch003'));
    for (const id of ['devMatch001', 'devMatch004', 'devMatch005', 'devMatchOld8'])
        assert.ok(!ids.includes(id));

    const query = {
        ...options,
        q: '3주차 10월',
        player: '개발자',
        champion: '레넥톤',
        championIds: ['Renekton'],
        bestOf: 3
    };
    const { matches } = await listMockMatches(guildId, query);
    assert.equal(matches.find((match) => match.id === 'devMatch002')?.matchedGameId, 'devMatch002-g1');
    assert.ok(matches.every((match) => match.bestOf === 3 && match.scrimTitle.includes('3주차')));
    assert.equal((await listMockMatches(guildId, { ...query, champion: 'Sylas', championIds: [] })).total, 0);
    assert.ok((await listMockMatches(guildId, { ...options, champion: 'syLaS' })).total > 0);
    assert.equal((await listMockMatches(guildId, { ...options, q: '칼날부리팀' })).total, 0);
    assert.equal((await listMockMatches(guildId, { ...options, q: '칼바람' })).total, 0);
});

test('개발 경기의 날짜는 한국 날짜로 걸러 표시하고 시즌 귀속이나 미확인 날짜를 만들지 않는다', async () => {
    const options = { page: 1, pageSize: 100 };
    const all = await listMockMatches(guildId, options);
    assert.deepEqual(all.seasons, []);
    assert.equal(all.selectedSeasonId, null);
    assert.equal(all.matches.at(-1)!.id, 'devMatchOld22');
    assert.equal(all.matches.at(-1)!.playedAt, null);
    const day = await listMockMatches(guildId, { ...options, from: '2026-10-24', to: '2026-10-24' });
    assert.deepEqual(
        day.matches.map((match) => match.id),
        ['devMatch003', 'devMatch002']
    );
    const none = await listMockMatches(guildId, {
        ...options,
        q: '칼바람',
        from: '2026-10-31',
        to: '2026-10-31'
    });
    assert.deepEqual(none.matches, []);
    assert.equal(none.empty, false);
    await assert.rejects(
        listMockMatches(guildId, { ...options, from: '2026-02-30' }),
        (error) => error instanceof DomainError && error.code === 'INVALID_INPUT'
    );
    await assert.rejects(
        listMockMatches(guildId, { ...options, seasonId: '58300b67-eecb-4803-bce5-a3da16bc55b9' }),
        (error) => error instanceof DomainError && error.code === 'NOT_FOUND'
    );
});

test('게임 결과에서 진영·MVP·ACE·피어리스 위반을 만든다', async () => {
    const detail = (await getMockMatch(guildId, 'devMatch003', 'devMatch003-g1', resolvers))!;
    assert.deepEqual([detail.match.scoreA, detail.match.scoreB], [1, 2]);
    const game = detail.game!;
    assert.deepEqual(
        game.sides.map((side) => side.side),
        ['blue', 'red']
    );
    assert.equal(
        game.sides.flatMap((side) => side.players).filter((player) => player.badge === 'mvp').length,
        1
    );
    assert.equal(
        game.sides.find((side) => side.win)!.players.some((player) => player.badge === 'mvp'),
        true
    );
    assert.ok(game.sides.flatMap((side) => side.players).every((player) => !player.fearlessViolation));
    assert.equal((await getMockMatch(guildId, 'devMatch003', 'unknown', resolvers))!.game!.order, 3);
});

test('피어리스 안내는 양 팀의 사용 챔피언을 한 목록에 표시하고 빈 경기는 숨긴다', async () => {
    const live = (await getMockMatch(guildId, 'devMatch001', null, resolvers))!;
    assert.ok(Array.isArray(live.usedChampions));
    assert.equal(live.usedChampions.length, 20);
    assert.equal(new Set(live.usedChampions.map((champion) => champion.id)).size, 20);
    assert.ok(live.usedChampions.some((champion) => champion.id === 'Renekton'));
    assert.ok(live.usedChampions.some((champion) => champion.id === 'Zaahen'));
    setMockMatchStatus(guildId, 'devMatch005', 'in_progress');
    try {
        const empty = (await getMockMatch(guildId, 'devMatch005', null, resolvers))!;
        assert.equal(empty.game, null);
        assert.equal(empty.usedChampions, null);
    } finally {
        setMockMatchStatus(guildId, 'devMatch005', 'completed');
    }
});

test('업로드한 게임을 기록하고 같은 파일·종료된 경기는 거절한다', async () => {
    const raw = { ...(sample as RawGame), gameLengthMs: 1_234_567 };
    const input = { expectedRevision: 0, nextGameNumber: 3, blueTeamSlot: 'a' as const };
    assert.equal(setMockMatchSide(guildId, 'devMatch001', input), null);
    const before = (await getMockMatch(guildId, 'devMatch001', null, resolvers))!;
    assert.equal(before.operation.plannedBlueTeamSlot, 'a');
    const actual = {
        ...input,
        expectedRevision: before.operation.revision,
        blueTeamSlot: 'b' as const,
        blueTeamConfirmed: false
    };
    const unconfirmed = await recordMockGame(guildId, 'devMatch001', raw, actual);
    assert.ok('status' in unconfirmed && unconfirmed.status === 400);
    actual.blueTeamConfirmed = true;
    assert.deepEqual(await recordMockGame(guildId, 'devMatch001', raw, actual), {
        order: 3,
        revision: 2,
        completed: true
    });
    const duplicate = await recordMockGame(guildId, 'devMatch001', raw, actual);
    assert.ok('status' in duplicate && duplicate.status === 409);
    const detail = (await getMockMatch(guildId, 'devMatch001', null, resolvers))!;
    assert.equal(detail.match.status, 'completed');
    assert.equal(detail.game!.sides.find((side) => side.side === 'blue')!.slot, 'b');
    assert.equal(detail.operation.plannedBlueTeamSlot, null);
    assert.equal(detail.can.upload, false);
    // 이전 세트에 등장한 챔피언은 어느 팀이 다시 골라도 하드 피어리스에 해당한다.
    assert.ok(detail.game!.sides.flatMap((side) => side.players).every((player) => player.fearlessViolation));
    assert.equal(detail.usedChampions, null);
    const closed = await recordMockGame(guildId, 'devMatch002', raw, actual);
    assert.ok('status' in closed && closed.status === 409);
});
