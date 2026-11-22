import { BALL_RADIUS } from './captain-pinball.ts';

type Runner = { x: number; y: number; finished: boolean };

export const LABEL_HEIGHT = 17;
const GAP = LABEL_HEIGHT + 3;
const VIEW_HEIGHT = 300;
const EDGE = 20;

// 출발할 때 정한 열과 이웃 순서를 유지해 충돌 때마다 이름표가 서로 자리를 빼앗지 않는다.
export function createPinballLabels(balls: readonly Runner[]) {
    const columns = balls.length <= 10 ? 2 : 3;
    const pitchX = 360 / columns;
    const width = pitchX - 6;
    const labels = balls.map(() => ({ x: 0, y: 0, opacity: 1 }));
    const order = balls.map((_, i) => i).sort((a, b) => balls[a]!.x - balls[b]!.x);
    const lanes = Array.from({ length: columns }, (_, col) => {
        const lane = order.slice(
            Math.floor((col * order.length) / columns),
            Math.floor(((col + 1) * order.length) / columns)
        );
        lane.sort((a, b) => balls[a]!.y - balls[b]!.y);
        for (const i of lane) labels[i]!.x = col * pitchX + 3;
        return lane;
    });
    const groups = balls.map(() => ({ end: 0, weight: 0, center: 0 }));
    let previous: number | undefined;

    const launchFloor = balls.reduce((y, ball) => Math.max(y, ball.y + BALL_RADIUS + 3), 2);
    function place(top: number, now: number) {
        const initial = previous === undefined;
        const blend = initial ? 1 : -Math.expm1(-Math.min(64, Math.max(0, now - previous!)) / 145);
        previous = now;
        for (const lane of lanes) {
            let count = 0;
            for (let row = 0; row < lane.length; row++) {
                const i = lane[row]!;
                const ball = balls[i]!;
                const label = labels[i]!;
                const y = ball.y - top;
                const visibility = ball.finished
                    ? 0
                    : Math.max(0, Math.min(1, 1 + Math.min(y, VIEW_HEIGHT - y) / EDGE));
                label.opacity += (visibility - label.opacity) * blend;
                if (label.opacity < 0.005 && !visibility) label.opacity = 0;

                // 간격을 뺀 좌표가 역전된 이웃만 합쳐 양쪽이 가까운 자리를 나눠 쓴다.
                const group = groups[count++]!;
                group.end = row;
                group.center = Math.max(0, Math.min(VIEW_HEIGHT, y)) + BALL_RADIUS + 5 - row * GAP;
                group.weight = Math.max(0.001, label.opacity);
                while (count > 1) {
                    const last = groups[count - 1]!;
                    const prev = groups[count - 2]!;
                    if (prev.center <= last.center) break;
                    prev.weight += last.weight;
                    prev.center += ((last.center - prev.center) * last.weight) / prev.weight;
                    prev.end = last.end;
                    count--;
                }
            }
            const bottom = VIEW_HEIGHT - LABEL_HEIGHT - 2 - (lane.length - 1) * GAP;
            let row = 0;
            for (let j = 0; j < count; j++) {
                const group = groups[j]!;
                const start = Math.min(bottom, Math.max(initial ? launchFloor : 2, group.center));
                for (; row <= group.end; row++) {
                    const label = labels[lane[row]!]!;
                    label.y += (start + row * GAP - label.y) * blend;
                }
            }
        }
    }
    place(0, 0);
    return { labels, width, place };
}
