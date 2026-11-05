import { error } from '@sveltejs/kit';
import { DiscordError } from './discord/client.ts';
import { DomainError } from './errors.ts';

/** 조회·HTTP 라우트에서 공개 가능한 업무 오류만 SvelteKit 응답으로 바꾼다. */
export function routeError(cause: unknown): never {
    if (cause instanceof DomainError || cause instanceof DiscordError) error(cause.status, cause.message);
    throw cause;
}
