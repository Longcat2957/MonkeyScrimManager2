import assert from 'node:assert/strict';
import test from 'node:test';
import { DomainError } from '../src/lib/server/errors.ts';
import { calculateElo, calculateGameMmr, INITIAL_MMR, K_FACTOR, MMR_POSITIONS, type MmrPlayer } from '../src/lib/server/mmr/rules.ts';

const players = (): MmrPlayer[] => (['blue', 'red'] as const).flatMap((side) => MMR_POSITIONS.map((position) => ({ userId: `${side}-${position}`, position, side, mmr: 1500 })));
const conflict = (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT';

test('MSM1 초기값 1500과 K32를 유지하며 같은 점수에서는 16점을 이동한다', () => {
	assert.equal(INITIAL_MMR, 1500);
	assert.equal(K_FACTOR, 32);
	assert.deepEqual(calculateElo(1500, 1500, true), { beforeMmr: 1500, afterMmr: 1516, delta: 16 });
	assert.deepEqual(calculateElo(1500, 1500, false), { beforeMmr: 1500, afterMmr: 1484, delta: -16 });
});

test('동포지션 상대의 반영 전 값으로 계산하며 소수를 반올림하지 않는다', () => {
	const lineup = players();
	lineup[0]!.mmr = 1900;
	lineup[5]!.mmr = 1500;
	const changes = calculateGameMmr(lineup, 'blue');
	const winner = changes.find((row) => row.userId === 'blue-top')!;
	const loser = changes.find((row) => row.userId === 'red-top')!;
	assert.ok(Math.abs(winner.afterMmr - 1902.909090909091) < 1e-10);
	assert.ok(Math.abs(loser.afterMmr - 1497.090909090909) < 1e-10);
	assert.ok(Math.abs(winner.delta + loser.delta) < 1e-10);
	assert.equal(winner.opponentUserId, 'red-top');
	assert.equal(changes.find((row) => row.userId === 'blue-mid')!.afterMmr, 1516);
	assert.equal(lineup[0]!.mmr, 1900);
	assert.equal(calculateGameMmr(players(), 'red').find((row) => row.userId === 'blue-top')!.afterMmr, 1484);
});

test('열 명의 서로 다른 사용자와 양 팀 모든 포지션이 확정되어야 한다', () => {
	assert.throws(() => calculateGameMmr(players().slice(1), 'blue'), conflict);
	const duplicate = players();
	duplicate[9]!.userId = duplicate[0]!.userId;
	assert.throws(() => calculateGameMmr(duplicate, 'blue'), conflict);
	const missingLane = players();
	missingLane[0]!.position = 'mid';
	assert.throws(() => calculateGameMmr(missingLane, 'blue'), conflict);
	const missingValue = players();
	missingValue[0]!.mmr = Number.NaN;
	assert.throws(() => calculateGameMmr(missingValue, 'blue'), conflict);
	assert.throws(() => calculateElo(Infinity, 1500, true), (error: unknown) => error instanceof DomainError && error.code === 'INVALID_INPUT');
});
