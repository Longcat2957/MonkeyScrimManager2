import assert from 'node:assert/strict';
import test from 'node:test';
import { readConfig } from '../src/config.ts';
import { commands } from '../src/commands/definitions.ts';
import { scheduleFromKst } from '../src/commands/scrims.ts';

const environment = {
    DISCORD_TOKEN: 'fixture-token',
    BOT_INTERNAL_TOKEN: 'a'.repeat(32),
    WEB_ORIGIN: 'https://monkeybot.example'
};

test('설정은 로컬 내부 API와 명시한 공개 origin을 분리한다', () => {
    const config = readConfig(environment);
    assert.equal(config.apiUrl.origin, 'http://127.0.0.1:3000');
    assert.equal(config.webOrigin.origin, 'https://monkeybot.example');
    assert.equal(config.statusPort, 0);
    assert.equal(config.testGuildId, null);
});

for (const [key, value] of [
    ['BOT_INTERNAL_TOKEN', 'short'],
    ['DISCORD_TOKEN', 'bad token'],
    ['WEB_ORIGIN', 'https://user:password@example.com'],
    ['WEB_ORIGIN', 'javascript:alert(1)'],
    ['BOT_API_URL', 'http://public.example'],
    ['WEB_ORIGIN', 'https://example.com/path'],
    ['BOT_STATUS_PORT', '-1'],
    ['BOT_STATUS_PORT', '65536'],
    ['DISCORD_APPLICATION_ID', 'wrong']
])
    test(`${key}의 잘못된 설정은 기동 전에 거절한다: ${value?.split(':')[0]}`, () => {
        assert.throws(() => readConfig({ ...environment, [key!]: value }), Error);
    });

test('한국 시각과 일정 미정을 웹 저장 계약으로 변환한다', () => {
    assert.equal(scheduleFromKst(null), null);
    assert.equal(scheduleFromKst('2026-11-05 20:30'), '2026-11-05T11:30:00.000Z');
    assert.equal(scheduleFromKst('2028-02-29 00:00'), '2028-02-28T15:00:00.000Z');
});

for (const value of [
    '2026-02-29 20:00',
    '2026-13-01 20:00',
    '2026-11-31 20:00',
    '2026-11-05 24:00',
    '오늘 20시'
]) {
    test(`없는 날짜나 잘못된 시각은 거절한다: ${value}`, () => assert.throws(() => scheduleFromKst(value)));
}

test('등록할 명령은 Discord가 검증하는 빌더 계약을 만족한다', () => {
    const values = commands.map((command) => command.toJSON());
    assert.deepEqual(
        values.map((value) => value.name),
        ['초기설정', '내전모집', '내전목록', '게시복구']
    );
    assert.ok(values.every((value) => value.contexts?.length === 1));
    assert.equal(
        values.find((value) => value.name === '내전모집')?.options?.find((option) => option.name === '제목')
            ?.required,
        true
    );
});
