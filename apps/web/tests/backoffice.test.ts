import assert from 'node:assert/strict';
import test from 'node:test';
import { botCheck, databaseCheck } from '../src/lib/features/backoffice/status.ts';

test('데이터베이스 상태는 설정·실패·응답 시간으로 나뉜다', () => {
	assert.equal(databaseCheck({ ok: false, reason: 'unconfigured' }).state, 'unconfigured');
	assert.equal(databaseCheck({ ok: false, reason: 'timeout' }).issue, '응답 시간이 초과됐어요');
	assert.equal(databaseCheck({ ok: false, reason: 'error' }).state, 'down');
	assert.deepEqual(databaseCheck({ ok: true, value: null, latencyMs: 12 }), {
		key: 'database', name: '데이터베이스', state: 'normal', detail: '응답 12ms', issue: null
	});
	assert.equal(databaseCheck({ ok: true, value: null, latencyMs: 900 }).state, 'delayed');
});

test('봇은 게이트웨이에 연결돼야 정상이다', () => {
	assert.equal(botCheck({ ok: false, reason: 'unconfigured' }).state, 'unconfigured');
	assert.equal(botCheck({ ok: true, value: 'oops', latencyMs: 3 }).issue, '상태 응답을 읽을 수 없어요');
	assert.equal(botCheck({ ok: true, value: { ready: false, pingMs: null, guildCount: null }, latencyMs: 3 }).state, 'down');
	const normal = botCheck({ ok: true, value: { ready: true, pingMs: 45, guildCount: 3 }, latencyMs: 3 });
	assert.equal(normal.state, 'normal');
	assert.equal(normal.detail, '서버 3개 · Discord 지연 45ms');
	// 첫 heartbeat 전에는 지연 값이 없다.
	assert.equal(botCheck({ ok: true, value: { ready: true, pingMs: null, guildCount: 2 }, latencyMs: 3 }).detail, '서버 2개');
	assert.equal(botCheck({ ok: true, value: { ready: true, pingMs: 1500, guildCount: 2 }, latencyMs: 3 }).state, 'delayed');
});
