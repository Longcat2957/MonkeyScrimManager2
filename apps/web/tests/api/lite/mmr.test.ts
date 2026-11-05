import assert from 'node:assert/strict';
import test from 'node:test';
import {
    calculateElo,
    calculateGameMmr,
    INITIAL_MMR,
    K_FACTOR,
    MMR_POSITIONS,
    type MmrPlayer
} from '../../../src/lib/server/mmr/rules.ts';
import { domainError } from '../support/error-assertions.ts';

const lineup = (): MmrPlayer[] =>
    (['blue', 'red'] as const).flatMap((side) =>
        MMR_POSITIONS.map((position) => ({ userId: `${side}-${position}`, position, side, mmr: 1500 }))
    );

test('MSM1 초기 1500·K32에서 동일 점수 승패는 각각 ±16이다', () => {
    assert.equal(INITIAL_MMR, 1500);
    assert.equal(K_FACTOR, 32);
    assert.deepEqual(calculateElo(1500, 1500, true), { beforeMmr: 1500, afterMmr: 1516, delta: 16 });
    assert.deepEqual(calculateElo(1500, 1500, false), { beforeMmr: 1500, afterMmr: 1484, delta: -16 });
});

for (const winnerSide of ['blue', 'red'] as const) {
    test(`${winnerSide} 승리: 동포지션의 반영 전 값으로 계산하고 소수를 유지한다`, () => {
        const players = lineup();
        players[0]!.mmr = 1900;
        const before = structuredClone(players);
        const changes = calculateGameMmr(players, winnerSide);
        const blue = changes.find((row) => row.userId === 'blue-top')!;
        const red = changes.find((row) => row.userId === 'red-top')!;
        const expectedBlue = winnerSide === 'blue' ? 1902.909090909091 : 1870.909090909091;
        assert.ok(Math.abs(blue.afterMmr - expectedBlue) < 1e-10);
        assert.ok(Math.abs(blue.delta + red.delta) < 1e-10);
        assert.equal(blue.opponentUserId, 'red-top');
        assert.equal(red.opponentUserId, 'blue-top');
        assert.equal(changes.find((row) => row.userId === `${winnerSide}-mid`)!.afterMmr, 1516);
        assert.deepEqual(players, before);
        assert.deepEqual(calculateGameMmr([...players].reverse(), winnerSide), changes);
    });
}

const invalidLineups: [string, (players: MmrPlayer[]) => MmrPlayer[]][] = [
    ['9명', (players) => players.slice(1)],
    ['11명', (players) => [...players, { ...players[0]!, userId: 'extra' }]],
    [
        '중복 사용자',
        (players) => {
            players[9]!.userId = players[0]!.userId;
            return players;
        }
    ],
    [
        '빈 사용자',
        (players) => {
            players[0]!.userId = '';
            return players;
        }
    ],
    [
        '중복 포지션',
        (players) => {
            players[0]!.position = 'mid';
            return players;
        }
    ],
    [
        '미확인 포지션',
        (players) => {
            players[0]!.position = 'unknown' as 'top';
            return players;
        }
    ],
    [
        '잘못된 진영',
        (players) => {
            players[0]!.side = 'unknown' as 'blue';
            return players;
        }
    ],
    [
        'NaN 점수',
        (players) => {
            players[0]!.mmr = NaN;
            return players;
        }
    ]
];
for (const [name, change] of invalidLineups) {
    test(`MMR 출전 검증: ${name}`, () =>
        assert.throws(() => calculateGameMmr(change(lineup()), 'blue'), domainError('CONFLICT')));
}

for (const value of [NaN, Infinity, -Infinity]) {
    test(`Elo는 유한하지 않은 값 ${String(value)}를 양쪽 모두 거절한다`, () => {
        assert.throws(() => calculateElo(value, 1500, true), domainError('INVALID_INPUT'));
        assert.throws(() => calculateElo(1500, value, false), domainError('INVALID_INPUT'));
    });
}

test('승패·승리 진영은 허용한 값만 사용한다', () => {
    assert.throws(() => calculateElo(1500, 1500, 1 as unknown as boolean), domainError('INVALID_INPUT'));
    assert.throws(() => calculateGameMmr(lineup(), 'unknown' as 'blue'), domainError('CONFLICT'));
});
