import { DomainError } from '../errors.ts';
import { DiscordError } from './client.ts';
import { requireBotAuthorization } from './bot-auth.ts';

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

/** 내부 API는 브라우저 세션 대신 전용 봇 인증만 사용한다. */
export async function botResponse(request: Request, operation: () => Promise<unknown>): Promise<Response> {
    try {
        requireBotAuthorization(request.headers.get('authorization'), process.env.BOT_INTERNAL_TOKEN);
        return new Response(JSON.stringify(await operation()), { status: 200, headers });
    } catch (cause) {
        if (cause instanceof DomainError)
            return new Response(JSON.stringify({ error: { code: cause.code, message: cause.message } }), {
                status: cause.status,
                headers
            });
        if (cause instanceof DiscordError)
            return new Response(
                JSON.stringify({ error: { code: 'DISCORD_UNAVAILABLE', message: cause.message } }),
                {
                    status: cause.status,
                    headers: {
                        ...headers,
                        ...(cause.retryAfterSeconds ? { 'Retry-After': String(cause.retryAfterSeconds) } : {})
                    }
                }
            );
        // 입력 본문·토큰·외부 응답을 오류 로그나 응답에 남기지 않는다.
        console.error('[bot-api] 내부 업무 처리 중 예상하지 못한 오류가 발생했습니다.');
        return new Response(
            JSON.stringify({
                error: {
                    code: 'INTERNAL_ERROR',
                    message: '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요'
                }
            }),
            { status: 500, headers }
        );
    }
}

export async function botJson<T>(request: Request, allowedKeys: readonly string[]): Promise<T> {
    if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json')
        throw new DomainError('INVALID_INPUT', 'JSON 요청이 필요해요');
    const reader = request.body?.getReader();
    if (!reader) throw new DomainError('INVALID_INPUT', '요청 내용이 필요해요');
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            length += value.byteLength;
            if (length > 16_384) {
                await reader.cancel();
                throw new DomainError('INVALID_INPUT', '요청 내용이 너무 커요');
            }
            chunks.push(value);
        }
        const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (
            value === null ||
            typeof value !== 'object' ||
            Array.isArray(value) ||
            Object.keys(value).some((key) => !allowedKeys.includes(key))
        )
            throw new Error('invalid');
        return value as T;
    } catch (cause) {
        if (cause instanceof DomainError) throw cause;
        throw new DomainError('INVALID_INPUT', '요청 내용이 올바르지 않아요');
    } finally {
        reader.releaseLock();
    }
}
