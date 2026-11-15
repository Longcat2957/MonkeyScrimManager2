import { DomainError } from '../errors.ts';
import { DiscordError } from '../discord/client.ts';
import { RiotError } from '../riot/errors.ts';
import { currentOperationCode, noteOperationIssue, type OperationCode } from './context.ts';

export class OperationLimitError extends Error {
    readonly code: Extract<OperationCode, `DB_${string}` | `ROFL_${string}`>;
    readonly status: 408 | 413 | 429 | 503;
    readonly retryAfterSeconds?: number;
    constructor(
        code: OperationLimitError['code'],
        status: OperationLimitError['status'],
        message: string,
        retryAfterSeconds?: number
    ) {
        super(message);
        this.name = 'OperationLimitError';
        this.code = code;
        this.status = status;
        this.retryAfterSeconds = retryAfterSeconds;
    }
}

/** 드라이버의 원시 SQL·매개변수·오류 문구는 공개 실패로 복사하지 않는다. */
export function operationalFailure(cause: unknown): unknown {
    if (
        cause instanceof DomainError ||
        cause instanceof OperationLimitError ||
        cause instanceof DiscordError ||
        cause instanceof RiotError
    )
        return cause;
    let current = cause;
    for (let depth = 0; depth < 6 && current instanceof Error; depth++) {
        const code = 'code' in current ? current.code : null;
        if (code === '57014')
            return new OperationLimitError(
                'DB_QUERY_CANCELLED',
                503,
                '데이터베이스 요청이 중단됐어요. 잠시 후 현재 상태를 다시 확인해 주세요.',
                1
            );
        if (code === '55P03')
            return new OperationLimitError(
                'DB_LOCK_UNAVAILABLE',
                503,
                '다른 작업을 기다리다 요청을 중단했어요. 잠시 후 다시 시도해 주세요.',
                1
            );
        if (code === '25P04' || code === '25P03')
            return new OperationLimitError(
                'DB_TRANSACTION_TIMEOUT',
                503,
                '데이터베이스 처리 시간이 길어 트랜잭션을 중단했어요. 현재 상태를 다시 확인해 주세요.',
                1
            );
        current = 'cause' in current ? current.cause : null;
    }
    const code = currentOperationCode();
    if (
        code === 'DB_CONNECTION_TIMEOUT' ||
        code === 'DB_CONNECTION_LOST' ||
        code === 'DB_TRANSACTION_TIMEOUT'
    )
        return new OperationLimitError(
            code,
            503,
            '데이터베이스 응답을 확인하지 못했어요. 새로고침해 처리 상태를 확인해 주세요.',
            1
        );
    return cause;
}

export function noteRequestError(cause: unknown) {
    const normalized = operationalFailure(cause);
    if (normalized instanceof DomainError || normalized instanceof OperationLimitError)
        noteOperationIssue(normalized.code);
    else if (normalized instanceof DiscordError) noteOperationIssue('DISCORD_UNAVAILABLE');
    else if (normalized instanceof RiotError) noteOperationIssue('RIOT_UNAVAILABLE');
    else noteOperationIssue('INTERNAL_ERROR');
}
