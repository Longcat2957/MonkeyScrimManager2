import assert from 'node:assert/strict';
import { DomainError, type DomainErrorCode } from '../../../src/lib/server/errors.ts';
import { RiotError, type RiotErrorCode } from '../../../src/lib/server/riot/errors.ts';
import { DiscordError } from '../../../src/lib/server/discord/client.ts';

/** 오류의 공개 계약을 확인하며 메시지 문구에는 테스트를 결합하지 않는다. */
export function domainError(code: DomainErrorCode, status?: number) {
    return (error: unknown): true => {
        assert.ok(error instanceof DomainError);
        assert.equal(error.code, code);
        if (status !== undefined) assert.equal(error.status, status);
        return true;
    };
}

export function riotError(code: RiotErrorCode, status?: number) {
    return (error: unknown): true => {
        assert.ok(error instanceof RiotError);
        assert.equal(error.code, code);
        if (status !== undefined) assert.equal(error.status, status);
        return true;
    };
}

export function discordError(status: DiscordError['status']) {
    return (error: unknown): true => {
        assert.ok(error instanceof DiscordError);
        assert.equal(error.status, status);
        return true;
    };
}
