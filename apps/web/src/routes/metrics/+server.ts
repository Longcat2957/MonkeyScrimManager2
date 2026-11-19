import { renderMetrics } from '#lib/server/operations/metrics.ts';
import type { RequestHandler } from './$types';

// Caddy가 공개 /metrics를 차단하며 Prometheus만 내부 네트워크에서 수집한다.
export const GET: RequestHandler = () =>
    new Response(renderMetrics(), {
        headers: {
            'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
            'Cache-Control': 'no-store'
        }
    });
