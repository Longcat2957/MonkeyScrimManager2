import assert from 'node:assert/strict';
import test from 'node:test';
import {
    assignLanes,
    demoGame,
    demoPreview,
    type DemoGameTemplate,
    type DemoLineupTeam
} from '../src/lib/features/landing/game.ts';
import type { LolPosition } from '../src/lib/features/guild/types.ts';

const LANES: LolPosition[] = ['top', 'jungle', 'mid', 'bot', 'support'];

test('소개 체험 라인업은 선호 포지션을 겹치지 않게 다섯 자리에 배치한다', () => {
    const members = [
        { id: 'a', positions: ['top'] },
        { id: 'b', positions: ['top', 'jungle'] },
        { id: 'c', positions: ['mid'] },
        { id: 'd', positions: [...LANES] },
        { id: 'e', positions: ['mid'] }
    ] satisfies { id: string; positions: LolPosition[] }[];
    const lanes = assignLanes(members);
    assert.deepEqual(
        lanes.map(({ lane, member }) => [lane, member.id]),
        [
            ['top', 'a'],
            ['jungle', 'b'],
            ['mid', 'c'],
            ['bot', 'd'],
            ['support', 'e']
        ]
    );
});

const record = (champion: string) => ({
    champion: { id: champion, name: champion, iconUrl: null },
    level: 15,
    kills: 1,
    deaths: 2,
    assists: 3,
    cs: 100,
    damage: 1000,
    damageTaken: 900,
    gold: 8000,
    visionScore: 10,
    wardsPlaced: 5,
    wardsKilled: 1,
    controlWards: 1,
    heal: 0,
    shield: 0,
    largestKillingSpree: 0,
    multiKills: { double: 0, triple: 0, quadra: 0, penta: 0 },
    items: [],
    spells: [],
    keystone: null,
    secondaryStyle: null,
    score: null,
    badge: null,
    titles: [],
    fearlessViolation: false
});

const template: DemoGameTemplate = {
    durationSec: 1863,
    patch: '16.21',
    blueWin: false,
    sides: {
        blue: LANES.map((lane) => record(`blue-${lane}`)),
        red: LANES.map((lane) => record(`red-${lane}`))
    }
};
const team = (slot: 'a' | 'b', name: string): DemoLineupTeam => ({
    slot,
    name,
    players: LANES.map((position) => ({
        participantId: `${slot}-${position}`,
        displayName: `${name}-${position}`,
        position
    }))
});
const teams: [DemoLineupTeam, DemoLineupTeam] = [team('a', '포로팀'), team('b', '칼날부리팀')];

test('업로드 때 고른 블루 팀이 샘플 기록의 블루 진영 출전자가 된다', () => {
    const { game, lineup } = demoGame(template, teams, 'b');
    const [blue, red] = game.sides;
    assert.equal(blue!.side, 'blue');
    assert.equal(blue!.teamName, '칼날부리팀');
    assert.equal(blue!.win, false);
    assert.equal(red!.teamName, '포로팀');
    assert.equal(red!.win, true);
    assert.equal(blue!.players[2]!.displayName, '칼날부리팀-mid');
    assert.equal(blue!.players[2]!.champion.id, 'blue-mid');
    assert.equal(lineup?.status, 'confirmed');
    assert.equal(lineup?.players.length, 10);
    // 실제 기준이 없는 평점은 만들지 않는다.
    assert.ok(game.sides.every((side) => side.players.every((player) => player.score === null)));
});

test('미리보기는 진영·포지션·승패를 등록 결과와 같게 보여 준다', () => {
    const preview = demoPreview(template, teams, 'a');
    assert.equal(preview.blueTeamSlot, 'a');
    assert.equal(preview.winner, 'red');
    const blueMid = preview.players.find((player) => player.side === 'blue' && player.position === 'mid');
    assert.equal(blueMid?.displayName, '포로팀-mid');
    assert.equal(preview.players.length, 10);
});
