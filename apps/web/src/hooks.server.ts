import { randomUUID } from 'node:crypto';
import { building } from '$app/env';
import { DATABASE_URL } from '$app/env/private';
import { error, isHttpError, isRedirect } from '@sveltejs/kit';
import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { SESSION_COOKIE, authCookieOptions } from '#lib/server/auth/cookies.ts';
import { validateSession } from '#lib/server/auth/session.ts';
import { DomainError } from '#lib/server/errors.ts';
import { refreshGuildViewAccess } from '#lib/server/guild/access.ts';
import {
    observeRequest,
    noteResponseStatus,
    currentOperationCode,
    noteOperationIssue,
    notePhase
} from '#lib/server/operations/context.ts';
import { noteRequestError, operationalFailure, OperationLimitError } from '#lib/server/operations/errors.ts';
import { getDb } from '#lib/server/db/index.ts';
import { getActiveRegion } from '#lib/server/riot/account.ts';
import { startAuctionWorker } from '#lib/server/riot/auction-worker.ts';
import { getLeagueEntriesByPuuid } from '#lib/server/riot/lol/league.ts';
import { getSoloMatchIds, getSoloMatchParticipants } from '#lib/server/riot/lol/match.ts';

export const init: ServerInit = () => {
    if (building || !DATABASE_URL?.trim()) return;
    const stop = startAuctionWorker(getDb, {
        getActiveRegion,
        getLeagueEntriesByPuuid,
        getSoloMatchIds,
        getSoloMatchParticipants
    });
    process.once('sveltekit:shutdown', stop);
    import.meta.hot?.dispose(() => {
        process.off('sveltekit:shutdown', stop);
        stop();
    });
};

export const handle: Handle = async ({ event, resolve }) => {
    event.locals.requestId = randomUUID();
    event.setHeaders({ 'x-request-id': event.locals.requestId });
    return observeRequest(
        {
            requestId: event.locals.requestId,
            routeId: event.route.id,
            method: event.request.method,
            isDataRequest: event.isDataRequest
        },
        async () => {
            try {
                event.locals.actor = null;
                event.locals.user = null;
                event.locals.session = null;
                const sessionStarted = performance.now();
                try {
                    const token = event.cookies.get(SESSION_COOKIE);
                    if (token) {
                        const result = await validateSession(token);
                        if (result) {
                            event.locals.actor = result.actor;
                            event.locals.user = result.user;
                            event.locals.session = result.session;
                        } else {
                            event.cookies.delete(SESSION_COOKIE, authCookieOptions);
                        }
                    }
                } finally {
                    notePhase('sessionMs', performance.now() - sessionStarted);
                }
                if (
                    event.request.method === 'GET' &&
                    event.route.id?.startsWith('/g/') &&
                    event.params.guildId
                ) {
                    const accessStarted = performance.now();
                    try {
                        // 내부 이동은 상위 layout을 재사용할 수 있으므로 모든 병렬 load보다 먼저 갱신한다.
                        await refreshGuildViewAccess(event.locals.actor, event.params.guildId);
                    } finally {
                        notePhase('accessMs', performance.now() - accessStarted);
                    }
                }
                return await resolve(event);
            } catch (cause) {
                cause = operationalFailure(cause);
                if (isRedirect(cause) || isHttpError(cause)) {
                    noteResponseStatus(cause.status);
                    throw cause;
                }
                noteRequestError(cause);
                if (cause instanceof DomainError || cause instanceof OperationLimitError) {
                    noteResponseStatus(cause.status);
                    error(cause.status, cause.message);
                }
                throw cause;
            }
        }
    );
};

/** SvelteKit 기본 원시 오류 출력 대신 요청 요약의 허용된 코드만 남긴다. 공개 오류 문구는 유지한다. */
export const handleError: HandleServerError = ({ kind, error: cause }) => {
    if (kind === 'unknown') noteRequestError(cause);
    else if (!currentOperationCode()) {
        const status = cause && typeof cause === 'object' && 'status' in cause ? cause.status : 500;
        noteOperationIssue(
            status === 404
                ? 'NOT_FOUND'
                : status === 403
                  ? 'FORBIDDEN'
                  : status === 401
                    ? 'UNAUTHENTICATED'
                    : status === 409
                      ? 'CONFLICT'
                      : status === 400
                        ? 'INVALID_INPUT'
                        : status === 503
                          ? 'SERVICE_UNAVAILABLE'
                          : 'INTERNAL_ERROR'
        );
    }
    return {};
};
