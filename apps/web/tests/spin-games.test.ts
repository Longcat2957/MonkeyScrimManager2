import assert from 'node:assert/strict';
import test from 'node:test';
import { drawIndex, MAX_OPTIONS, pointerRotation } from '../src/lib/components/minigames/spin.ts';

test('코인 양면과 룰렛 선택지는 같은 확률로 뽑는다', (t) => {
    let byte = 0;
    t.mock.method(crypto, 'getRandomValues', (output: Uint8Array) => {
        output[0] = byte;
        byte = (byte + 1) % 256;
        return output;
    });
    for (let count = 2; count <= MAX_OPTIONS; count++) {
        byte = 255;
        const hits = Array<number>(count).fill(0);
        for (let draw = 0; draw < 256 - (256 % count); draw++) hits[drawIndex(count)]++;
        assert.deepEqual(hits, Array(count).fill(Math.floor(256 / count)));
    }
});

test('룰렛이 멈추면 선택된 칸의 중앙이 12시 화살표에 놓인다', () => {
    for (let count = 2; count <= MAX_OPTIONS; count++) {
        const step = 360 / count;
        for (let index = 0; index < count; index++) {
            const pointerAngle = 360 - pointerRotation(index, count);
            assert.ok(Math.abs(pointerAngle - (index + 0.5) * step) < 1e-9);
            assert.equal(Math.floor(pointerAngle / step), index);
        }
    }
});
