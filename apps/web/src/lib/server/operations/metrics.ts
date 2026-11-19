import { databasePoolStatus } from '../db/status.ts';

// 프로세스 누적 메트릭이다. 재시작하면 0부터 다시 시작하며 replica별로 별도 노출한다.
type Labels = Readonly<Record<string, string>>;
type CounterSeries = { labels: Labels; value: number };
type HistogramSeries = { labels: Labels; buckets: number[]; sum: number; count: number };
type CounterMetric = { help: string; series: Map<string, CounterSeries> };
type HistogramMetric = { help: string; bounds: readonly number[]; series: Map<string, HistogramSeries> };

const HTTP_DURATION_BOUNDS = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30] as const;
const DB_DURATION_BOUNDS = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 15, 30] as const;
const UPSTREAM_DURATION_BOUNDS = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30] as const;

const httpRequests: CounterMetric = {
    help: 'HTTP requests by route template, method, kind, status, and operation code.',
    series: new Map()
};
const httpDuration: HistogramMetric = {
    help: 'HTTP request duration in seconds.',
    bounds: HTTP_DURATION_BOUNDS,
    series: new Map()
};
const dbQueries: CounterMetric = {
    help: 'Database queries by outcome.',
    series: new Map()
};
const dbDuration: HistogramMetric = {
    help: 'Database query duration in seconds.',
    bounds: DB_DURATION_BOUNDS,
    series: new Map()
};
const dbPoolWait: HistogramMetric = {
    help: 'Database pool connection wait in seconds.',
    bounds: DB_DURATION_BOUNDS,
    series: new Map()
};
const upstreamRequests: CounterMetric = {
    help: 'External HTTP requests by target and outcome.',
    series: new Map()
};
const upstreamDuration: HistogramMetric = {
    help: 'External HTTP request duration in seconds.',
    bounds: UPSTREAM_DURATION_BOUNDS,
    series: new Map()
};

function labelKey(labels: Labels) {
    return Object.keys(labels)
        .sort()
        .map((key) => `${key}\u0001${labels[key]}`)
        .join('\u0002');
}

function recordCounter(metric: CounterMetric, labels: Labels, amount = 1) {
    const key = labelKey(labels);
    const series = metric.series.get(key) ?? { labels, value: 0 };
    series.value += amount;
    metric.series.set(key, series);
}

function recordHistogram(metric: HistogramMetric, labels: Labels, seconds: number) {
    const value = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
    const key = labelKey(labels);
    let series = metric.series.get(key);
    if (!series) {
        series = {
            labels,
            buckets: Array.from({ length: metric.bounds.length + 1 }, () => 0),
            sum: 0,
            count: 0
        };
        metric.series.set(key, series);
    }
    for (let index = 0; index < metric.bounds.length; index += 1) {
        if (value <= metric.bounds[index]!) series.buckets[index]! += 1;
    }
    series.buckets[metric.bounds.length]! += 1;
    series.sum += value;
    series.count += 1;
}

export function recordHttpRequest(input: {
    route: string;
    method: string;
    kind: string;
    status: number;
    code: string | null;
    durationMs: number;
}) {
    recordCounter(httpRequests, {
        route: input.route,
        method: input.method,
        kind: input.kind,
        status: String(input.status),
        code: input.code ?? 'none'
    });
    recordHistogram(
        httpDuration,
        { route: input.route, method: input.method, kind: input.kind },
        input.durationMs / 1000
    );
}

export function recordDatabaseQuery(durationMs: number, ok: boolean) {
    recordCounter(dbQueries, { outcome: ok ? 'success' : 'error' });
    recordHistogram(dbDuration, {}, durationMs / 1000);
}

export function recordDatabasePoolWait(durationMs: number) {
    recordHistogram(dbPoolWait, {}, durationMs / 1000);
}

export function recordUpstreamRequest(target: string, durationMs: number, ok: boolean) {
    recordCounter(upstreamRequests, { target, outcome: ok ? 'success' : 'error' });
    recordHistogram(upstreamDuration, { target }, durationMs / 1000);
}

function formatLabels(labels: Labels, extra?: { name: string; value: string }) {
    const entries = Object.entries(labels).sort(([left], [right]) => left.localeCompare(right));
    if (extra) entries.push([extra.name, extra.value]);
    if (!entries.length) return '';
    const escape = (value: string) =>
        value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');
    return `{${entries.map(([key, value]) => `${key}="${escape(value)}"`).join(',')}}`;
}

function formatNumber(value: number) {
    if (!Number.isFinite(value)) return '0';
    return Number(value.toFixed(6)).toString();
}

function renderCounter(lines: string[], name: string, metric: CounterMetric) {
    lines.push(`# HELP ${name} ${metric.help}`, `# TYPE ${name} counter`);
    const series = [...metric.series.values()].sort((left, right) =>
        labelKey(left.labels).localeCompare(labelKey(right.labels))
    );
    for (const entry of series)
        lines.push(`${name}${formatLabels(entry.labels)} ${formatNumber(entry.value)}`);
}

function renderHistogram(lines: string[], name: string, metric: HistogramMetric) {
    lines.push(`# HELP ${name} ${metric.help}`, `# TYPE ${name} histogram`);
    const series = [...metric.series.values()].sort((left, right) =>
        labelKey(left.labels).localeCompare(labelKey(right.labels))
    );
    for (const entry of series) {
        for (let index = 0; index < metric.bounds.length; index += 1)
            lines.push(
                `${name}_bucket${formatLabels(entry.labels, { name: 'le', value: String(metric.bounds[index]) })} ${formatNumber(entry.buckets[index]!)}`
            );
        lines.push(
            `${name}_bucket${formatLabels(entry.labels, { name: 'le', value: '+Inf' })} ${formatNumber(entry.buckets[metric.bounds.length]!)}`
        );
        lines.push(`${name}_sum${formatLabels(entry.labels)} ${formatNumber(entry.sum)}`);
        lines.push(`${name}_count${formatLabels(entry.labels)} ${formatNumber(entry.count)}`);
    }
}

function renderGauge(
    lines: string[],
    name: string,
    help: string,
    series: readonly { labels: Labels; value: number }[]
) {
    lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`);
    for (const entry of series)
        lines.push(`${name}${formatLabels(entry.labels)} ${formatNumber(entry.value)}`);
}

/** Prometheus text exposition 형식으로 현재 프로세스의 누적 값을 반환한다. */
export function renderMetrics() {
    const lines: string[] = [];
    renderCounter(lines, 'msm2_http_requests_total', httpRequests);
    renderHistogram(lines, 'msm2_http_request_duration_seconds', httpDuration);
    renderCounter(lines, 'msm2_db_queries_total', dbQueries);
    renderHistogram(lines, 'msm2_db_query_duration_seconds', dbDuration);
    renderHistogram(lines, 'msm2_db_pool_wait_seconds', dbPoolWait);
    renderCounter(lines, 'msm2_upstream_requests_total', upstreamRequests);
    renderHistogram(lines, 'msm2_upstream_request_duration_seconds', upstreamDuration);

    const pool = databasePoolStatus();
    renderGauge(lines, 'msm2_db_pool_connections', 'Current database pool connections.', [
        { labels: { state: 'total' }, value: pool?.total ?? 0 },
        { labels: { state: 'idle' }, value: pool?.idle ?? 0 },
        { labels: { state: 'waiting' }, value: pool?.waiting ?? 0 }
    ]);

    const memory = process.memoryUsage();
    renderGauge(lines, 'msm2_process_resident_memory_bytes', 'Resident memory size in bytes.', [
        { labels: {}, value: memory.rss }
    ]);
    renderGauge(lines, 'msm2_process_heap_used_bytes', 'Heap used in bytes.', [
        { labels: {}, value: memory.heapUsed }
    ]);
    renderGauge(lines, 'msm2_process_uptime_seconds', 'Process uptime in seconds.', [
        { labels: {}, value: process.uptime() }
    ]);

    return `${lines.join('\n')}\n`;
}
