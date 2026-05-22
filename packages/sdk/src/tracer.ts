import { v4 as uuidv4 } from 'uuid';
import { storage, getCurrentContext } from './context';
import { Span } from './types';

export interface TracerConfig {
    serviceName: string;
    collectorUrl: string;
}

export class Tracer {
    private serviceName: string;
    private collectorUrl: string;

    constructor(config: TracerConfig) {
        this.serviceName = config.serviceName;
        this.collectorUrl = config.collectorUrl;
    }

    async trace<T>(
        operationName: string,
        fn: () => Promise<T>,
        tags: Record<string, string | number | boolean> = {}
    ): Promise<T> {
        const parent = getCurrentContext();
        const traceId = parent?.traceId ?? uuidv4();
        const spanId = uuidv4();
        const startTime = Date.now();

        return storage.run({ traceId, spanId }, async () => {
            let status: 'ok' | 'error' = 'ok';
            let errorMessage: string | undefined;
            let result: T;

            try {
                result = await fn();
            } catch (err) {
                status = 'error';
                errorMessage = err instanceof Error ? err.message : String(err);
                throw err;
            } finally {
                const span: Span = {
                    traceId,
                    spanId,
                    parentSpanId: parent?.spanId ?? null,
                    operationName,
                    serviceName: this.serviceName,
                    startTime,
                    duration: Date.now() - startTime,
                    status,
                    tags,
                    ...(errorMessage && { error: errorMessage }),
                };

                // Fire and forget — don't let export failure break the caller
                this.exportSpan(span).catch((e) =>
                    console.error('[observeiq] Failed to export span:', e)
                );
            }

            return result!;
        });
    }

    private async exportSpan(span: Span): Promise<void> {
        await fetch(this.collectorUrl + '/ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(span),
        });
    }
}