const BASE_URL = process.env.NEXT_PUBLIC_COLLECTOR_URL;

export interface TraceSummary {
    trace_id: string;
    service_name: string;
    start_time: string;
    total_duration_ms: string;
    span_count: string;
    has_error: boolean;
}

export async function getTraces(): Promise<TraceSummary[]> {
    const res = await fetch(`${BASE_URL}/traces`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch traces');
    return res.json();
}