export interface TracerConfig {
    serviceName: string;
    collectorUrl: string;
}
export declare class Tracer {
    private serviceName;
    private collectorUrl;
    constructor(config: TracerConfig);
    trace<T>(operationName: string, fn: () => Promise<T>, tags?: Record<string, string | number | boolean>): Promise<T>;
    private exportSpan;
}
//# sourceMappingURL=tracer.d.ts.map