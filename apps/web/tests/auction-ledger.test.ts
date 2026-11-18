import assert from 'node:assert/strict';
import test from 'node:test';
import { priceSummary } from '../src/lib/features/stats/auction-ledger.ts';

test('수동 배치와 0P 낙찰은 표본·평균·중앙값·범위에서 제외한다', () => {
    assert.equal(priceSummary([null, 0]), null);
    assert.deepEqual(priceSummary([0, 100, null, 9, 30, 11]), {
        count: 4,
        average: 37.5,
        median: 20.5,
        min: 9,
        max: 100
    });
});
