import { AsyncLocalStorage } from 'async_hooks';
export interface TraceContext {
    traceId: string;
    spanId: string;
}
export declare const storage: AsyncLocalStorage<TraceContext>;
export declare function getCurrentContext(): TraceContext | undefined;
export declare function generateId(): string;
//# sourceMappingURL=context.d.ts.map