import 'dotenv/config'
import express from 'express';
import { Tracer } from '@yashshukla/observeiq-node';

const app = express();
app.use(express.json());

const PORT = process.env.INVENTORY_PORT;
const COLLECTOR_URL = process.env.COLLECTOR_URL!;

const tracer = new Tracer({ serviceName: 'inventory-service', collectorUrl: COLLECTOR_URL, apiKey: process.env.INGEST_API_KEY });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// normal timings vary a little, so the percentiles are not one flat number
const jitter = (ms: number) => Math.round(ms * (0.8 + Math.random() * 0.4));

// Faults are only for testing the analysis. They are switched on with POST /__fault
// and only exist when ENABLE_FAULTS=true.
//   {"type": "slow_db", "ms": 800}      every db.query takes 800 ms longer
//   {"type": "n_plus_one", "items": 12}  one db.query per item instead of one in total
interface Fault { type: 'slow_db' | 'n_plus_one'; ms?: number; items?: number }
let fault: Fault | null = null;

if (process.env.ENABLE_FAULTS === 'true') {
    app.get('/__fault', (_req, res) => res.json({ fault }));
    app.post('/__fault', (req, res) => {
        if (req.body?.type !== 'slow_db' && req.body?.type !== 'n_plus_one') {
            res.status(400).json({ error: 'type must be slow_db or n_plus_one' });
            return;
        }
        fault = req.body;
        res.json({ fault });
    });
    app.delete('/__fault', (_req, res) => {
        fault = null;
        res.json({ fault });
    });
}

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/check', async (req, res) => {
    const incomingCtx = tracer.extractContext(req.headers as Record<string, string>);

    try {
        await tracer.trace('checkInventory', async () => {
            await sleep(jitter(10));
            const { sku, quantity } = req.body;

            const queries = fault?.type === 'n_plus_one' ? (fault.items ?? 12) : 1;
            for (let i = 0; i < queries; i++) {
                await tracer.trace('db.query', async () => {
                    await sleep(jitter(30) + (fault?.type === 'slow_db' ? (fault.ms ?? 800) : 0));
                }, { 'db.system': 'postgresql', 'db.statement': 'SELECT stock FROM inventory WHERE sku = ?' });
            }

            if (sku === 'SKU-999') {
                throw new Error(`InsufficientStockError: ${sku} has 0 units remaining`);
            }
            res.json({ sku, quantity, available: true });
        }, { 'inventory.sku': req.body.sku }, incomingCtx);
    } catch (err) {
        // the span is already recorded as an error, just answer with json instead of express's html page
        res.status(409).json({ error: err instanceof Error ? err.message : 'inventory error' });
    }
});

app.listen(PORT, () => console.log(`[inventory-service] Listening on port ${PORT}`));
