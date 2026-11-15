import { error } from '@sveltejs/kit';
import { DiscordError } from './discord/client.ts';
import { DomainError } from './errors.ts';
import { noteRequestError, operationalFailure, OperationLimitError } from './operations/errors.ts';

/** 조회·HTTP 라우트에서 공개 가능한 업무 오류만 SvelteKit 응답으로 바꾼다. */
export function routeError(cause: unknown): never {
    cause = operationalFailure(cause);
    noteRequestError(cause);
    if (cause instanceof DomainError || cause instanceof DiscordError || cause instanceof OperationLimitError)
        error(cause.status, cause.message);
    throw cause;
}
