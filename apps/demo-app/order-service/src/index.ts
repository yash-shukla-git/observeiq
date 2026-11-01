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

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/order', async (req, res) => {
    const incomingCtx = tracer.extractContext(req.headers as Record<string, string>);

    // send {"sku": "SKU-999"} to get a failing order for testing
    const sku = typeof req.body?.sku === 'string' ? req.body.sku : 'SKU-001';

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
                });
                if (!inventoryRes.ok) {
                    throw new Error(`inventory check failed with status ${inventoryRes.status}`);
                }
            }, { 'inventory.sku': sku });

            await tracer.trace('processPayment', async () => {
                await fetch(`${PAYMENT_URL}/charge`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...tracer.injectHeaders(),
                    },
                    body: JSON.stringify({ amount: 99.99, currency: 'USD' }),
                });
            }, { 'payment.amount': 99.99 });

        }, {}, incomingCtx);

        res.json({ success: true });
    } catch (err) {
        res.status(502).json({ success: false, error: err instanceof Error ? err.message : 'order failed' });
    }
});

app.listen(PORT, () => console.log(`[order-service] Listening on port ${PORT}`));