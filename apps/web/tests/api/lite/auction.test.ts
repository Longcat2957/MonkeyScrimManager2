import assert from 'node:assert/strict';
import test from 'node:test';
import { auctionPoints, auctionSetup } from '../../../src/lib/server/scrims/auction.ts';
import { domainError } from '../support/error-assertions.ts';

const captainId = 'd57f0ab2-97eb-437c-a5f6-f8cb5055b962';
const team = { captainId: null, startPoints: 1000 };

test('0점 낙찰은 허용하지만 초기 예산은 양수여야 한다', () => {
    assert.equal(auctionPoints(0, 0), 0);
    assert.equal(auctionPoints(2_147_483_647, 1), 2_147_483_647);
    assert.throws(() => auctionPoints(0, 1), domainError('INVALID_INPUT'));
});

for (const value of [-1, 1.5, NaN, Infinity, '100', 2_147_483_648, null]) {
    test(`경매 포인트 입력 거절: ${String(value)}`, () =>
        assert.throws(() => auctionPoints(value, 0), domainError('INVALID_INPUT')));
}

test('2~4팀의 부분 팀장 저장을 허용하며 입력 객체는 공유하지 않는다', () => {
    for (const size of [2, 3, 4]) {
        const input = Array.from({ length: size }, (_, index) => ({
            ...team,
            captainId: index === 0 ? captainId : null
        }));
        const result = auctionSetup(input);
        assert.deepEqual(result, input);
        assert.notEqual(result, input);
        assert.notEqual(result[0], input[0]);
    }
});

for (const [name, value] of [
    ['문자열', '[]'],
    ['빈 배열', []],
    ['한 팀', [team]],
    ['다섯 팀', Array.from({ length: 5 }, () => team)],
    ['팀 null', [team, null]],
    ['필드 누락', [team, { captainId: null }]],
    ['잘못된 팀장', [team, { ...team, captainId: 'invalid' }]],
    [
        '중복 팀장',
        [
            { ...team, captainId },
            { ...team, captainId }
        ]
    ],
    ['0점 초기 예산', [team, { ...team, startPoints: 0 }]]
] as const) {
    test(`경매 팀 설정 거절: ${name}`, () =>
        assert.throws(() => auctionSetup(value), domainError('INVALID_INPUT')));
}
