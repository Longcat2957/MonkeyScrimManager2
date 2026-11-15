import assert from 'node:assert/strict';
import test from 'node:test';
import { mockRecordSeasons } from '../../../src/lib/server/records/seasons.ts';
import { domainError } from '../support/error-assertions.ts';

test('시즌 이력이 없는 개발 샘플에는 과거 숫자와 시즌 식별자를 만들지 않는다', () => {
    assert.deepEqual(mockRecordSeasons(), { seasons: [], selectedSeasonId: null });
    assert.deepEqual(mockRecordSeasons(null), { seasons: [], selectedSeasonId: null });
    assert.throws(() => mockRecordSeasons('58300b67-eecb-4803-bce5-a3da16bc55b9'), domainError('NOT_FOUND'));
});

for (const value of ['', 'all', 'current', 'not-a-season'])
    test(`명시한 잘못된 시즌 값은 기본 시즌으로 숨기지 않는다: ${value}`, () => {
        assert.throws(() => mockRecordSeasons(value), domainError('INVALID_INPUT'));
    });
