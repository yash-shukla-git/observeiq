"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tracer = void 0;
const uuid_1 = require("uuid");
const context_1 = require("./context");
class Tracer {
    serviceName;
    collectorUrl;
    constructor(config) {
        this.serviceName = config.serviceName;
        this.collectorUrl = config.collectorUrl.replace(/\/$/, '');
    }
    async trace(operationName, fn, tags = {}, incomingContext) {
        const parent = incomingContext ?? (0, context_1.getCurrentContext)();
        const traceId = parent?.traceId ?? (0, uuid_1.v4)();
        const spanId = (0, uuid_1.v4)();
        const startTime = Date.now();
        return context_1.storage.run({ traceId, spanId }, async () => {
            let status = 'ok';
            let errorMessage;
            let result;
            try {
                result = await fn();
            }
            catch (err) {
                status = 'error';
                errorMessage = err instanceof Error ? err.message : String(err);
                throw err;
            }
            finally {
                const span = {
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
                this.exportSpan(span).catch((e) => console.error('[observeiq] Failed to export span:', e));
            }
            return result;
        });
    }
    injectHeaders() {
        const ctx = (0, context_1.getCurrentContext)();
        if (!ctx)
            return {};
        return {
            'x-trace-id': ctx.traceId,
            'x-span-id': ctx.spanId,
        };
    }
    extractContext(headers) {
        const traceId = headers['x-trace-id'];
        const spanId = headers['x-span-id'];
        if (!traceId || !spanId)
            return null;
        return {
            traceId: Array.isArray(traceId) ? traceId[0] : traceId,
            spanId: Array.isArray(spanId) ? spanId[0] : spanId,
        };
    }
    async exportSpan(span) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        try {
            const response = await fetch(this.collectorUrl + '/ingest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(span),
                signal: controller.signal,
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
}
exports.Tracer = Tracer;
//# sourceMappingURL=tracer.js.map