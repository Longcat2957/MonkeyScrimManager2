import assert from 'node:assert/strict';
import test from 'node:test';
import type { LolPosition } from '../../../src/lib/features/guild/types.ts';
import type { ScrimSettings, ScrimStatus } from '../../../src/lib/features/scrims/types.ts';
import {
    assertCapacity,
    assertEditableSettings,
    assertRevision,
    parseScrimSettings,
    promotionIds,
    requireRecruitment,
    requireRevision,
    requireUuid,
    validateRegistration,
    validateSelection,
    validateSettings,
    type ActiveRegistration
} from '../../../src/lib/server/scrims/validation.ts';
import { domainError } from '../support/error-assertions.ts';

const accountId = 'c74f920e-5ca5-45cb-9b01-0a60f5ab8279';
const settings: ScrimSettings = {
    title: '정기 내전',
    scheduledAt: null,
    teamCount: 2,
    reserveCapacity: 2,
    hardFearless: false
};
const input = {
    title: ' 정기 내전 ',
    date: '2028-02-29',
    time: '20:30',
    teamCount: 2,
    reserveCapacity: 0,
    hardFearless: true
};
const registration = (id: string, status: ActiveRegistration['status'], minute = 0): ActiveRegistration => ({
    id,
    status,
    joinedAt: new Date(Date.UTC(2026, 10, 3, 0, minute))
});

test('윤년의 한국 일정을 UTC로 변환하며 미정 일정은 null이다', () => {
    assert.deepEqual(parseScrimSettings(input), {
        title: '정기 내전',
        scheduledAt: '2028-02-29T11:30:00.000Z',
        teamCount: 2,
        reserveCapacity: 0,
        hardFearless: true
    });
    assert.equal(parseScrimSettings({ ...input, date: '', time: '' }).scheduledAt, null);
    assert.equal(parseScrimSettings({ ...input, time: '00:00' }).scheduledAt, '2028-02-28T15:00:00.000Z');
});

for (const date of ['2027-02-29', '2026-02-30', '2026-13-01', '2026-00-01', '2026-04-31', '']) {
    test(`실제 달력 검증: ${date || '날짜 누락'}`, () =>
        assert.throws(() => parseScrimSettings({ ...input, date }), domainError('INVALID_INPUT')));
}
for (const time of ['24:00', '20:60', '8:00', '']) {
    test(`24시간 형식 검증: ${time || '시각 누락'}`, () =>
        assert.throws(() => parseScrimSettings({ ...input, time }), domainError('INVALID_INPUT')));
}

for (const [name, change] of [
    ['팀 1개', { teamCount: 1 }],
    ['팀 5개', { teamCount: 5 }],
    ['소수 팀', { teamCount: 2.5 }],
    ['NaN 팀', { teamCount: NaN }],
    ['무한 팀', { teamCount: Infinity }],
    ['음수 대기', { reserveCapacity: -1 }],
    ['대기 초과', { reserveCapacity: 11 }],
    ['소수 대기', { reserveCapacity: 0.5 }],
    ['빈 제목', { title: '   ' }],
    ['긴 제목', { title: '가'.repeat(51) }],
    ['잘못된 UTC 날짜', { scheduledAt: '2026-02-30T00:00:00.000Z' }],
    ['현지 시각 문자열', { scheduledAt: '2026-11-03T00:00:00+09:00' }],
    ['잘못된 피어리스', { hardFearless: 'true' as unknown as boolean }]
] as const) {
    test(`모집 설정 거절: ${name}`, () =>
        assert.throws(() => validateSettings({ ...settings, ...change }), domainError('INVALID_INPUT')));
}

test('모집 설정 경계값과 반환 필드를 정규화한다', () => {
    assert.deepEqual(validateSettings({ ...settings, title: ' 정기 내전 ' }), settings);
    assert.equal(
        validateSettings({ ...settings, title: '가'.repeat(50), teamCount: 4, reserveCapacity: 10 }).title
            .length,
        50
    );
});

for (const positions of [
    [],
    ['mid', 'mid'],
    ['unknown'],
    ['top', 'jungle', 'mid', 'bot', 'support', 'top']
]) {
    test(`희망 포지션 거절: ${positions.join(',') || '없음'}`, () =>
        assert.throws(
            () => validateRegistration({ riotAccountId: accountId, positions: positions as LolPosition[] }),
            domainError('INVALID_INPUT')
        ));
}

test('희망 포지션의 사용자 순서를 유지하되 입력 배열을 공유하지 않는다', () => {
    const positions = ['mid', 'top'] as const;
    const result = validateRegistration({ riotAccountId: accountId, positions });
    assert.deepEqual(result, { riotAccountId: accountId, positions: ['mid', 'top'] });
    assert.notEqual(result.positions, positions);
    assert.throws(
        () => validateRegistration({ riotAccountId: 'invalid', positions }),
        domainError('INVALID_INPUT')
    );
});

test('정원은 선발과 전체 활성 신청을 각각 제한하고 철회·제외 이력은 제외한다', () => {
    const selected = Array.from({ length: 10 }, (_, index) => registration(String(index), 'selected'));
    const active = [...selected, registration('a', 'standby'), registration('b', 'standby')];
    assert.doesNotThrow(() =>
        assertCapacity(settings, [
            ...active,
            registration('old', 'withdrawn'),
            registration('excluded', 'excluded')
        ])
    );
    assert.throws(() => assertCapacity({ ...settings, reserveCapacity: 1 }, active), domainError('CONFLICT'));
    assert.throws(
        () => assertCapacity(settings, [...selected, registration('extra', 'selected')]),
        domainError('CONFLICT')
    );
});

test('승급은 신청 시각·ID 순서로 빈 자리만 채우고 원본 순서를 변경하지 않는다', () => {
    const selected = Array.from({ length: 8 }, (_, index) => registration(String(index), 'selected'));
    const waiting = [
        registration('z', 'standby', 5),
        registration('b', 'standby', 2),
        registration('a', 'standby', 2)
    ];
    assert.deepEqual(
        promotionIds(2, [
            ...selected,
            ...waiting,
            registration('old', 'withdrawn'),
            registration('excluded', 'excluded')
        ]),
        ['a', 'b']
    );
    assert.deepEqual(
        promotionIds(2, [
            ...selected,
            registration('8', 'selected'),
            registration('9', 'selected'),
            ...waiting
        ]),
        []
    );
    assert.deepEqual(
        waiting.map((row) => row.id),
        ['z', 'b', 'a']
    );
});

for (const [status, change, allowed] of [
    ['recruit', { teamCount: 4 }, true],
    ['preparing', { hardFearless: true }, true],
    ['preparing', { teamCount: 3 }, false],
    ['ready', { reserveCapacity: 5 }, false],
    ['in_progress', { hardFearless: true }, false],
    ['in_progress', { title: '새 제목' }, true],
    ['completed', {}, false],
    ['ended_early', {}, false],
    ['cancelled', {}, false]
] as const) {
    test(`${status} 설정 변경 ${JSON.stringify(change)}`, () => {
        const operation = () => assertEditableSettings(status, settings, { ...settings, ...change });
        if (allowed) assert.doesNotThrow(operation);
        else assert.throws(operation, domainError('CONFLICT'));
    });
}

for (const status of [
    'recruit',
    'preparing',
    'ready',
    'in_progress',
    'completed',
    'ended_early',
    'cancelled'
] satisfies ScrimStatus[]) {
    test(`${status} 단계의 신청 허용 여부`, () => {
        if (status === 'recruit') assert.doesNotThrow(() => requireRecruitment(status));
        else assert.throws(() => requireRecruitment(status), domainError('CONFLICT'));
    });
}

for (const value of [-1, 0.5, '3', NaN, 2_147_483_647]) {
    test(`revision 입력 거절: ${String(value)}`, () =>
        assert.throws(() => requireRevision(value), domainError('INVALID_INPUT')));
}

test('revision 범위와 낡은 요청을 구분한다', () => {
    assert.equal(requireRevision(0), 0);
    assert.equal(requireRevision(2_147_483_646), 2_147_483_646);
    assert.doesNotThrow(() => assertRevision(3, 3));
    assert.throws(() => assertRevision(3, 2), domainError('CONFLICT'));
    assert.equal(requireUuid(accountId), accountId);
});

test('일괄 선발은 최대 30개의 서로 다른 신청만 받는다', () => {
    const ids = Array.from(
        { length: 31 },
        (_, index) => `c74f920e-5ca5-45cb-9b01-${String(index).padStart(12, '0')}`
    );
    assert.equal(validateSelection(ids.slice(0, 30), 'selected').registrationIds.length, 30);
    assert.throws(() => validateSelection(ids, 'selected'), domainError('INVALID_INPUT'));
});

for (const [name, ids, status] of [
    ['정상', [accountId], 'excluded'],
    ['빈 목록', [], 'selected'],
    ['중복', [accountId, accountId], 'selected'],
    ['잘못된 ID', ['invalid'], 'selected'],
    ['허용하지 않은 상태', [accountId], 'withdrawn']
] as const) {
    test(`일괄 선발 입력: ${name}`, () => {
        if (name === '정상')
            assert.deepEqual(validateSelection(ids, status), {
                registrationIds: [accountId],
                status: 'excluded'
            });
        else assert.throws(() => validateSelection(ids, status), domainError('INVALID_INPUT'));
    });
}
