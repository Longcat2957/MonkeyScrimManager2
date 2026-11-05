import type {
    BotCreateScrimInput,
    BotGuildSyncInput,
    BotPublication,
    BotPublicationResult,
    BotRegistrationContext,
    BotRegistrationInput,
    BotFailedPublication,
    BotPublicationRetryInput
} from '../../../../shared/bot-api.js';

export class BotApiError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: string,
        message: string
    ) {
        super(message);
        this.name = 'BotApiError';
    }
}

export interface ApiHealth {
    connected: boolean;
    checkedAt: string | null;
    errorCode: string | null;
}

export function createApiClient(options: {
    origin: URL;
    token: string;
    fetch?: typeof fetch;
    timeoutMs?: number;
}) {
    const fetcher = options.fetch ?? fetch;
    const health: ApiHealth = { connected: false, checkedAt: null, errorCode: null };
    async function request<T>(
        method: string,
        path: string,
        body?: unknown,
        timeoutMs = options.timeoutMs ?? 10_000
    ): Promise<T> {
        try {
            const response = await fetcher(new URL('/internal/bot' + path, options.origin), {
                method,
                redirect: 'error',
                headers: {
                    authorization: `Bearer ${options.token}`,
                    accept: 'application/json',
                    ...(body === undefined ? {} : { 'content-type': 'application/json' })
                },
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: AbortSignal.timeout(timeoutMs)
            });
            const payload: unknown = await response.json().catch(() => null);
            if (!response.ok) {
                const error =
                    payload && typeof payload === 'object' && 'error' in payload ? payload.error : null;
                const code =
                    error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
                        ? error.code
                        : 'API_ERROR';
                const message =
                    error &&
                    typeof error === 'object' &&
                    'message' in error &&
                    typeof error.message === 'string'
                        ? error.message
                        : '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
                throw new BotApiError(response.status, code, message);
            }
            if (payload === null || typeof payload !== 'object') {
                throw new BotApiError(502, 'INVALID_RESPONSE', '서버 응답을 확인할 수 없어요.');
            }
            health.connected = true;
            health.errorCode = null;
            return payload as T;
        } catch (cause) {
            const error =
                cause instanceof BotApiError
                    ? cause
                    : new BotApiError(
                          503,
                          'API_UNAVAILABLE',
                          '웹 서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.'
                      );
            health.connected = error.status < 500 && ![401, 403].includes(error.status);
            health.errorCode = error.code;
            throw error;
        } finally {
            health.checkedAt = new Date().toISOString();
        }
    }
    const guildPath = (guildId: string) => '/guilds/' + encodeURIComponent(guildId);
    const scrimPath = (guildId: string, scrimId: string) =>
        guildPath(guildId) + '/scrims/' + encodeURIComponent(scrimId);
    return {
        health,
        initialize(guildId: string, actorId: string, interactionId: string) {
            return request<{ guildId: string; seasonId: string }>(
                'POST',
                guildPath(guildId) + '/initialization',
                { actorId, interactionId }
            );
        },
        createScrim(guildId: string, input: BotCreateScrimInput) {
            return request<{ scrimId: string }>('POST', guildPath(guildId) + '/scrims', input);
        },
        registration(guildId: string, scrimId: string, actorId: string) {
            return request<BotRegistrationContext>(
                'GET',
                scrimPath(guildId, scrimId) + '/registration?actorId=' + encodeURIComponent(actorId)
            );
        },
        saveRegistration(guildId: string, scrimId: string, input: BotRegistrationInput) {
            return request<BotRegistrationContext>(
                input.action === 'create' ? 'POST' : 'PATCH',
                scrimPath(guildId, scrimId) + '/registrations',
                input
            );
        },
        sync(guildId: string, input: BotGuildSyncInput) {
            return request<{ ok: true }>('PUT', guildPath(guildId) + '/sync', input);
        },
        knownMembers(guildId: string, after?: string) {
            return request<{ memberIds: string[]; nextCursor: string | null }>(
                'GET',
                guildPath(guildId) + '/members' + (after ? '?after=' + encodeURIComponent(after) : '')
            );
        },
        reconcile() {
            return request<{ ok: true }>('POST', '/reconciliation', {});
        },
        failedPublications(guildId: string, actorId: string, query = '') {
            // 자동완성은 지연 응답을 지원하지 않아 Discord 초기 응답 제한보다 먼저 종료한다.
            return request<{ publications: BotFailedPublication[] }>(
                'GET',
                guildPath(guildId) + '/publications?' + new URLSearchParams({ actorId, q: query }),
                undefined,
                2000
            );
        },
        retryPublication(guildId: string, id: string, input: BotPublicationRetryInput) {
            return request<{ ok: true }>(
                'POST',
                guildPath(guildId) + '/publications/' + encodeURIComponent(id) + '/retry',
                input
            );
        },
        claim(workerId: string) {
            return request<{ publications: BotPublication[] }>('POST', '/publication-claims', { workerId });
        },
        complete(id: string, input: BotPublicationResult) {
            return request<{ ok: true }>('PATCH', '/publications/' + encodeURIComponent(id), input);
        }
    };
}

export type BotApi = ReturnType<typeof createApiClient>;

/** Discord 오류에는 요청 본문이나 인증 정보가 섞일 수 있어 객체 전체를 기록하지 않는다. */
export function errorCode(error: unknown): string {
    if (error instanceof BotApiError) return error.code;
    if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'number')
        return 'DISCORD_' + error.code;
    return 'UNEXPECTED_ERROR';
}
