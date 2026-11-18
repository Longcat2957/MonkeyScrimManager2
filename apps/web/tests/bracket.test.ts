import assert from 'node:assert/strict';
import test from 'node:test';
import {
    bracketSeats,
    bracketTemplate,
    resolveWinners,
    singleCompletedMatchId
} from '../src/lib/features/scrims/bracket.ts';
import {
    confirmMockBracket,
    getMockBracket,
    placeMockBracketTeam,
    resetMockBracket,
    setMockBracketBestOf,
    unlockMockBracket
} from '../src/lib/mocks/bracket.ts';
import { createMockScrim, findMockScrimRecord } from '../src/lib/mocks/scrims.ts';
import { getMockMatch, recordMockGame, type RawGame } from '../src/lib/mocks/matches.ts';
import sample from '../src/lib/mocks/fixtures/rofl-sample.json' with { type: 'json' };

const guildId = 'devGuild001';

test('완료된 단일 실제 경기만 결과 상세로 보내고 여러 경기·미완료·중도 종료는 대진을 유지한다', () => {
    const single = { matches: bracketTemplate(2) };
    const match = single.matches[0]!;
    assert.equal(singleCompletedMatchId('completed', single), null);
    match.status = 'completed';
    assert.equal(singleCompletedMatchId('completed', single), null);
    match.matchId = 'actual-final';
    assert.equal(singleCompletedMatchId('completed', single), 'actual-final');
    assert.equal(singleCompletedMatchId('ended_early', single), null);
    assert.equal(singleCompletedMatchId('in_progress', single), null);
    const multiple = { matches: bracketTemplate(4) };
    Object.assign(multiple.matches[0]!, { status: 'completed', matchId: 'only-completed-semi' });
    assert.equal(singleCompletedMatchId('completed', multiple), null);
    assert.equal(singleCompletedMatchId('completed', null), null);
});

// 팀 편성이 끝난(대진 준비) 내전을 만든다. 참가자는 devScrim008에서 빌린다.
async function readyScrim(teamCount: number, method: 'manual' | 'auction' = 'manual') {
    const scrimId = await createMockScrim(guildId, {
        title: `대진 테스트 ${teamCount}팀`,
        scheduledAt: null,
        teamCount,
        reserveCapacity: 0,
        hardFearless: false
    });
    const scrim = findMockScrimRecord(guildId, scrimId)!;
    scrim.formationMethod = method;
    scrim.status = 'ready';
    scrim.participants = findMockScrimRecord(guildId, 'devScrim008')!
        .participants.slice(0, teamCount * 5)
        .map((participant, index) => ({
            ...participant,
            registrationId: `${scrimId}-r${index}`,
            userId: `${scrimId}-u${index}`
        }));
    return scrimId;
}

const view = async (scrimId: string) => (await getMockBracket(guildId, scrimId))!;

async function fill(scrimId: string) {
    const bracket = await view(scrimId);
    for (const [index, seat] of bracketSeats(bracket.matches).entries()) {
        assert.equal(await placeMockBracketTeam(guildId, scrimId, seat.key, bracket.teams[index]!.id), null);
    }
}

test('팀 수에 맞는 대진 틀을 만든다', () => {
    assert.deepEqual(
        bracketTemplate(2).map((match) => match.label),
        ['결승']
    );
    assert.deepEqual(
        bracketTemplate(3).map((match) => match.label),
        ['준결승', '결승']
    );
    assert.deepEqual(
        bracketTemplate(4).map((match) => match.label),
        ['준결승 A', '준결승 B', '결승']
    );
    assert.deepEqual(
        bracketSeats(bracketTemplate(3)).map((seat) => seat.label),
        ['준결승 왼쪽', '준결승 오른쪽', '결승 직행']
    );
    for (const count of [2, 3, 4]) assert.equal(bracketSeats(bracketTemplate(count)).length, count);
    assert.deepEqual(bracketTemplate(5), []);
});

test('끝난 경기의 승자만 다음 경기 자리에 올린다', () => {
    const [semi1, semi2, final] = bracketTemplate(4);
    semi1!.a.teamId = 't1';
    semi1!.b.teamId = 't2';
    Object.assign(semi1!, { status: 'completed', winner: 'b' });
    Object.assign(semi2!, { status: 'in_progress', winner: 'a' });
    const resolved = resolveWinners([semi1!, semi2!, final!]);
    assert.equal(resolved[2]!.a.teamId, 't2');
    assert.equal(resolved[2]!.b.teamId, null);
});

test('팀을 옮기면 원래 자리는 비고 도착 자리의 팀은 풀로 돌아간다', async () => {
    const scrimId = await readyScrim(4);
    const { teams, can } = await view(scrimId);
    assert.deepEqual(can, { edit: true, unlock: false });
    await placeMockBracketTeam(guildId, scrimId, 'semi-1-a', teams[0]!.id);
    await placeMockBracketTeam(guildId, scrimId, 'semi-1-b', teams[1]!.id);
    await placeMockBracketTeam(guildId, scrimId, 'semi-1-b', teams[0]!.id);
    const seats = bracketSeats((await view(scrimId)).matches);
    assert.equal(seats.find((seat) => seat.key === 'semi-1-a')!.teamId, null);
    assert.equal(seats.find((seat) => seat.key === 'semi-1-b')!.teamId, teams[0]!.id);
    assert.ok(!seats.some((seat) => seat.teamId === teams[1]!.id));
    await placeMockBracketTeam(guildId, scrimId, 'semi-1-b', null);
    assert.ok(bracketSeats((await view(scrimId)).matches).every((seat) => !seat.teamId));
});

test('경매 준결승 진영 교환은 두 팀을 보존하고 확정 후 결승 직행 시드는 바꿀 수 없다', async () => {
    const id = await readyScrim(3, 'auction');
    await fill(id);
    const [a, b, bye] = (await view(id)).teams.map((team) => team.id) as [string, string, string];
    const seeds = async () => bracketSeats((await view(id)).matches).map((seat) => seat.teamId);
    assert.equal(await placeMockBracketTeam(guildId, id, 'semi-a', b), null);
    assert.deepEqual(await seeds(), [b, a, bye]);

    assert.equal(await placeMockBracketTeam(guildId, id, 'semi-a', bye), null);
    assert.deepEqual(await seeds(), [bye, a, null]);
    assert.equal(await placeMockBracketTeam(guildId, id, 'final-b', b), null);
    assert.equal(await confirmMockBracket(guildId, id), null);
    assert.equal((await placeMockBracketTeam(guildId, id, 'semi-b', b))?.status, 409);
    assert.equal((await placeMockBracketTeam(guildId, id, 'final-b', a))?.status, 409);
    assert.equal((await placeMockBracketTeam(guildId, id, 'semi-a', null))?.status, 409);
    assert.equal(await placeMockBracketTeam(guildId, id, 'semi-b', bye), null);
    assert.deepEqual(await seeds(), [a, bye, b]);
    assert.ok((await view(id)).confirmed);
});

test('잘못된 입력은 거절하고 초기화는 경기 방식을 유지한다', async () => {
    const scrimId = await readyScrim(4);
    assert.equal((await placeMockBracketTeam(guildId, scrimId, 'final-a', null))?.status, 400);
    assert.equal((await placeMockBracketTeam(guildId, scrimId, 'semi-1-a', 'other-team'))?.status, 400);
    assert.equal((await setMockBracketBestOf(guildId, scrimId, 'semi', 2))?.status, 400);
    assert.equal(await setMockBracketBestOf(guildId, scrimId, 'semi', 1), null);
    await fill(scrimId);
    assert.equal(await resetMockBracket(guildId, scrimId), null);
    const bracket = await view(scrimId);
    assert.equal(bracket.bestOf.semi, 1);
    assert.ok(bracketSeats(bracket.matches).every((seat) => !seat.teamId));
});

test('모든 자리를 채워야 확정되고 확정 후에는 다시 편성해야 바꿀 수 있다', async () => {
    const scrimId = await readyScrim(3);
    assert.equal((await confirmMockBracket(guildId, scrimId))?.status, 409);
    await fill(scrimId);
    assert.equal(await confirmMockBracket(guildId, scrimId), null);
    assert.deepEqual((await view(scrimId)).can, { edit: false, unlock: true });
    assert.equal((await resetMockBracket(guildId, scrimId))?.status, 409);
    const semi = (await view(scrimId)).matches[0]!;
    assert.equal((await placeMockBracketTeam(guildId, scrimId, semi.a.seat!, semi.b.teamId))?.status, 409);
    assert.equal(await unlockMockBracket(guildId, scrimId), null);
    assert.equal((await unlockMockBracket(guildId, scrimId))?.status, 409);
    assert.equal((await view(scrimId)).can.edit, true);
});

test('미리보기는 준결승 진영을 저장하고 두 승자가 정해져야 진영 미정 결승을 연다', async () => {
    const scrimId = await readyScrim(4);
    await fill(scrimId);
    assert.equal(await setMockBracketBestOf(guildId, scrimId, 'semi', 1), null);
    const { teams } = await view(scrimId);
    assert.equal((await confirmMockBracket(guildId, scrimId, { 'semi-1': teams[0]!.id }))?.status, 400);
    assert.equal((await view(scrimId)).confirmed, false);
    assert.equal(
        await confirmMockBracket(guildId, scrimId, {
            'semi-1': teams[0]!.id,
            'semi-2': teams[3]!.id
        }),
        null
    );
    const resolvers = {
        champion: (id: string) => ({ id, name: id, iconUrl: null }),
        item: () => null,
        spell: () => null,
        rune: () => null,
        splash: () => null
    };
    const started = await view(scrimId);
    for (const [index, semi] of started.matches.filter((match) => match.stage === 'semi').entries()) {
        assert.equal((await view(scrimId)).matches.at(-1)!.matchId, null);
        const detail = (await getMockMatch(guildId, semi.matchId!, null, resolvers))!;
        const blueTeamSlot = index === 0 ? 'a' : 'b';
        assert.equal(detail.operation.plannedBlueTeamSlot, blueTeamSlot);
        const result = await recordMockGame(guildId, semi.matchId!, sample as RawGame, {
            expectedRevision: detail.operation.revision,
            nextGameNumber: 1,
            blueTeamSlot,
            blueTeamConfirmed: true
        });
        assert.ok('completed' in result && result.completed);
    }
    const [semiA, semiB, final] = (await view(scrimId)).matches;
    assert.ok(semiA?.winner && semiB?.winner && final?.matchId);
    assert.equal(final.a.teamId, semiA[semiA.winner].teamId);
    assert.equal(final.b.teamId, semiB[semiB.winner].teamId);
    const detail = (await getMockMatch(guildId, final.matchId, null, resolvers))!;
    assert.equal(detail.operation.nextGameNumber, 1);
    assert.equal(detail.operation.plannedBlueTeamSlot, null);
});

test('편성 전·열람자·진행된 대진은 바꿀 수 없다', async () => {
    assert.equal(await getMockBracket(guildId, 'devScrim001'), null);
    assert.equal((await placeMockBracketTeam(guildId, 'devScrim001', 'final-a', null))?.status, 409);
    const scrimId = await readyScrim(2);
    findMockScrimRecord(guildId, scrimId)!.canManage = false;
    assert.equal((await placeMockBracketTeam(guildId, scrimId, 'final-a', null))?.status, 403);
    assert.deepEqual((await view(scrimId)).can, { edit: false, unlock: false });
    assert.deepEqual((await view('devScrim005')).can, { edit: false, unlock: false });
});

test('종료된 대진은 점수와 결승 진출 팀을 보여 준다', async () => {
    const { matches, confirmed } = await view('devScrim005');
    assert.equal(confirmed, true);
    const final = matches.find((match) => match.key === 'final')!;
    const semi2 = matches.find((match) => match.key === 'semi-2')!;
    assert.equal(final.a.teamId, matches[0]!.a.teamId);
    assert.equal(final.b.teamId, semi2.b.teamId);
    assert.deepEqual([final.scoreA, final.scoreB, final.winner], [3, 2, 'a']);
    assert.equal((await view('devScrim004')).matches[0]!.status, 'in_progress');
});
