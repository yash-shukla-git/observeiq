const BASE_URL = process.env.NEXT_PUBLIC_COLLECTOR_URL;

export interface TraceSummary {
    trace_id: string;
    service_name: string;
    start_time: string;
    total_duration_ms: string;
    span_count: string;
    has_error: boolean;
}

export interface SpanNode {
    id: number;
    trace_id: string;
    span_id: string;
    parent_span_id: string | null;
    operation_name: string;
    service_name: string;
    start_time: number;
    duration: number;
    status: string;
    error: string | null;
    tags: Record<string, unknown>;
    children: SpanNode[];
}

function collectorUrl(path: string): string {
    if (!BASE_URL) throw new Error('NEXT_PUBLIC_COLLECTOR_URL is not set');
    return `${BASE_URL}${path}`;
}

export async function getTraces(): Promise<TraceSummary[]> {
    const res = await fetch(collectorUrl('/traces'), { cache: 'no-store' });
    if (!res.ok) throw new Error(`Collector returned ${res.status} for /traces`);
    return res.json();
}

// returns null when the trace does not exist, so the page can show a 404
export async function getTrace(traceId: string): Promise<SpanNode[] | null> {
    const res = await fetch(collectorUrl(`/traces/${encodeURIComponent(traceId)}`), { cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Collector returned ${res.status} for /traces/${traceId}`);
    return res.json();
}