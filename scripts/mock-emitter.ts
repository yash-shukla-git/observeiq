#!/usr/bin/env ts-node

/**
 * mock-emitter.ts
 * Posts a realistic fake trace (3 spans across 3 services) to the collector.
 * Usage:
 *   ts-node scripts/mock-emitter.ts
 *   COLLECTOR_URL=http://localhost:4318 ts-node scripts/mock-emitter.ts
 */

const COLLECTOR_URL = process.env.COLLECTOR_URL || 'http://localhost:4318';

function uuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

interface Span {
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

function buildTrace(): Span[] {
    const traceId = uuid();
    const now = Date.now();

    // Root span: api-gateway receives the request
    const rootSpanId = uuid();
    const root: Span = {
        traceId,
        spanId: rootSpanId,
        parentSpanId: null,
        operationName: 'POST /orders',
        serviceName: 'api-gateway',
        startTime: now,
        duration: 120,
        status: 'ok',
        tags: { 'http.method': 'POST', 'http.status_code': 200, 'env': 'dev' },
    };

    // Child span: order-service does the business logic
    const orderSpanId = uuid();
    const orderSpan: Span = {
        traceId,
        spanId: orderSpanId,
        parentSpanId: rootSpanId,
        operationName: 'createOrder',
        serviceName: 'order-service',
        startTime: now + 5,
        duration: 90,
        status: 'ok',
        tags: { 'db.type': 'postgresql', 'order.items': 3 },
    };

    // Grandchild span: inventory-service throws an error
    const inventorySpan: Span = {
        traceId,
        spanId: uuid(),
        parentSpanId: orderSpanId,
        operationName: 'checkInventory',
        serviceName: 'inventory-service',
        startTime: now + 10,
        duration: 45,
        status: 'error',
        tags: { 'item.sku': 'SKU-9981', 'stock': 0 },
        error: 'InsufficientStockError: SKU-9981 has 0 units remaining',
    };

    return [root, orderSpan, inventorySpan];
}

async function emitTrace(spans: Span[]): Promise<void> {
    const res = await fetch(`${COLLECTOR_URL}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spans),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Collector returned ${res.status}: ${text}`);
    }

    const json = await res.json();
    console.log(`[emitter] Response:`, json);
}

async function main() {
    const TRACES = parseInt(process.env.TRACES || '1', 10);
    console.log(`[emitter] Sending ${TRACES} trace(s) to ${COLLECTOR_URL}/ingest`);

    for (let i = 0; i < TRACES; i++) {
        const spans = buildTrace();
        console.log(`[emitter] Trace ${i + 1}: traceId=${spans[0]!.traceId}, spans=${spans.length}`);
        await emitTrace(spans);
    }

    console.log('[emitter] Done');
}

main().catch((err) => {
    console.error('[emitter] Error:', err.message);
    process.exit(1);
});