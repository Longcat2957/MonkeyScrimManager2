import type { TagProps } from 'stdf';

export type ServiceState = 'normal' | 'delayed' | 'down' | 'unconfigured';

export type ServiceCheck = {
    key: 'database' | 'bot';
    name: string;
    state: ServiceState;
    // 정상일 때 보여 줄 측정값. 확인하지 못했으면 null이다.
    detail: string | null;
    // 정상이 아닐 때 운영자가 확인할 내용이다.
    issue: string | null;
};

export type ServiceStatus = { checkedAt: string; services: ServiceCheck[] };

// 확인 시도 결과. 설정 누락·시간 초과·그 외 실패를 구분한다.
export type Probe<T> =
    { ok: true; value: T; latencyMs: number } | { ok: false; reason: 'unconfigured' | 'timeout' | 'error' };

export const SERVICE_STATE_LABEL: Record<
    ServiceState,
    { text: string; state: NonNullable<TagProps['state']> }
> = {
    normal: { text: '정상', state: 'success' },
    delayed: { text: '지연', state: 'warning' },
    down: { text: '중단', state: 'error' },
    unconfigured: { text: '설정 안 됨', state: 'info' }
};

// 이 값을 넘으면 응답은 했어도 지연으로 본다.
export const DATABASE_SLOW_MS = 500;
export const BOT_SLOW_MS = 1000;

const failureIssue = { timeout: '응답 시간이 초과됐어요', error: '연결하지 못했어요' } as const;

export function databaseCheck(probe: Probe<null>): ServiceCheck {
    const base = { key: 'database', name: '데이터베이스' } as const;
    if (!probe.ok) {
        if (probe.reason === 'unconfigured')
            return { ...base, state: 'unconfigured', detail: null, issue: 'DATABASE_URL이 비어 있어요' };
        return { ...base, state: 'down', detail: null, issue: failureIssue[probe.reason] };
    }
    const detail = `응답 ${probe.latencyMs}ms`;
    if (probe.latencyMs > DATABASE_SLOW_MS)
        return { ...base, state: 'delayed', detail, issue: '응답이 느려요' };
    return { ...base, state: 'normal', detail, issue: null };
}

type BotStatusBody = { ready: boolean; pingMs: number | null; guildCount: number | null };

function parseBotStatus(value: unknown): BotStatusBody | null {
    if (typeof value !== 'object' || value === null) return null;
    const { ready, pingMs, guildCount } = value as Record<string, unknown>;
    if (typeof ready !== 'boolean') return null;
    const count = (input: unknown) =>
        typeof input === 'number' && Number.isFinite(input) && input >= 0 ? input : null;
    return { ready, pingMs: count(pingMs), guildCount: count(guildCount) };
}

// 봇 프로세스가 응답해도 Discord 게이트웨이에 연결되지 않았으면 중단으로 본다.
export function botCheck(probe: Probe<unknown>): ServiceCheck {
    const base = { key: 'bot', name: 'Discord 봇' } as const;
    if (!probe.ok) {
        if (probe.reason === 'unconfigured')
            return { ...base, state: 'unconfigured', detail: null, issue: 'BOT_STATUS_URL이 비어 있어요' };
        return { ...base, state: 'down', detail: null, issue: failureIssue[probe.reason] };
    }
    const body = parseBotStatus(probe.value);
    if (!body) return { ...base, state: 'down', detail: null, issue: '상태 응답을 읽을 수 없어요' };
    if (!body.ready) return { ...base, state: 'down', detail: null, issue: 'Discord에 연결되지 않았어요' };
    const detail =
        [
            body.guildCount !== null && `서버 ${body.guildCount}개`,
            body.pingMs !== null && `Discord 지연 ${body.pingMs}ms`
        ]
            .filter(Boolean)
            .join(' · ') || null;
    if (body.pingMs !== null && body.pingMs > BOT_SLOW_MS)
        return { ...base, state: 'delayed', detail, issue: 'Discord 응답이 느려요' };
    return { ...base, state: 'normal', detail, issue: null };
}
