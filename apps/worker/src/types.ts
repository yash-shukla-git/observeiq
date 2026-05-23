// Mirrors packages/sdk/src/types.ts
// Keep in sync if the SDK Span interface changes

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