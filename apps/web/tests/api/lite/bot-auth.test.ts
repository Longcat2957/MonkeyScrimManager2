import assert from 'node:assert/strict';
import test from 'node:test';
import { requireBotAuthorization } from '../../../src/lib/server/discord/bot-auth.ts';
import { DomainError } from '../../../src/lib/server/errors.ts';

const token = 'fixture-bot-internal-token-1234567890';

test('봇 내부 인증은 설정한 Bearer 토큰과 정확히 일치할 때만 통과한다', () => {
    assert.doesNotThrow(() => requireBotAuthorization('Bearer ' + token, token));
    assert.doesNotThrow(() => requireBotAuthorization('Bearer ' + token, '  ' + token + '\n'));
});

for (const [name, header] of [
    ['헤더 없음', null],
    ['빈 헤더', ''],
    ['다른 인증 방식', 'Basic ' + token],
    ['토큰 누락', 'Bearer '],
    ['다른 값', 'Bearer ' + 'x'.repeat(token.length)],
    ['짧은 값', 'Bearer short'],
    ['긴 값', 'Bearer ' + token.repeat(100)],
    ['추가 공백', 'Bearer  ' + token],
    ['접미사', 'Bearer ' + token + 'suffix']
] as const) {
    test('봇 내부 인증 거절: ' + name, () => {
        assert.throws(
            () => requireBotAuthorization(header, token),
            (error: unknown) => {
                assert.ok(error instanceof DomainError);
                assert.equal(error.code, 'UNAUTHENTICATED');
                assert.ok(!error.message.includes(token));
                return true;
            }
        );
    });
}

for (const configured of [undefined, '', '  \n']) {
    test('봇 내부 토큰 미설정은 인증 우회 대신 서비스 미설정 오류를 반환한다: ' + String(configured), () => {
        assert.throws(
            () => requireBotAuthorization('Bearer ' + token, configured),
            (error: unknown) => error instanceof DomainError && error.code === 'SERVICE_UNAVAILABLE'
        );
    });
}
