import type { OperationStats, SpanRow } from './types';

// Small builders used only by the tests
export function span(spanId: string, parentSpanId: string | null, overrides: Partial<SpanRow> = {}): SpanRow {
    return {
        spanId,
        traceId: 't1',
        parentSpanId,
        service: 'svc',
        operation: spanId,
        startTime: 1000,
        duration: 10,
        status: 'ok',
        error: null,
        tags: {},
        ...overrides,
    };
}

export function stats(service: string, operation: string, overrides: Partial<OperationStats> = {}): OperationStats {
    return {
        service,
        operation,
        recentCount: 30,
        baselineCount: 60,
        recentP99: 40,
        baselineP99: 40,
        baselineP95: 38,
        recentErrors: 0,
        baselineErrors: 0,
        ...overrides,
    };
}
