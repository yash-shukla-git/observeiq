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

export async function getTraces(): Promise<TraceSummary[]> {
    const res = await fetch(`${BASE_URL}/traces`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch traces');
    return res.json();
}

export async function getTrace(traceId: string): Promise<SpanNode[]> {
    const res = await fetch(`${BASE_URL}/traces/${traceId}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch trace');
    return res.json();
}