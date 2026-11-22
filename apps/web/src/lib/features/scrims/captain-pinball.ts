export const BALL_RADIUS = 7;
export const FINISH_Y = 2360;

const LEFT = 8 + BALL_RADIUS;
const RIGHT = 360 - LEFT;
const DT = 1 / 120;
const BOOST_TICKS = 144; // 1.2초
const DIAMETER = 2 * BALL_RADIUS;
// 접촉점에 눈에 보이지 않는 여유를 둬서 밀집한 구슬도 다음 반복에서 분리된다.
const CLEARANCE = 0.015;

type Ball = {
    x: number;
    y: number;
    previousX: number;
    previousY: number;
    vx: number;
    vy: number;
    side: number;
    finished: boolean;
};

function hitPair(a: Ball, b: Ball, i: number, j: number, firstPass: boolean) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const squared = dx * dx + dy * dy;
    if (squared >= DIAMETER * DIAMETER) return false;
    const distance = Math.sqrt(squared);
    let nx: number;
    let ny: number;
    const sameStart = firstPass && a.previousX === b.previousX && a.previousY === b.previousY;
    if (distance < 1e-8 || (sameStart && (a.vx !== b.vx || a.vy !== b.vy))) {
        // 중심이 겹친 채 접근하면 적분 후에는 이미 자리를 바꿨으므로 속도로 법선을 복원한다.
        const speed = Math.hypot(a.vx - b.vx, a.vy - b.vy);
        nx = speed ? (a.vx - b.vx) / speed : Math.cos(i * 2.4 + j * 1.62);
        ny = speed ? (a.vy - b.vy) / speed : Math.sin(i * 2.4 + j * 1.62);
    } else {
        nx = dx / distance;
        ny = dy / distance;
    }
    const correction = (DIAMETER + CLEARANCE - (dx * nx + dy * ny)) * 0.55;
    a.x -= correction * nx;
    a.y -= correction * ny;
    b.x += correction * nx;
    b.y += correction * ny;
    const approach = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (approach < 0) {
        const impulse = -0.94 * approach;
        a.vx -= impulse * nx;
        a.vy -= impulse * ny;
        b.vx += impulse * nx;
        b.vy += impulse * ny;
    }
    return true;
}

function hitObstacle(
    ball: Ball,
    x: number,
    y: number,
    r: number,
    kick: boolean,
    vx = 0,
    vy = 0,
    bounce = 0.67
) {
    const dx = ball.x - x;
    const dy = ball.y - y;
    const radius = r + BALL_RADIUS;
    const squared = dx * dx + dy * dy;
    if (squared >= radius * radius) return false;
    const distance = Math.sqrt(squared);
    const nx = distance ? dx / distance : 0;
    const ny = distance ? dy / distance : -1;
    ball.x = x + nx * (radius + CLEARANCE);
    ball.y = y + ny * (radius + CLEARANCE);
    const approach = (ball.vx - vx) * nx + (ball.vy - vy) * ny;
    if (approach < 0) {
        const impulse = kick ? 56 - 1.84 * approach : -(1 + bounce) * approach;
        ball.vx += impulse * nx;
        ball.vy += impulse * ny;
        // 발사 범퍼 꼭대기에서도 같은 지점으로 계속 튀지 않게 옆으로 찬다.
        if (kick && ny < -0.96 && Math.abs(ball.vx) < 44) {
            ball.vx = (Math.sign(nx) || ball.side) * 58;
        }
    }
    return true;
}

export function createCaptainRace(count: number, random = Math.random) {
    if (!Number.isInteger(count) || count < 0 || count > 20) {
        throw new RangeError('구슬 개수는 0개 이상 20개 이하의 정수여야 합니다.');
    }

    const lanes = Array.from({ length: count }, (_, i) => i);
    for (let i = count - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [lanes[i], lanes[j]] = [lanes[j]!, lanes[i]!];
    }
    const spread = (RIGHT - LEFT) / Math.max(1, count);
    const byLane = lanes.map((_, i) => ({
        x: LEFT + spread * (i + 0.5) + (random() - 0.5) * (spread - DIAMETER),
        y: 12 + random() * 23,
        previousX: 0,
        previousY: 0,
        vx: (random() - 0.5) * 92,
        vy: 12 + random() * 83,
        finished: false,
        boostAtY: 0,
        boostEndTick: 0,
        boostRemaining: 0,
        side: random() < 0.5 ? -1 : 1
    }));
    const balls = lanes.map((lane) => byLane[lane]!);

    const offset = (range: number) => (random() * 2 - 1) * range;
    const peg = (x: number, y: number, r: number) => ({ x: x + offset(11), y: y + offset(6), r, impact: 0 });
    // 회전문 진입, 섬 입구와 합류점, 하단 회전봉, 마지막 스프린트에 반동 구간을 둔다.
    const pegs = [
        peg(175, 78, 14),
        peg(66, 115, 9),
        peg(280, 131, 11),
        peg(68, 682, 6),
        peg(178, 693, 13),
        peg(278, 690, 10),
        peg(103, 980, 12),
        peg(242, 970, 9),
        peg(84, 1420, 13),
        peg(294, 1528, 10),
        peg(170, 1560, 13),
        peg(107, 2180, 15),
        peg(242, 2240, 12),
        peg(179, 2282, 6)
    ];
    const rotor = (x: number, y: number, length: number, omega: number) => ({
        x: x + offset(8),
        y,
        length,
        r: 5,
        angle: offset(Math.PI),
        omega: omega * (1 + offset(0.16)),
        ux: 0,
        uy: 0
    });
    // length는 중심에서 끝까지의 거리다.
    const sweepers = [
        rotor(95, 220, 51, 1.95),
        rotor(263, 220, 53, -2.05),
        rotor(177, 1478, 69, 2.2),
        rotor(62, 1920, 35, -2.5),
        rotor(290, 1920, 38, 2.3)
    ];
    const rail = (x1: number, y1: number, x2: number, y2: number, r = 6) => {
        const dx = x2 - x1;
        const dy = y2 - y1;
        return { x1, y1, x2, y2, r, dx, dy, inverseLengthSquared: 1 / (dx * dx + dy * dy) };
    };
    // 벽 바깥에서 시작하는 경사로는 옆으로 지나야 한다. 섬에서는 갈라진 두 길이 다시 만난다.
    const gap = 86 + offset(9);
    const rails = [
        rail(0, 310, 360 - gap, 419),
        rail(360, 505, gap, 623),
        rail(178, 740, 86, 814),
        rail(178, 740, 266, 810),
        rail(0, 854, 133, 921),
        rail(360, 859, 222, 920),
        rail(360, 1035, gap + 5, 1150),
        rail(0, 1238, 360 - gap + 3, 1352),
        rail(0, 1610, 360 - gap - 4, 1726),
        rail(202, 1786, 105, 1855),
        rail(202, 1786, 270, 1845),
        rail(360, 1994, gap - 3, 2120)
    ];
    for (const ball of byLane) ball.boostAtY = FINISH_Y * (0.35 + random() * 0.3);
    const finishOrder: number[] = [];
    const crossings: { index: number; time: number }[] = [];
    let ticks = 0;

    function advance() {
        // 제한 시간이 지나면 장애물만 수납한다. 남은 구슬도 직접 굴러서 통과해야 한다.
        if (++ticks === 48 * 120) {
            pegs.length = 0;
            sweepers.length = 0;
            rails.length = 0;
        }
        for (const peg of pegs) peg.impact = Math.max(0, peg.impact - DT / 0.18);
        for (const bar of sweepers) {
            bar.angle += bar.omega * DT;
            bar.ux = Math.cos(bar.angle);
            bar.uy = Math.sin(bar.angle);
        }
        for (const ball of balls) {
            if (ball.finished) continue;
            ball.previousX = ball.x;
            ball.previousY = ball.y;
            if (!ball.boostEndTick && ball.y >= ball.boostAtY) {
                ball.boostEndTick = ticks + BOOST_TICKS - 1;
            }
            const boosting = ticks <= ball.boostEndTick;
            if (boosting) ball.boostRemaining = (ball.boostEndTick - ticks) * DT;
            ball.vx = Math.max(-300, Math.min(300, ball.vx * 0.999));
            ball.vy = Math.max(-320, Math.min(boosting ? 235 : 177, ball.vy + (boosting ? 620 : 365) * DT));
            ball.x += ball.vx * DT;
            ball.y += ball.vy * DT;
        }
        // 앞선 접촉 보정이 이웃을 벽이나 다른 구슬로 밀 수 있으므로 함께 수렴시킨다.
        for (let pass = 0; pass < 256; pass++) {
            let touched = false;
            for (let i = 0; i < count; i++) {
                const ball = byLane[i]!;
                if (ball.finished) continue;
                if (ball.x < LEFT || ball.x > RIGHT) {
                    const left = ball.x < LEFT;
                    ball.x = left ? LEFT : RIGHT;
                    if (left ? ball.vx < 0 : ball.vx > 0) ball.vx *= -0.83;
                    touched = true;
                }
                if (ball.y < BALL_RADIUS) {
                    ball.y = BALL_RADIUS;
                    if (ball.vy < 0) ball.vy *= -0.7;
                    touched = true;
                }
                for (const rail of rails) {
                    const radius = rail.r + BALL_RADIUS;
                    if (ball.y <= rail.y1 - radius || ball.y >= rail.y2 + radius) continue;
                    const along =
                        ((ball.x - rail.x1) * rail.dx + (ball.y - rail.y1) * rail.dy) *
                        rail.inverseLengthSquared;
                    const t = Math.max(0, Math.min(1, along));
                    // 경사로는 반발이 작아 구슬이 튀어오른 뒤에도 내리막 접선 방향으로 굴러간다.
                    if (
                        hitObstacle(
                            ball,
                            rail.x1 + t * rail.dx,
                            rail.y1 + t * rail.dy,
                            rail.r,
                            false,
                            0,
                            0,
                            0.2
                        )
                    ) {
                        touched = true;
                    }
                }
                for (const peg of pegs) {
                    if (Math.abs(ball.y - peg.y) >= peg.r + BALL_RADIUS) continue;
                    if (hitObstacle(ball, peg.x, peg.y, peg.r, peg.r >= 9)) {
                        peg.impact = 1;
                        touched = true;
                    }
                }
                for (const bar of sweepers) {
                    if (Math.abs(ball.y - bar.y) >= bar.length + bar.r + BALL_RADIUS) continue;
                    const along = (ball.x - bar.x) * bar.ux + (ball.y - bar.y) * bar.uy;
                    const t = Math.max(-bar.length, Math.min(bar.length, along));
                    const rx = t * bar.ux;
                    const ry = t * bar.uy;
                    if (
                        hitObstacle(
                            ball,
                            bar.x + rx,
                            bar.y + ry,
                            bar.r,
                            false,
                            -bar.omega * ry,
                            bar.omega * rx
                        )
                    ) {
                        touched = true;
                    }
                }
                for (let j = i + 1; j < count; j++) {
                    const other = byLane[j]!;
                    if (!other.finished && hitPair(ball, other, i, j, pass === 0)) touched = true;
                }
            }
            if (!touched) break;
        }
        crossings.length = 0;
        for (let index = 0; index < count; index++) {
            const ball = balls[index]!;
            if (ball.finished || ball.y < FINISH_Y) continue;
            const time = (FINISH_Y - ball.previousY) / (ball.y - ball.previousY);
            ball.x = ball.previousX + time * (ball.x - ball.previousX);
            ball.y = FINISH_Y;
            ball.finished = true;
            ball.boostRemaining = 0;
            crossings.push({ index, time });
        }
        // 같은 순간의 통과만 무작위 배정된 출발 칸으로 판정한다.
        crossings.sort((a, b) => a.time - b.time || lanes[a.index]! - lanes[b.index]!);
        for (const crossing of crossings) finishOrder.push(crossing.index);
    }

    function step() {
        advance();
        advance();
    }

    return { balls, pegs, rails, sweepers, finishOrder, step };
}
