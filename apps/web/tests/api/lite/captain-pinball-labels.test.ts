import assert from 'node:assert/strict';
import test from 'node:test';
import { BALL_RADIUS } from '../../../src/lib/features/scrims/captain-pinball.ts';
import {
    createPinballLabels,
    LABEL_HEIGHT
} from '../../../src/lib/features/scrims/captain-pinball-labels.ts';

for (const count of [10, 20]) {
    test(`${count}명이 출발선에 몰려도 각 이름표가 카메라 안의 별도 자리를 유지한다`, () => {
        const balls = Array.from({ length: count }, (_, i) => ({ x: 15 + 14 * i, y: 16, finished: false }));
        const layout = createPinballLabels(balls);
        const { labels, width } = layout;
        for (const [i, label] of labels.entries()) {
            assert.equal(label.opacity, 1);
            assert.ok(label.x >= 0 && label.x + width <= 360);
            assert.ok(label.y >= 0 && label.y + LABEL_HEIGHT <= 300);
            assert.ok(
                balls.every(
                    (ball) =>
                        label.x > ball.x + BALL_RADIUS ||
                        label.x + width < ball.x - BALL_RADIUS ||
                        label.y > ball.y + BALL_RADIUS ||
                        label.y + LABEL_HEIGHT < ball.y - BALL_RADIUS
                )
            );
            for (const other of labels.slice(0, i)) {
                assert.ok(
                    Math.abs(label.x - other.x) >= width || Math.abs(label.y - other.y) >= LABEL_HEIGHT
                );
            }
        }
        // 출발 대열이 뒤집혀도 이동 도중 서로 겹치거나 한 프레임 만에 순간 이동하지 않는다.
        for (const [i, ball] of balls.entries()) ball.y = 280 - i * 8;
        for (let frame = 1; frame <= 80; frame++) {
            const before = labels.map((label) => ({ ...label }));
            layout.place(0, frame * 16);
            for (const [i, label] of labels.entries()) {
                assert.equal(label.x, before[i]!.x);
                assert.ok(Math.abs(label.y - before[i]!.y) < 30);
                for (const other of labels.slice(0, i)) {
                    assert.ok(
                        Math.abs(label.x - other.x) >= width || Math.abs(label.y - other.y) >= LABEL_HEIGHT
                    );
                }
            }
        }
        assert.ok(labels.some((label) => label.y > 180));
    });
}

test('가장자리에서 반경만큼 흔들려도 이름표는 꺼지지 않고 화면 밖에서 서서히 사라진다', () => {
    const ball = { x: 100, y: 5, finished: false };
    const layout = createPinballLabels([ball]);
    const label = layout.labels[0]!;
    for (let i = 1; i <= 30; i++) {
        ball.y = i % 2 ? -8 : -6;
        layout.place(0, i * 16);
        assert.ok(label.opacity > 0.5);
    }
    ball.y = -50;
    layout.place(0, 496);
    assert.ok(label.opacity > 0);
    for (let i = 32; i <= 100; i++) layout.place(0, i * 16);
    assert.equal(label.opacity, 0);
    ball.y = 15;
    layout.place(0, 1616);
    assert.ok(label.opacity > 0 && label.opacity < 0.2);
});
