import assert from 'node:assert/strict';
import test from 'node:test';
import { createLadder, traceLane } from '../src/lib/features/minigames/ladder.ts';

test('경로는 만나는 가로선만 건너고 표시한 기둥에서 끝난다', () => {
    const rungs = [0, 1, 0];
    assert.deepEqual(traceLane(0, 3, rungs), { output: 2, path: 'M 100 0 V 55 H 300 V 110 H 500 V 220' });
    assert.deepEqual(traceLane(1, 3, rungs), { output: 1, path: 'M 300 0 V 55 H 100 V 165 H 300 V 220' });
});

test('2~6칸 모두 연결되며 셔플의 모든 조합은 서로 다른 일대일 대응을 만든다', () => {
    for (let columns = 2; columns <= 6; columns++) {
        const count = Array.from({ length: columns }, (_, i) => i + 1).reduce((a, b) => a * b);
        const permutations = new Set<string>();
        for (let seed = 0; seed < count; seed++) {
            let code = seed;
            let drawCount = 0;
            const { rungs, traces } = createLadder(columns, (limit) => {
                if (drawCount++ < columns - 2) return limit - 1;
                const choice = code % limit;
                code = Math.floor(code / limit);
                return choice;
            });
            assert.equal(new Set(rungs).size, columns - 1);
            assert.ok(rungs.every((left) => left >= 0 && left < columns - 1));
            const outputs = traces.map(({ output }) => output);
            assert.deepEqual(
                [...outputs].sort(),
                Array.from({ length: columns }, (_, i) => i)
            );
            permutations.add(outputs.join(','));
        }
        assert.equal(permutations.size, count);
    }
});
