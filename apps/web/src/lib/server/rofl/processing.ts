import { DomainError } from '../errors.ts';
import { OperationLimitError } from '../operations/errors.ts';

export type RoflLimits = {
    concurrent: number;
    perUserConcurrent: number;
    perUserRequests: number;
    windowMs: number;
    bodyMs: number;
    parseMs: number;
};

export function roflLimits(values: Record<string, string | undefined>): RoflLimits {
    const read = (key: string, fallback: number, maximum: number) => {
        const text = values[key]?.trim();
        const value = text ? Number(text) : fallback;
        if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
            throw new Error(`${key}는 1~${maximum} 정수여야 합니다.`);
        return value;
    };
    const concurrent = read('ROFL_MAX_CONCURRENT', 2, 8);
    const result = {
        concurrent,
        perUserConcurrent: read('ROFL_USER_CONCURRENT', Math.min(2, concurrent), 8),
        perUserRequests: read('ROFL_USER_REQUEST_LIMIT', 12, 1000),
        windowMs: read('ROFL_RATE_WINDOW_MS', 60_000, 3_600_000),
        bodyMs: read('ROFL_BODY_TIMEOUT_MS', 30_000, 60_000),
        parseMs: read('ROFL_PARSE_TIMEOUT_MS', 5000, 30_000)
    };
    if (result.perUserConcurrent > result.concurrent)
        throw new Error('ROFL 사용자별 동시성은 전역 동시성 이하여야 합니다.');
    return result;
}

/** 큐와 파일을 보관하지 않는다. 한 Node 프로세스의 진행 중 요청과 짧은 사용자별 횟수만 제한한다. */
export class RoflAdmission {
    private readonly limits: RoflLimits;
    private readonly now: () => number;
    private active = 0;
    private users = new Map<string, number>();
    private windows = new Map<string, { since: number; count: number }>();

    constructor(limits: RoflLimits, now = () => performance.now()) {
        this.limits = limits;
        this.now = now;
    }

    claim(userId: string): () => void {
        const now = this.now();
        for (const [key, window] of this.windows)
            if (now - window.since >= this.limits.windowMs) this.windows.delete(key);
        const window = this.windows.get(userId);
        if (window && window.count >= this.limits.perUserRequests)
            throw new OperationLimitError(
                'ROFL_RATE_LIMITED',
                429,
                '파일 처리 요청이 많아요. 잠시 후 다시 업로드해 주세요.',
                Math.max(1, Math.ceil((window.since + this.limits.windowMs - now) / 1000))
            );
        const count = this.users.get(userId) ?? 0;
        if (
            this.active >= this.limits.concurrent ||
            count >= this.limits.perUserConcurrent ||
            (!window && this.windows.size >= 10_000)
        )
            throw new OperationLimitError(
                'ROFL_OVERLOADED',
                429,
                '다른 파일을 처리 중이에요. 잠시 후 다시 업로드해 주세요.',
                2
            );
        this.windows.set(userId, { since: window?.since ?? now, count: (window?.count ?? 0) + 1 });
        this.active++;
        this.users.set(userId, count + 1);
        let released = false;
        return () => {
            if (released) return;
            released = true;
            this.active--;
            const remaining = (this.users.get(userId) ?? 1) - 1;
            if (remaining) this.users.set(userId, remaining);
            else this.users.delete(userId);
        };
    }
}

/** 본문 읽기가 끝난 응답만 반환하지 않고 실제 reader를 취소해 제한된 요청을 중단한다. */
export async function readRoflForm(request: Request, timeoutMs: number): Promise<FormData> {
    const maximum = 70 * 1024 * 1024;
    const length = request.headers.get('content-length');
    if (length && Number(length) > maximum)
        throw new OperationLimitError('ROFL_BODY_TOO_LARGE', 413, '파일 요청이 너무 커요.');
    if (!request.body) throw new DomainError('INVALID_INPUT', 'ROFL 파일을 골라 주세요');
    const reader = request.body.getReader();
    let failure: OperationLimitError | undefined;
    let cancelling: Promise<void> | undefined;
    const cancel = (cause: OperationLimitError) => {
        if (failure) return;
        failure = cause;
        cancelling = reader.cancel(cause).catch(() => {});
    };
    const abort = () =>
        cancel(new OperationLimitError('ROFL_ABORTED', 408, '파일 업로드를 중단했어요. 다시 시도해 주세요.'));
    const timer = setTimeout(
        () =>
            cancel(
                new OperationLimitError(
                    'ROFL_BODY_TIMEOUT',
                    408,
                    '파일을 받는 시간이 길어 중단했어요. 연결을 확인한 뒤 다시 시도해 주세요.'
                )
            ),
        timeoutMs
    );
    request.signal.addEventListener('abort', abort, { once: true });
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        if (request.signal.aborted) abort();
        while (!failure) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maximum)
                cancel(new OperationLimitError('ROFL_BODY_TOO_LARGE', 413, '파일 요청이 너무 커요.'));
            else chunks.push(value);
        }
        if (failure) throw failure;
    } catch (cause) {
        throw failure ?? cause;
    } finally {
        clearTimeout(timer);
        request.signal.removeEventListener('abort', abort);
        await cancelling;
        reader.releaseLock();
    }
    try {
        return await new Request('http://upload.invalid', {
            method: 'POST',
            headers: { 'content-type': request.headers.get('content-type') ?? '' },
            body: Buffer.concat(chunks, size)
        }).formData();
    } catch {
        throw new DomainError('INVALID_INPUT', '파일 요청을 읽을 수 없어요. 다시 선택해 주세요');
    }
}
