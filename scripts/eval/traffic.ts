import type { Pool } from 'pg';
import type { FaultSwitch } from './scenarios';

const urls = {
    order: process.env.ORDER_URL || 'http://localhost:3001',
    inventory: process.env.INVENTORY_URL || 'http://localhost:3002',
    payment: process.env.PAYMENT_URL || 'http://localhost:3003',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function checkServices(): Promise<void> {
    for (const [name, url] of Object.entries(urls)) {
        const res = await fetch(`${url}/__fault`).catch(() => null);
        if (!res) throw new Error(`${name}-service is not reachable at ${url}`);
        if (res.status === 404) throw new Error(`${name}-service has no /__fault endpoint, start it with ENABLE_FAULTS=true`);
    }
}

export async function clearFaults(): Promise<void> {
    for (const url of Object.values(urls)) await fetch(`${url}/__fault`, { method: 'DELETE' });
}

export async function setFaults(faults: FaultSwitch[]): Promise<void> {
    for (const f of faults) {
        const res = await fetch(`${urls[f.service]}/__fault`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(f.body),
        });
        if (!res.ok) throw new Error(`could not set fault on ${f.service}: ${res.status}`);
    }
}

// Sends orders a few at a time. Failed orders are expected while a fault is on, so they are only counted.
export async function sendOrders(count: number, concurrency = 3): Promise<{ ok: number; failed: number }> {
    let ok = 0;
    let failed = 0;
    for (let sent = 0; sent < count; sent += concurrency) {
        const batch = Math.min(concurrency, count - sent);
        await Promise.all(
            Array.from({ length: batch }, async () => {
                const res = await fetch(`${urls.order}/order`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: '{}',
                }).catch(() => null);
                if (res?.ok) ok++;
                else failed++;
            })
        );
    }
    return { ok, failed };
}

// Spans take a moment to travel through the collector and queue, so wait until the count stops growing.
export async function waitForSpans(pool: Pool, quietMs = 2500, timeoutMs = 90_000): Promise<number> {
    const start = Date.now();
    let last = -1;
    let lastChange = Date.now();
    while (Date.now() - start < timeoutMs) {
        const result = await pool.query('SELECT COUNT(*) AS n FROM spans');
        const count = Number(result.rows[0].n);
        if (count !== last) {
            last = count;
            lastChange = Date.now();
        } else if (Date.now() - lastChange >= quietMs) {
            return count;
        }
        await sleep(500);
    }
    throw new Error('spans were still arriving after 90 seconds, is the worker running?');
}
