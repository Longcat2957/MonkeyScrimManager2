import assert from 'node:assert/strict';
import test from 'node:test';
import { activeDestination, type Destination } from '../src/lib/shell/destinations.ts';

const GUILD = '/g/123';

const destinations: Destination[] = [
	{ label: '서버 홈', href: `${GUILD}`, match: GUILD, exact: true },
	{ label: '내전', href: `${GUILD}/scrims`, match: `${GUILD}/scrims` },
	{ label: '팀 편성', href: `${GUILD}/scrims/s1/teams`, match: `${GUILD}/scrims/s1/teams` }
];

test('exact 항목은 같은 경로에서만 활성이다', () => {
	assert.equal(activeDestination(destinations, `${GUILD}`), GUILD);
	assert.equal(activeDestination(destinations, `${GUILD}/scrims`), `${GUILD}/scrims`);
});

test('하위 경로에서는 가장 긴 접두사 하나만 활성이다', () => {
	assert.equal(activeDestination(destinations, `${GUILD}/scrims/s1`), `${GUILD}/scrims`);
	assert.equal(
		activeDestination(destinations, `${GUILD}/scrims/s1/teams/manual`),
		`${GUILD}/scrims/s1/teams`
	);
});

test('접두사가 다른 경로를 닮은 문자열은 일치하지 않는다', () => {
	// /g/1234 는 /g/123 의 하위가 아니다.
	assert.equal(activeDestination(destinations, '/g/1234'), null);
	assert.equal(activeDestination(destinations, '/me'), null);
});

test('일치하는 항목이 없으면 null이다', () => {
	assert.equal(activeDestination([], '/'), null);
});
