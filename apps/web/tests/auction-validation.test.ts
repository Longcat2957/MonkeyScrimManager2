import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { auctionPoints, auctionSetup } from '../src/lib/server/scrims/auction.ts';
import { DomainError } from '../src/lib/server/errors.ts';

test('경매 포인트는 PostgreSQL integer 범위의 정수이며 0점 낙찰과 시작 예산을 구분한다', () => {
	assert.equal(auctionPoints(0, 0), 0);
	assert.equal(auctionPoints(2_147_483_647, 1), 2_147_483_647);
	for (const value of [-1, 0.1, Infinity, NaN, 2_147_483_648, '1', null]) assert.throws(() => auctionPoints(value, 0), DomainError);
	assert.throws(() => auctionPoints(0, 1), DomainError);
});

test('부분 팀장 저장을 허용하고 중복 팀장·잘못된 JSON 구조를 거부한다', () => {
	const captainId = randomUUID();
	assert.deepEqual(auctionSetup([{ captainId, startPoints: 1000 }, { captainId: null, startPoints: 200 }]), [{ captainId, startPoints: 1000 }, { captainId: null, startPoints: 200 }]);
	for (const value of [null, {}, [], [null, {}], [{ captainId, startPoints: 1 }, { captainId, startPoints: 2 }], [{ captainId: 'other', startPoints: 1 }, { captainId: null, startPoints: 1 }]]) {
		assert.throws(() => auctionSetup(value), DomainError);
	}
});
