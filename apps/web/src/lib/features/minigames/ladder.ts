export interface Ladder {
    rungs: number[];
    traces: { output: number; path: string }[];
}

const word = new Uint32Array(1);
function randomInt(limit: number): number {
    const ceiling = 2 ** 32 - (2 ** 32 % limit);
    let value: number;
    do value = crypto.getRandomValues(word)[0];
    while (value >= ceiling);
    return value % limit;
}

export const laneX = (column: number, count: number) => ((column + 0.5) * 600) / count;
export const rungY = (row: number, count: number) => ((row + 1) * 220) / (count + 1);

export function traceLane(input: number, columns: number, rungs: readonly number[]) {
    let output = input;
    let path = `M ${laneX(input, columns)} 0`;
    for (const [row, left] of rungs.entries()) {
        if (output !== left && output !== left + 1) continue;
        output = output === left ? left + 1 : left;
        path += ` V ${rungY(row, rungs.length)} H ${laneX(output, columns)}`;
    }
    return { output, path: `${path} V 220` };
}

export function createLadder(columns: number, draw = randomInt): Ladder {
    if (!Number.isInteger(columns) || columns < 2 || columns > 6)
        throw new RangeError('사다리는 2~6칸입니다.');

    // 먼저 모든 이웃 기둥을 한 번씩 이은 뒤, 삽입 셔플로 각 도착 순서의 확률을 같게 한다.
    const rungs = Array.from({ length: columns - 1 }, (_, i) => i);
    for (let i = rungs.length - 1; i > 0; i--) {
        const j = draw(i + 1);
        [rungs[i], rungs[j]] = [rungs[j], rungs[i]];
    }
    for (let i = 1; i < columns; i++) {
        const target = draw(i + 1);
        for (let j = i - 1; j >= target; j--) rungs.push(j);
    }
    return { rungs, traces: Array.from({ length: columns }, (_, input) => traceLane(input, columns, rungs)) };
}
