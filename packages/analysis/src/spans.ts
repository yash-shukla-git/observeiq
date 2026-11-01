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

// Time spent in a span itself: its duration minus the time of its children.
// Children that run in parallel can add up to more than the parent, so it never goes below 0.
export function selfTimes(spans: SpanRow[]): Map<string, number> {
    const childTime = new Map<string, number>();
    for (const s of spans) {
        if (s.parentSpanId) {
            childTime.set(s.parentSpanId, (childTime.get(s.parentSpanId) ?? 0) + s.duration);
        }
    }
    const result = new Map<string, number>();
    for (const s of spans) {
        result.set(s.spanId, Math.max(0, s.duration - (childTime.get(s.spanId) ?? 0)));
    }
    return result;
}

export function isAncestor(ancestor: SpanRow, span: SpanRow, byId: Map<string, SpanRow>): boolean {
    let current = span.parentSpanId;
    while (current) {
        if (current === ancestor.spanId) return true;
        current = byId.get(current)?.parentSpanId ?? null;
    }
    return false;
}
