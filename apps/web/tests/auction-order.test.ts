import assert from 'node:assert/strict';
import test from 'node:test';
import { orderAuctionCandidates } from '../src/lib/server/scrims/auction-order.ts';

for (const n of [8, 16]) {
    test(`${n}명 후보의 모든 순위·순번은 선형 호명 확률을 따른다`, () => {
        const ranks = Array.from({ length: n }, (_, i) => i + 1);
        const counts = ranks.map(() => Array<number>(n).fill(0));
        const draws = 60_000;
        let seed = 42;
        function randomIndex(limit: number) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return Math.floor((seed / 2 ** 32) * limit);
        }
        for (let i = 0; i < draws; i++) {
            const order = orderAuctionCandidates(
                ranks,
                (rank) => (rank === n ? null : n - rank),
                randomIndex
            );
            order.forEach((rank, slot) => counts[rank - 1]![slot]!++);
        }
        for (const rank of ranks) {
            for (const slot of ranks) {
                const expected = (1 + (0.44 * (n + 1 - 2 * rank) * (n + 1 - 2 * slot)) / (n - 1) ** 2) / n;
                const actual = counts[rank - 1]![slot - 1]! / draws;
                assert.ok(
                    Math.abs(actual - expected) < 0.006,
                    `${rank}위 ${slot}번: ${actual} (기대 ${expected})`
                );
            }
        }
    });
}

test('낙찰 이력이 모두 없으면 신청순으로 호명하지 않는다', () => {
    const candidates = ['가', '나', '다', '라', '마', '바', '사', '아'];
    const firstPair = (draw: (limit: number) => number) =>
        orderAuctionCandidates(candidates, () => null, draw)
            .slice(0, 2)
            .sort();
    assert.notDeepEqual(
        firstPair(() => 0),
        firstPair((limit) => limit - 1)
    );
});

test('15인 내전의 경매 순서를 만들지 않는다', () => {
    assert.throws(() => orderAuctionCandidates(Array(12).fill(0), () => null), { code: 'INVALID_INPUT' });
});
