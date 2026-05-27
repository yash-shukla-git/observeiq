import dotenv from 'dotenv';
import express from 'express';
import { Tracer } from '@yashshukla/observeiq-node';
dotenv.config({ path: '../../.env' });

const app = express();
app.use(express.json());

const PORT = process.env.DEMO_PORT;
const COLLECTOR_URL = process.env.COLLECTOR_URL;

const tracer = new Tracer({
    serviceName: 'demo-service',
    collectorUrl: COLLECTOR_URL!,
});

app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});

app.post('/order', async (_req, res) => {
    await tracer.trace('POST /order', async () => {

        await tracer.trace('validateCart', async () => {
            await new Promise((r) => setTimeout(r, 50));
        }, { 'cart.items': 3 });

        await tracer.trace('processPayment', async () => {
            await new Promise((r) => setTimeout(r, 120));

            await tracer.trace('chargeCard', async () => {
                await new Promise((r) => setTimeout(r, 80));
            }, { 'payment.method': 'credit_card' });

        }, { 'payment.provider': 'stripe' });

    }, { 'http.method': 'POST', 'http.status_code': 200 });

    res.json({ success: true });
});

app.post('/order/fail', async (_req, res) => {
    try {
        await tracer.trace('POST /order/fail', async () => {
            await tracer.trace('checkInventory', async () => {
                await new Promise((r) => setTimeout(r, 30));
                throw new Error('InsufficientStockError: SKU-9981 has 0 units');
            }, { 'item.sku': 'SKU-9981' });
        }, { 'http.method': 'POST' });
    } catch {
        // error already captured by tracer
    }

    res.status(500).json({ error: 'Order failed' });
});

app.listen(PORT, () => {
    console.log(`[demo-service] Listening on port ${PORT}`);
});