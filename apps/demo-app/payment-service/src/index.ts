import 'dotenv/config'
import express from 'express';
import { Tracer } from '@yashshukla/observeiq-node';

const app = express();
app.use(express.json());

const PORT = process.env.PAYMENT_PORT || 3003;
const COLLECTOR_URL = process.env.COLLECTOR_URL!;

const tracer = new Tracer({ serviceName: 'payment-service', collectorUrl: COLLECTOR_URL });

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/charge', async (req, res) => {
    const incomingCtx = tracer.extractContext(req.headers as Record<string, string>);

    await tracer.trace('chargeCard', async () => {
        await new Promise((r) => setTimeout(r, 80));
        const { amount, currency } = req.body;
        res.json({ amount, currency, status: 'charged' });
    }, { 'payment.amount': req.body.amount, 'payment.currency': req.body.currency }, incomingCtx);
});

app.listen(PORT, () => console.log(`[payment-service] Listening on port ${PORT}`));