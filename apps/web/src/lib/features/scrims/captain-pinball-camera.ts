import { FINISH_Y } from './captain-pinball.ts';

type Runner = { x: number; y: number; finished: boolean };
export type CameraShot = 'pack' | 'battle' | 'rear' | 'finish' | 'follow';

const PAN_SPEED = 680;
const EASING = 6;

export class PinballCamera {
    shot: CameraShot = 'pack';
    top = 0;
    first = -1;
    second = -1;
    private remaining = 2.8;
    private lastTime: number | undefined;
    private readonly balls: readonly Runner[];
    private readonly maxTop: number;

    constructor(balls: readonly Runner[], maxTop: number) {
        this.balls = balls;
        this.maxTop = maxTop;
    }

    // 순위 차가 작고 같은 화면에 잡히는 두 구슬을 고른다. 비슷한 접전은 다른 조에 양보한다.
    private pickBattle(trailer: number) {
        let best = Infinity;
        let first = -1;
        let second = -1;
        for (let i = 0; i < this.balls.length; i++) {
            const a = this.balls[i]!;
            if (a.finished) continue;
            for (let j = i + 1; j < this.balls.length; j++) {
                const b = this.balls[j]!;
                const gap = Math.abs(a.y - b.y);
                const middle = (a.y + b.y) / 2;
                if (b.finished || gap > 88 || Math.abs(middle - (this.top + 150)) > 620) continue;
                const previous =
                    i === this.first || i === this.second || j === this.first || j === this.second;
                const score =
                    gap +
                    Math.abs(a.x - b.x) * 0.12 +
                    (previous ? 90 : 0) +
                    (i === trailer || j === trailer ? 65 : 0);
                if (score >= best) continue;
                best = score;
                first = i;
                second = j;
            }
        }
        if (first < 0) return false;
        this.first = first;
        this.second = second;
        return true;
    }

    frame(trailer: number, follow: number | undefined, now: number) {
        const dt = Math.max(0, Math.min(0.1, (now - (this.lastTime ?? now)) / 1000));
        this.lastTime = now;
        this.remaining -= dt;
        const rear = this.balls[trailer];
        if (!rear) return this.top;
        const watched = follow === undefined ? undefined : this.balls[follow];
        let center = rear.y;
        if (watched && !watched.finished) {
            this.shot = 'follow';
            center = watched.y;
        } else if (rear.y >= FINISH_Y - (this.shot === 'finish' ? 255 : 210)) {
            this.shot = 'finish';
            center = FINISH_Y;
        } else {
            const a = this.balls[this.first]!;
            const b = this.balls[this.second]!;
            const split = this.shot === 'battle' && (a.finished || b.finished || Math.abs(a.y - b.y) > 180);
            if (rear.y >= FINISH_Y - 480 || this.shot === 'finish' || this.shot === 'follow' || split) {
                this.shot = 'rear';
                this.remaining = 3;
            } else if (this.remaining <= 0) {
                this.shot = this.shot !== 'battle' && this.pickBattle(trailer) ? 'battle' : 'rear';
                this.remaining = this.shot === 'battle' ? 4 : 3;
            }
            if (this.shot === 'battle') {
                center = (this.balls[this.first]!.y + this.balls[this.second]!.y) / 2;
            } else {
                // 출발은 대열 전체, 후미는 가장 뒤의 구슬과 같은 화면에 들어오는 경쟁자를 잡는다.
                let ahead = rear.y;
                for (let i = 0; i < this.balls.length; i++) {
                    const ball = this.balls[i]!;
                    if (!ball.finished && (this.shot === 'pack' || ball.y <= rear.y + 128)) {
                        ahead = Math.max(ahead, ball.y);
                    }
                }
                center = (ahead + rear.y) / 2;
            }
        }
        const target = Math.max(0, Math.min(this.maxTop, center - 130));
        const delta = target - this.top;
        const distance = Math.abs(delta);
        // 한 프레임 안에서 정속 구간이 끝나도 남은 시간만큼 정확히 감속한다.
        const cruise = Math.min(dt, Math.max(0, (distance - PAN_SPEED / EASING) / PAN_SPEED));
        const covered = cruise * PAN_SPEED;
        const pan = covered + (distance - covered) * -Math.expm1(-EASING * (dt - cruise));
        this.top += Math.sign(delta) * pan;
        return this.top;
    }
}
