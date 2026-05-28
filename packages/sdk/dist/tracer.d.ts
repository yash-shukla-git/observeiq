export interface TracerConfig {
    serviceName: string;
    collectorUrl: string;
}
export declare class Tracer {
    private serviceName;
    private collectorUrl;
    constructor(config: TracerConfig);
    trace<T>(operationName: string, fn: () => Promise<T>, tags?: Record<string, string | number | boolean>, incomingContext?: {
        traceId: string;
        spanId: string;
    } | null): Promise<T>;
    injectHeaders(): Record<string, string>;
    extractContext(headers: Record<string, string | string[] | undefined>): {
        traceId: string;
        spanId: string;
    } | null;
    private exportSpan;
}
//# sourceMappingURL=tracer.d.ts.map