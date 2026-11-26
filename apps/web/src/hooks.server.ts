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
import { promoteDueStandby } from '#lib/server/scrims/service.ts';

// PostgreSQL 연결·자원 부족(08·53·57P0x)과 Node 네트워크 오류는 저장소 장애로 본다.
const STORAGE_FAILURE = /^(08|53|57P0)|^E(CONNREFUSED|CONNRESET|TIMEDOUT|HOSTUNREACH|NOTFOUND|PIPE)$/;

/** 오류와 원인 사슬에서 첫 번째 문자열 코드(SQLSTATE 등)를, 없으면 오류 이름을 찾는다. */
function failureCode(cause: unknown): string {
    let current = cause;
    for (let depth = 0; depth < 6 && current instanceof Error; depth++) {
        if ('code' in current && typeof current.code === 'string') return current.code;
        current = 'cause' in current ? current.cause : null;
    }
    return cause instanceof Error ? cause.name : 'unknown';
}

export const init: ServerInit = () => {
    if (building || !DATABASE_URL?.trim()) return;
    const stopAuction = startAuctionWorker(getDb, {
        getActiveRegion,
        getLeagueEntriesByPuuid,
        getSoloMatchIds,
        getSoloMatchParticipants
    });
    // 봇 연결이나 페이지 조회가 없어도 모집 중인 내전의 도착 예약을 처리한다.
    let promoting = false;
    const timer = setInterval(async () => {
        if (promoting) return;
        promoting = true;
        try {
            await promoteDueStandby(getDb());
        } catch (cause) {
            // 원시 SQL·매개변수가 담긴 메시지 대신 오류 코드만 남기고, 연결 장애와 처리 오류를 구분한다.
            const code = failureCode(cause);
            if (STORAGE_FAILURE.test(code)) console.warn('standby_promotion', 'storage_unavailable', code);
            else console.error('standby_promotion', 'failed', code);
        } finally {
            promoting = false;
        }
    }, 5000).unref();
    const stop = () => {
        clearInterval(timer);
        stopAuction();
    };
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
