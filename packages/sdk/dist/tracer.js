"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tracer = void 0;
const uuid_1 = require("uuid");
const context_1 = require("./context");
class Tracer {
    constructor(config) {
        this.serviceName = config.serviceName;
        // Remove trailing slash to ensure clean URL joining
        this.collectorUrl = config.collectorUrl.replace(/\/$/, '');
    }
    async trace(operationName, fn, tags = {}) {
        const parent = (0, context_1.getCurrentContext)();
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