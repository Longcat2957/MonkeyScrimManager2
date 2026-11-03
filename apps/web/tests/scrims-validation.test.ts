import assert from 'node:assert/strict';
import test from 'node:test';
import { DomainError } from '../src/lib/server/errors.ts';
import { assertCapacity, assertEditableSettings, assertRevision, parseScrimSettings, promotionIds, requireRecruitment, requireRevision, requireUuid, validateRegistration, validateSelection, validateSettings, type ActiveRegistration } from '../src/lib/server/scrims/validation.ts';

const settings = { title: '정기 내전', scheduledAt: null, teamCount: 2, reserveCapacity: 2, hardFearless: false };
const accountId = 'c74f920e-5ca5-45cb-9b01-0a60f5ab8279';
const registration = (id: string, status: ActiveRegistration['status'], minute = 0): ActiveRegistration => ({ id, status, joinedAt: new Date(Date.UTC(2026, 10, 3, 0, minute)) });
const errorCode = (code: DomainError['code']) => (error: unknown) => error instanceof DomainError && error.code === code;

test('한국 일정은 실제 달력 날짜를 검증하고 UTC로 저장한다', () => {
	const input = { title: ' 정기 내전 ', date: '2028-02-29', time: '20:30', teamCount: 2, reserveCapacity: 0, hardFearless: true };
	assert.deepEqual(parseScrimSettings(input), { title: '정기 내전', scheduledAt: '2028-02-29T11:30:00.000Z', teamCount: 2, reserveCapacity: 0, hardFearless: true });
	for (const date of ['2027-02-29', '2026-02-30', '2026-13-01', '2026-00-01', '2026-04-31']) {
		assert.throws(() => parseScrimSettings({ ...input, date }), errorCode('INVALID_INPUT'));
	}
	assert.throws(() => parseScrimSettings({ ...input, time: '24:00' }), errorCode('INVALID_INPUT'));
	assert.throws(() => parseScrimSettings({ ...input, date: '' }), errorCode('INVALID_INPUT'));
	assert.equal(parseScrimSettings({ ...input, date: '', time: '' }).scheduledAt, null);
});

test('서버 설정은 팀 수와 전체 정원 범위 및 허용 값만 받는다', () => {
	assert.deepEqual(validateSettings({ ...settings, title: ' 정기 내전 ' }), settings);
	for (const teamCount of [1, 5, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) assert.throws(() => validateSettings({ ...settings, teamCount }), errorCode('INVALID_INPUT'));
	for (const reserveCapacity of [-1, 11, 0.5]) assert.throws(() => validateSettings({ ...settings, reserveCapacity }), errorCode('INVALID_INPUT'));
	assert.throws(() => validateSettings({ ...settings, title: ' '.repeat(10) }), errorCode('INVALID_INPUT'));
	assert.throws(() => validateSettings({ ...settings, title: '가'.repeat(51) }), errorCode('INVALID_INPUT'));
	assert.throws(() => validateSettings({ ...settings, scheduledAt: '2026-02-30T00:00:00.000Z' }), errorCode('INVALID_INPUT'));
});

test('신청은 유효한 계정 ID와 중복 없는 희망 포지션 1~5개만 받는다', () => {
	assert.deepEqual(validateRegistration({ riotAccountId: accountId, positions: ['mid', 'top'] }), { riotAccountId: accountId, positions: ['mid', 'top'] });
	assert.throws(() => validateRegistration({ riotAccountId: accountId, positions: [] }), errorCode('INVALID_INPUT'));
	assert.throws(() => validateRegistration({ riotAccountId: accountId, positions: ['mid', 'mid'] }), errorCode('INVALID_INPUT'));
	assert.throws(() => validateRegistration({ riotAccountId: 'other-account', positions: ['mid'] }), errorCode('INVALID_INPUT'));
	assert.throws(() => validateRegistration({ riotAccountId: accountId, positions: ['unknown' as 'mid'] }), errorCode('INVALID_INPUT'));
});

test('정원 축소는 선발 수와 대기를 포함한 전체 신청 수를 모두 검사한다', () => {
	const selected = Array.from({ length: 10 }, (_, index) => registration(String(index), 'selected'));
	const active = [...selected, registration('waiting-1', 'standby'), registration('waiting-2', 'standby')];
	assert.doesNotThrow(() => assertCapacity(settings, active));
	assert.throws(() => assertCapacity({ ...settings, reserveCapacity: 1 }, active), errorCode('CONFLICT'));
	assert.throws(() => assertCapacity(settings, [...selected, registration('selected-11', 'selected')]), errorCode('CONFLICT'));
	assert.doesNotThrow(() => assertCapacity(settings, [...active, registration('old-withdrawal', 'withdrawn'), registration('old-exclusion', 'excluded')]));
});

test('빈 선발 자리는 신청 시각과 ID 순서로 승급하고 철회·제외 이력은 건드리지 않는다', () => {
	const selected = Array.from({ length: 8 }, (_, index) => registration(String(index), 'selected'));
	const waiting = [registration('z', 'standby', 5), registration('b', 'standby', 2), registration('a', 'standby', 2)];
	assert.deepEqual(promotionIds(2, [...selected, ...waiting, registration('excluded', 'excluded'), registration('withdrawn', 'withdrawn')]), ['a', 'b']);
	assert.deepEqual(promotionIds(2, [...selected, registration('9', 'selected'), registration('10', 'selected'), ...waiting]), []);
	assert.deepEqual(waiting.map((row) => row.id), ['z', 'b', 'a']);
});

test('단계별 허용 설정은 모집·편성·경기 시작·종료에 따라 제한한다', () => {
	assert.doesNotThrow(() => assertEditableSettings('recruit', settings, { ...settings, teamCount: 4 }));
	assert.doesNotThrow(() => assertEditableSettings('preparing', settings, { ...settings, hardFearless: true }));
	assert.throws(() => assertEditableSettings('preparing', settings, { ...settings, teamCount: 3 }), errorCode('CONFLICT'));
	assert.throws(() => assertEditableSettings('ready', settings, { ...settings, reserveCapacity: 5 }), errorCode('CONFLICT'));
	assert.throws(() => assertEditableSettings('in_progress', settings, { ...settings, hardFearless: true }), errorCode('CONFLICT'));
	assert.doesNotThrow(() => assertEditableSettings('in_progress', settings, { ...settings, title: '새 제목' }));
	for (const status of ['completed', 'ended_early', 'cancelled'] as const) assert.throws(() => assertEditableSettings(status, settings, settings), errorCode('CONFLICT'));
});

test('신청·정원 조작은 모집 단계만 허용한다', () => {
	assert.doesNotThrow(() => requireRecruitment('recruit'));
	for (const status of ['preparing', 'ready', 'in_progress', 'completed', 'ended_early', 'cancelled'] as const) assert.throws(() => requireRecruitment(status), errorCode('CONFLICT'));
});

test('동시 변경 revision과 일괄 신청 ID의 형식·중복·크기를 검사한다', () => {
	assert.equal(requireRevision(0), 0);
	assert.doesNotThrow(() => assertRevision(3, 3));
	assert.throws(() => assertRevision(3, 2), errorCode('CONFLICT'));
	for (const value of [-1, 0.5, '3', Number.NaN, 2_147_483_647]) assert.throws(() => requireRevision(value), errorCode('INVALID_INPUT'));
	assert.equal(requireUuid(accountId), accountId);
	assert.deepEqual(validateSelection([accountId], 'excluded'), { registrationIds: [accountId], status: 'excluded' });
	assert.throws(() => validateSelection([], 'selected'), errorCode('INVALID_INPUT'));
	assert.throws(() => validateSelection([accountId, accountId], 'selected'), errorCode('INVALID_INPUT'));
	assert.throws(() => validateSelection([accountId], 'withdrawn'), errorCode('INVALID_INPUT'));
});
