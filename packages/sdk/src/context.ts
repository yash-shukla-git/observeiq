import { AsyncLocalStorage } from 'async_hooks';
import { v4 as uuidv4 } from 'uuid';

export interface TraceContext {
    traceId: string;
    spanId: string;
}

export const storage = new AsyncLocalStorage<TraceContext>();

export function getCurrentContext(): TraceContext | undefined {
    return storage.getStore();
}

export function generateId(): string {
    return uuidv4();
}