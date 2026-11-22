import assert from 'node:assert/strict';
import test from 'node:test';
import { FINISH_Y } from '../../../src/lib/features/scrims/captain-pinball.ts';
import { PinballCamera } from '../../../src/lib/features/scrims/captain-pinball-camera.ts';

const maxTop = FINISH_Y + 33 - 300;
const runners = (...positions: number[]) => positions.map((y) => ({ x: 180, y, finished: false }));

test('출발 대열에서 실제 접전을 유지한 뒤 후미권과 다른 접전을 차례로 비춘다', () => {
    const balls = runners(340, 557, 560, 390, 401);
    const camera = new PinballCamera(balls, maxTop);
    let next = 0;
    function until(ms: number) {
        for (; next <= ms; next += 50) camera.frame(0, undefined, next);
    }
    until(2600);
    assert.equal(camera.shot, 'pack');
    until(3000);
    assert.deepEqual([camera.shot, camera.first, camera.second], ['battle', 1, 2]);
    balls[4]!.y = balls[3]!.y;
    until(6400);
    assert.deepEqual([camera.shot, camera.first, camera.second], ['battle', 1, 2]);
    until(7200);
    assert.equal(camera.shot, 'rear');
    balls[4]!.y = 401;
    until(10300);
    assert.deepEqual([camera.shot, camera.first, camera.second], ['battle', 3, 4]);
    balls[3]!.finished = true;
    until(10350);
    assert.equal(camera.shot, 'rear');
});

test('앞선 구슬이 결승에 접근해도 최후미가 오기 전에는 결승선에 고정하지 않는다', () => {
    const balls = runners(350, 910, FINISH_Y - 40);
    const camera = new PinballCamera(balls, maxTop);
    for (let t = 0; t <= 3500; t += 50) camera.frame(0, undefined, t);
    assert.equal(camera.shot, 'rear');
    balls[1]!.finished = true;
    balls[0]!.y = FINISH_Y - 185;
    camera.frame(0, 2, 3550);
    assert.equal(camera.shot, 'follow');
    camera.frame(0, undefined, 3600);
    assert.equal(camera.shot, 'finish');
    balls[0]!.y -= 35;
    for (let t = 3650; t <= 10000; t += 50) camera.frame(0, undefined, t);
    assert.equal(camera.shot, 'finish');
    assert.ok(Math.abs(camera.top - maxTop) < 0.01);
});

test('같은 시각의 팬 위치는 프레임률과 무관하고 표적 변경도 최고 속도를 지킨다', () => {
    function pan(stepMs: number) {
        const balls = runners(830, 150);
        const camera = new PinballCamera(balls, maxTop);
        let previous = 0;
        for (let t = 0; t <= 2000; t += stepMs) {
            const top = camera.frame(0, t <= 1250 ? 0 : 1, t);
            assert.ok(Math.abs(top - previous) <= (680 * stepMs) / 1000 + 1e-9);
            previous = top;
        }
        return previous;
    }
    // 표적이 바뀌는 첫 프레임 전후의 시간 간격도 두 주기로 똑같이 나눈다.
    assert.ok(Math.abs(pan(10) - pan(50)) < 1e-8);
});
