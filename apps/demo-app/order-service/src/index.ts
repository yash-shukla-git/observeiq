import 'dotenv/config'
import express from 'express';
import { Tracer } from '@yashshukla/observeiq-node';

const app = express();
app.use(express.json());

const PORT = process.env.ORDER_PORT;
const COLLECTOR_URL = process.env.COLLECTOR_URL!;
const INVENTORY_URL = process.env.INVENTORY_URL;
const PAYMENT_URL = process.env.PAYMENT_URL;

const tracer = new Tracer({ serviceName: 'order-service', collectorUrl: COLLECTOR_URL, apiKey: process.env.INGEST_API_KEY });

// Faults are only for testing the analysis. They are switched on with POST /__fault
// and only exist when ENABLE_FAULTS=true. Both can be active at the same time.
//   {"type": "retry_payment", "attempts": 5}  retry a failed payment up to 5 times
//   {"type": "client_timeout", "ms": 500}     give up on the inventory call after 500 ms
const faults = new Map<string, { attempts?: number; ms?: number }>();

if (process.env.ENABLE_FAULTS === 'true') {
    app.get('/__fault', (_req, res) => res.json({ faults: Object.fromEntries(faults) }));
    app.post('/__fault', (req, res) => {
        const type = req.body?.type;
        if (type !== 'retry_payment' && type !== 'client_timeout') {
            res.status(400).json({ error: 'type must be retry_payment or client_timeout' });
            return;
        }
        faults.set(type, req.body);
        res.json({ faults: Object.fromEntries(faults) });
    });
    app.delete('/__fault', (_req, res) => {
        faults.clear();
        res.json({ faults: {} });
    });
}

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/order', async (req, res) => {
    const incomingCtx = tracer.extractContext(req.headers as Record<string, string>);

    // send {"sku": "SKU-999"} to get a failing order for testing
    const sku = typeof req.body?.sku === 'string' ? req.body.sku : 'SKU-001';
    const inventoryTimeoutMs = faults.get('client_timeout')?.ms ?? 5000;
    const maxPaymentAttempts = faults.has('retry_payment') ? (faults.get('retry_payment')?.attempts ?? 5) : 1;

    try {
        await tracer.trace('POST /order', async () => {

            await tracer.trace('checkInventory', async () => {
                const inventoryRes = await fetch(`${INVENTORY_URL}/check`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...tracer.injectHeaders(),
                    },
                    body: JSON.stringify({ sku, quantity: 2 }),
                    signal: AbortSignal.timeout(inventoryTimeoutMs),
                });
                if (!inventoryRes.ok) {
                    throw new Error(`inventory check failed with status ${inventoryRes.status}`);
                }
            }, { 'inventory.sku': sku });

            // every attempt is its own span, so retries show up as repeated spans in the trace
            for (let attempt = 1; attempt <= maxPaymentAttempts; attempt++) {
                try {
                    await tracer.trace('processPayment', async () => {
                        const paymentRes = await fetch(`${PAYMENT_URL}/charge`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                ...tracer.injectHeaders(),
                            },
                            body: JSON.stringify({ amount: 99.99, currency: 'USD' }),
                        });
                        if (!paymentRes.ok) {
                            throw new Error(`payment failed with status ${paymentRes.status}`);
                        }
                    }, { 'payment.amount': 99.99, 'payment.attempt': attempt });
                    break;
                } catch (err) {
                    if (attempt === maxPaymentAttempts) throw err;
                }
            }

        }, {}, incomingCtx);

        res.json({ success: true });
    } catch (err) {
        res.status(502).json({ success: false, error: err instanceof Error ? err.message : 'order failed' });
    }
});

app.listen(PORT, () => console.log(`[order-service] Listening on port ${PORT}`));
