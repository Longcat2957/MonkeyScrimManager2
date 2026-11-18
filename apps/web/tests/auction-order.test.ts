import assert from 'node:assert/strict';
import test from 'node:test';
import { orderAuctionCandidates } from '../src/lib/server/scrims/auction-order.ts';

for (const count of [8, 16]) {
    test(`${count}명 후보는 가격대 사이를 넘지 않고 모든 그룹 안에서 섞인다`, () => {
        const candidates = Array.from({ length: count }, (_, i) => i);
        const size = count / 4;
        const order = orderAuctionCandidates(
            candidates,
            (i) => (i === 0 ? null : i),
            () => 0
        );
        for (let offset = 0; offset < count; offset += size) {
            const group = order.slice(offset, offset + size);
            const expected = candidates.slice(count - offset - size, count - offset).reverse();
            assert.notDeepEqual(group, expected);
            assert.deepEqual(
                group.toSorted((a, b) => b - a),
                expected
            );
        }
    });
}

test('동률이면 가격대 경계에서도 후보가 고정되지 않는다', () => {
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

test('15인 내전은 가격대 없이 전체 후보를 섞는다', () => {
    const candidates = Array.from({ length: 12 }, (_, i) => i);
    assert.deepEqual(
        orderAuctionCandidates(
            candidates,
            (i) => i,
            () => 0
        ),
        [...candidates.slice(1), 0]
    );
});
