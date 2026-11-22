import assert from 'node:assert/strict';
import test from 'node:test';
import {
    BALL_RADIUS,
    FINISH_Y,
    createCaptainRace
} from '../../../src/lib/features/scrims/captain-pinball.ts';

function seeded(seed: number) {
    return () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 2 ** 32;
    };
}

function assertSeparated(balls: readonly { x: number; y: number; finished: boolean }[]) {
    for (let i = 0; i < balls.length; i++) {
        const a = balls[i]!;
        if (a.finished) continue;
        for (let j = i + 1; j < balls.length; j++) {
            const b = balls[j]!;
            if (b.finished) continue;
            const squared = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
            if (!(squared >= (2 * BALL_RADIUS - 0.001) ** 2)) {
                assert.fail(`구슬 ${i}, ${j} 중심 거리: ${Math.sqrt(squared)}`);
            }
        }
    }
}

test('빈 추첨은 비어 있고 범위 밖 인원은 거부한다', () => {
    const race = createCaptainRace(0);
    race.step();
    assert.deepEqual(race.balls, []);
    assert.deepEqual(race.finishOrder, []);
    for (const count of [-1, 21, 1.5, NaN]) assert.throws(() => createCaptainRace(count), RangeError);
});

test('시드와 인원수에 상관없이 겹치지 않고 실제 결승선을 한 번씩 통과한다', () => {
    const sources = [() => 0, () => 0.5, () => 1 - Number.EPSILON];
    for (let i = 1; i <= 12; i++) sources.push(seeded(i));
    const firstArrivals: number[] = [];
    for (const random of sources) {
        for (const count of [1, 2, 7, 20]) {
            const race = createCaptainRace(count, random);
            const ids = race.balls.map((_, i) => i);
            assertSeparated(race.balls);
            for (let tick = 1; tick <= 66 * 60 && race.finishOrder.length < count; tick++) {
                const before = race.balls.map((ball) => ball.y);
                const previous = race.finishOrder.length;
                race.step();
                assertSeparated(race.balls);
                if (!previous && race.finishOrder.length) {
                    assert.ok(tick >= 12 * 60);
                    if (count === 20) firstArrivals.push(tick);
                }
                for (const id of race.finishOrder.slice(previous)) {
                    assert.ok(before[id]! < FINISH_Y && before[id]! > FINISH_Y - 2 * BALL_RADIUS);
                    assert.equal(race.balls[id]!.finished, true);
                    assert.equal(race.balls[id]!.y, FINISH_Y);
                }
            }
            assert.deepEqual(
                [...race.finishOrder].sort((a, b) => a - b),
                ids
            );
            const result = [...race.finishOrder];
            race.step();
            assert.deepEqual(race.finishOrder, result);
        }
    }
    firstArrivals.sort((a, b) => a - b);
    const median = firstArrivals[Math.floor(firstArrivals.length / 2)]!;
    assert.ok(median >= 15 * 60 && median <= 25 * 60, `20인 첫 도착 중앙값: ${median / 60}초`);
});

test('같은 시드와 스텝 수는 같은 궤적과 순위를 만든다', () => {
    const a = createCaptainRace(20, seeded(93));
    const b = createCaptainRace(20, seeded(93));
    assert.deepEqual(a.pegs, b.pegs);
    assert.deepEqual(a.rails, b.rails);
    assert.deepEqual(a.sweepers, b.sweepers);
    assert.notDeepEqual(a.pegs, createCaptainRace(20, seeded(94)).pegs);
    for (let start = 0; start < 66 * 60 && a.finishOrder.length < 20; start += 180) {
        let steps = 0;
        for (; steps < 180 && a.finishOrder.length < 20; steps++) a.step();
        for (let i = 0; i < steps; i++) b.step();
        assert.deepEqual(a.balls, b.balls);
        assert.deepEqual(a.finishOrder, b.finishOrder);
    }
    assert.equal(a.finishOrder.length, 20);
});

test('열 구슬 모두 중간 지점에서 정확히 한 번 같은 시간 동안 가속한다', () => {
    const race = createCaptainRace(10, seeded(72));
    const thresholds = race.balls.map((ball) => ball.boostAtY);
    assert.ok(thresholds.every((y) => y >= FINISH_Y * 0.35 && y <= FINISH_Y * 0.65));
    assert.equal(new Set(thresholds).size, 10);
    const starts = Array(10).fill(0);
    const activeSteps = Array(10).fill(0);
    const active = Array(10).fill(false);
    for (let step = 0; step < 66 * 60 && race.finishOrder.length < 10; step++) {
        race.step();
        for (const [i, ball] of race.balls.entries()) {
            const now = ball.boostRemaining > 0;
            if (now && !active[i]) starts[i]++;
            if (now) activeSteps[i]++;
            active[i] = now;
        }
    }
    assert.deepEqual(starts, Array(10).fill(1));
    // 공개 스텝은 물리 틱 2개다. 시작 틱의 홀짝에 따라 마지막 관측 한 번이 달라진다.
    assert.ok(activeSteps.every((steps) => steps === 71 || steps === 72));
    assert.equal(race.finishOrder.length, 10);
});

test('부스트가 실제 낙하 속도를 올리되 제한 속도와 범퍼 충돌을 지킨다', () => {
    const race = createCaptainRace(1, () => 0.5);
    const ball = race.balls[0]!;
    Object.assign(ball, { x: 180, y: ball.boostAtY - 8, vx: 0, vy: 177 });
    race.step();
    assert.equal(ball.boostRemaining, 0);
    assert.equal(ball.vy, 177);
    ball.y = ball.boostAtY;
    race.step();
    assert.ok(Math.abs(ball.boostRemaining - (1.2 - 1 / 60)) < 1e-9);
    assert.ok(ball.vy > 177 && ball.y > ball.boostAtY + 177 / 60);
    for (let i = 0; i < 6; i++) race.step();
    assert.equal(ball.vy, 235);
    const peg = race.pegs.find((peg) => peg.y > ball.y && peg.r >= 9)!;
    Object.assign(ball, { x: peg.x, y: peg.y - peg.r - BALL_RADIUS - 0.05 });
    race.step();
    assert.ok(ball.boostRemaining > 0 && ball.vy < 0 && peg.impact > 0);
    for (let i = 8; i < 72; i++) race.step();
    assert.equal(ball.boostRemaining, 0);
    Object.assign(ball, { x: 180, y: ball.boostAtY, vx: 0, vy: 177 });
    race.step();
    assert.equal(ball.boostRemaining, 0);
    assert.equal(ball.vy, 177);
});

test('후보 배열 순서가 아닌 무작위 출발 위치가 구슬에 배정된다', () => {
    function draw(first: number) {
        let shuffled = false;
        return createCaptainRace(2, () => {
            if (shuffled) return 0.5;
            shuffled = true;
            return first;
        });
    }
    const a = draw(0);
    const b = draw(0.75);
    assert.equal(a.balls[0]!.x, b.balls[1]!.x);
    assert.equal(a.balls[1]!.x, b.balls[0]!.x);
    for (let i = 0; i < 66 * 60 && a.finishOrder.length < 2; i++) {
        a.step();
        b.step();
    }
    assert.equal(a.finishOrder.length, 2);
    assert.deepEqual(
        a.finishOrder,
        b.finishOrder.map((id) => 1 - id)
    );
});

test('정면 충돌에서 질량이 같은 구슬은 서로 밀리고 수평 운동량을 교환한다', () => {
    const race = createCaptainRace(2, () => 0.5);
    const [a, b] = race.balls;
    Object.assign(a!, { x: 140, y: 38, vx: 85, vy: 0 });
    Object.assign(b!, { x: 140 + 2 * BALL_RADIUS + 0.5, y: 38, vx: -85, vy: 0 });
    race.step();
    assertSeparated(race.balls);
    assert.ok(a!.vx < -60 && b!.vx > 60);
    assert.ok(Math.abs(a!.vx + b!.vx) < 1e-6);

    Object.assign(a!, { x: 150, vx: 85 });
    Object.assign(b!, { x: 150, vx: -85 });
    race.step();
    assertSeparated(race.balls);
    assert.ok(a!.x < b!.x && a!.vx < -60 && b!.vx > 60);
});

test('양쪽 동시 충돌과 중심이 일치하는 20개 구슬도 분리한다', () => {
    const triple = createCaptainRace(3, () => 0.5);
    for (let i = 0; i < 3; i++) {
        Object.assign(triple.balls[i]!, { x: 140 + i * 2 * BALL_RADIUS, y: 45, vx: 48 * (1 - i), vy: 0 });
    }
    triple.step();
    assertSeparated(triple.balls);
    assert.ok(triple.balls[0]!.vx < -25 && triple.balls[2]!.vx > 25);

    const pack = createCaptainRace(20, seeded(1));
    for (const ball of pack.balls) Object.assign(ball, { x: 180, y: 300, vx: 0, vy: 0 });
    for (let i = 0; i < 12; i++) {
        pack.step();
        assertSeparated(pack.balls);
    }
});

test('회전봉의 양 끝은 정지한 구슬을 서로 반대 방향으로 쳐낸다', () => {
    const race = createCaptainRace(2, () => 0.5);
    const bar = race.sweepers[0]!;
    const angle = bar.angle;
    const [left, right] = race.balls;
    for (const [i, ball] of race.balls.entries()) {
        const side = i === 0 ? -1 : 1;
        Object.assign(ball, {
            x: bar.x + side * bar.length * 0.84,
            y: bar.y + side * (bar.r + BALL_RADIUS + 0.03),
            vx: 0,
            vy: 0
        });
    }
    race.step();
    assert.ok(bar.angle > angle);
    assert.ok(left!.vy < -80 && right!.vy > 80);
});

test('경사로의 법선 충돌이 구슬을 비스듬히 튕기고 두 출구를 반대편으로 통과시킨다', () => {
    const race = createCaptainRace(1, () => 0.5);
    const ball = race.balls[0]!;
    const [rightExit, leftExit] = race.rails;
    const dx = rightExit!.x2 - rightExit!.x1;
    const dy = rightExit!.y2 - rightExit!.y1;
    const length = Math.hypot(dx, dy);
    const height = rightExit!.r + BALL_RADIUS + 0.05;
    Object.assign(ball, {
        x: rightExit!.x1 + dx / 2 + (dy / length) * height,
        y: rightExit!.y1 + dy / 2 - (dx / length) * height,
        vx: 0,
        vy: 145
    });
    race.step();
    assert.ok(ball.vx > 30 && (ball.vx * dy - ball.vy * dx) / length > 10);
    for (const ramp of [rightExit!, leftExit!]) {
        for (let tick = 0; tick < 12 * 60 && ball.y < ramp.y2; tick++) race.step();
        assert.ok(ball.y >= ramp.y2);
        assert.ok(ramp.x1 < ramp.x2 ? ball.x > ramp.x2 : ball.x < ramp.x2);
    }
});

test('중앙 섬을 양쪽으로 우회한 두 구슬은 아래쪽 합류구를 지난다', () => {
    const race = createCaptainRace(2, () => 0.5);
    for (const [i, ball] of race.balls.entries()) {
        Object.assign(ball, { x: i === 0 ? 145 : 209, y: 746, vx: 0, vy: 85 });
    }
    const split = [false, false];
    const merged = [false, false];
    for (let tick = 0; tick < 12 * 60 && !merged.every(Boolean); tick++) {
        race.step();
        for (const [i, ball] of race.balls.entries()) {
            const edge = race.rails[2 + i]!;
            if (!split[i] && ball.y >= edge.y2) {
                assert.ok(i === 0 ? ball.x < edge.x2 : ball.x > edge.x2);
                split[i] = true;
            }
            if (!merged[i] && ball.y >= race.rails[4]!.y2) {
                assert.ok(ball.x > race.rails[4]!.x2 && ball.x < race.rails[5]!.x2);
                merged[i] = true;
            }
        }
    }
    assert.ok(split.every(Boolean) && merged.every(Boolean));
});

test('발사 범퍼와 외벽이 실제 충돌한 구슬을 튕긴다', () => {
    const race = createCaptainRace(2, () => 0.5);
    const peg = race.pegs.find((peg) => peg.r >= 9)!;
    const [onPeg, atWall] = race.balls;
    Object.assign(onPeg!, { x: peg.x, y: peg.y - peg.r - BALL_RADIUS - 0.05, vy: 105 });
    atWall!.x = 8 + BALL_RADIUS + 0.1;
    atWall!.vx = -24;
    race.step();
    assert.ok(peg.impact > 0.9 && onPeg!.vy < -100);
    const peak = onPeg!.y;
    const wall = atWall!.x;
    race.step();
    assert.ok(onPeg!.y < peak);
    assert.ok(onPeg!.x !== peg.x);
    assert.ok(peg.impact < 1);
    assert.ok(atWall!.x > wall);
});

test('핀 꼭대기의 완전 평형도 장애물 수납 후에는 직접 굴러 결승선을 통과한다', () => {
    const race = createCaptainRace(1, () => 0.5);
    const ball = race.balls[0]!;
    const pin = race.pegs.find((peg) => peg.r < 9)!;
    Object.assign(ball, { x: pin.x, y: pin.y - pin.r - BALL_RADIUS, vx: 0, vy: 0 });
    for (let i = 0; i < 48 * 60 - 1; i++) race.step();
    assert.equal(ball.x, pin.x);
    assert.ok(race.pegs.length && race.rails.length && race.sweepers.length);
    race.step();
    assert.deepEqual(race.pegs, []);
    assert.deepEqual(race.rails, []);
    assert.deepEqual(race.sweepers, []);
    assert.deepEqual(race.finishOrder, []);
    assert.ok(ball.y < pin.y);
    for (let i = 0; i < 12 * 60 && !ball.finished; i++) race.step();
    assert.deepEqual(race.finishOrder, [0]);
    assert.equal(ball.y, FINISH_Y);
});

test('같은 스텝에서는 통과 시각이 먼저이며 정확한 동률도 후보 입력순으로 결정하지 않는다', () => {
    const race = createCaptainRace(3, () => 0);
    race.balls[0]!.y = FINISH_Y - 0.2;
    race.balls[1]!.y = race.balls[2]!.y = FINISH_Y - 0.1;
    race.step();
    assert.deepEqual(race.finishOrder, [2, 1, 0]);
});
