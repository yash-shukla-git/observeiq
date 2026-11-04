import type { Pool } from 'pg';
import type { SpanRow } from './types';

export async function loadTraceSpans(pool: Pool, traceId: string): Promise<SpanRow[]> {
    const result = await pool.query(
        `SELECT span_id, trace_id, parent_span_id, service_name, operation_name,
                start_time, duration, status, error, tags
         FROM spans WHERE trace_id = $1 ORDER BY start_time ASC`,
        [traceId]
    );
    // BIGINT columns come back from pg as strings
    return result.rows.map((r) => ({
        spanId: r.span_id,
        traceId: r.trace_id,
        parentSpanId: r.parent_span_id,
        service: r.service_name,
        operation: r.operation_name,
        startTime: Number(r.start_time),
        duration: Number(r.duration),
        status: r.status,
        error: r.error,
        tags: r.tags ?? {},
    }));
}

export function traceStart(spans: SpanRow[]): number {
    return spans.length === 0 ? 0 : Math.min(...spans.map((s) => s.startTime));
}

export function traceEnd(spans: SpanRow[]): number {
    return spans.length === 0 ? 0 : Math.max(...spans.map((s) => s.startTime + s.duration));
}

// first start to last end, same rule as the collector's trace list
export function traceTotalMs(spans: SpanRow[]): number {
    return traceEnd(spans) - traceStart(spans);
}

export function isAncestor(ancestor: SpanRow, span: SpanRow, byId: Map<string, SpanRow>): boolean {
    let current = span.parentSpanId;
    while (current) {
        if (current === ancestor.spanId) return true;
        current = byId.get(current)?.parentSpanId ?? null;
    }
    return false;
}
