import 'dotenv/config'
import express from 'express';
import { Tracer } from '@yashshukla/observeiq-node';

const app = express();
app.use(express.json());

const PORT = process.env.INVENTORY_PORT;
const COLLECTOR_URL = process.env.COLLECTOR_URL!;

const tracer = new Tracer({ serviceName: 'inventory-service', collectorUrl: COLLECTOR_URL });

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/check', async (req, res) => {
    const incomingCtx = tracer.extractContext(req.headers as Record<string, string>);

    await tracer.trace('checkInventory', async () => {
        await new Promise((r) => setTimeout(r, 40));
        const { sku, quantity } = req.body;
        if (sku === 'SKU-999') {
            throw new Error(`InsufficientStockError: ${sku} has 0 units remaining`);
        }
        res.json({ sku, quantity, available: true });
    }, { 'inventory.sku': req.body.sku }, incomingCtx);
});

app.listen(PORT, () => console.log(`[inventory-service] Listening on port ${PORT}`));