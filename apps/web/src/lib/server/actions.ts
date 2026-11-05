import { fail } from '@sveltejs/kit';
import { DomainError } from './errors.ts';
import { DiscordError } from './discord/client.ts';

/** 라우트의 catch에서 업무 오류만 폼 실패로 바꾸고, 이동·HTTP 오류·예상하지 못한 오류는 다시 던진다. */
export function actionFailure(error: unknown, setHeaders?: (headers: Record<string, string>) => void) {
    if (error instanceof DiscordError) {
        if (error.retryAfterSeconds) setHeaders?.({ 'Retry-After': String(error.retryAfterSeconds) });
        return fail(error.status, { message: error.message });
    }
    if (!(error instanceof DomainError)) throw error;
    return fail(error.status, {
        code: error.code,
        message: error.message,
        ...(error.errors ? { errors: error.errors } : {})
    });
}
