import assert from 'node:assert/strict';
import test from 'node:test';
import {
    recordDatabasePoolWait,
    recordDatabaseQuery,
    recordHttpRequest,
    recordUpstreamRequest,
    renderMetrics
} from '../../../src/lib/server/operations/metrics.ts';

test('Prometheus 형식은 요청·DB·외부 호출 누적 값과 풀·프로세스 게이지를 노출한다', () => {
    const route = '/fixture/[id]';
    recordHttpRequest({ route, method: 'GET', kind: 'page', status: 200, code: null, durationMs: 12.5 });
    recordHttpRequest({
        route,
        method: 'GET',
        kind: 'page',
        status: 500,
        code: 'INTERNAL_ERROR',
        durationMs: 250
    });
    recordDatabaseQuery(4, true);
    recordDatabaseQuery(1600, false);
    recordDatabasePoolWait(35);
    recordUpstreamRequest('riot', 80, true);

    const text = renderMetrics();
    assert.match(text, /^# HELP msm2_http_requests_total /m);
    assert.match(text, /^# TYPE msm2_http_request_duration_seconds histogram$/m);
    assert.ok(
        text.includes(
            'msm2_http_requests_total{code="none",kind="page",method="GET",route="/fixture/[id]",status="200"} 1'
        )
    );
    assert.ok(
        text.includes(
            'msm2_http_requests_total{code="INTERNAL_ERROR",kind="page",method="GET",route="/fixture/[id]",status="500"} 1'
        )
    );
    assert.ok(
        text.includes(
            'msm2_http_request_duration_seconds_bucket{kind="page",method="GET",route="/fixture/[id]",le="0.025"} 1'
        )
    );
    assert.ok(
        text.includes(
            'msm2_http_request_duration_seconds_bucket{kind="page",method="GET",route="/fixture/[id]",le="0.1"} 1'
        )
    );
    assert.ok(
        text.includes(
            'msm2_http_request_duration_seconds_bucket{kind="page",method="GET",route="/fixture/[id]",le="0.25"} 2'
        )
    );
    assert.ok(
        text.includes(
            'msm2_http_request_duration_seconds_count{kind="page",method="GET",route="/fixture/[id]"} 2'
        )
    );
    assert.ok(text.includes('msm2_db_queries_total{outcome="error"} 1'));
    assert.ok(text.includes('msm2_db_queries_total{outcome="success"} 1'));
    assert.ok(text.includes('msm2_db_query_duration_seconds_count 2'));
    assert.ok(text.includes('msm2_db_pool_wait_seconds_count 1'));
    assert.ok(text.includes('msm2_upstream_requests_total{outcome="success",target="riot"} 1'));
    assert.ok(text.includes('msm2_upstream_request_duration_seconds_count{target="riot"} 1'));
    assert.match(text, /^msm2_db_pool_connections\{state="total"\} \d+$/m);
    assert.match(text, /^msm2_process_uptime_seconds [\d.]+$/m);
});

test('라벨 값의 역슬래시·따옴표·줄바꿈은 Prometheus 규칙으로 이스케이프한다', () => {
    recordHttpRequest({
        route: '/bad/"quote"\\path\nline',
        method: 'GET',
        kind: 'page',
        status: 404,
        code: 'HTTP_ERROR',
        durationMs: 1
    });
    const text = renderMetrics();
    assert.ok(text.includes('route="/bad/\\"quote\\"\\\\path\\nline"'));
});
