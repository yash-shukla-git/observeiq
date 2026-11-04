import { AsyncLocalStorage } from 'async_hooks';

export interface TraceContext {
    traceId: string;
    spanId: string;
}

export const storage = new AsyncLocalStorage<TraceContext>();

export function getCurrentContext(): TraceContext | undefined {
    return storage.getStore();
}
