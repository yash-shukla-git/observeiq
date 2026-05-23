export interface Span {
    traceId: string;
    spanId: string;
    parentSpanId: string | null;
    operationName: string;
    serviceName: string;
    startTime: number;
    duration: number;
    status: 'ok' | 'error';
    tags: Record<string, string | number | boolean>;
    error?: string;
}
//# sourceMappingURL=types.d.ts.map