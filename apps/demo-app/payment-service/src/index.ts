import 'dotenv/config'
import express from 'express';
import { Tracer } from '@yashshukla/observeiq-node';

const app = express();
app.use(express.json());

const PORT = process.env.PAYMENT_PORT || 3003;
const COLLECTOR_URL = process.env.COLLECTOR_URL!;

const tracer = new Tracer({ serviceName: 'payment-service', collectorUrl: COLLECTOR_URL, apiKey: process.env.INGEST_API_KEY });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms: number) => Math.round(ms * (0.8 + Math.random() * 0.4));

// Fault for testing the analysis, only available when ENABLE_FAULTS=true.
//   {"type": "failing_downstream"}  every charge fails like an unavailable payment gateway
let failing = false;

if (process.env.ENABLE_FAULTS === 'true') {
    app.get('/__fault', (_req, res) => res.json({ failing }));
    app.post('/__fault', (req, res) => {
        if (req.body?.type !== 'failing_downstream') {
            res.status(400).json({ error: 'type must be failing_downstream' });
            return;
        }
        failing = true;
        res.json({ failing });
    });
    app.delete('/__fault', (_req, res) => {
        failing = false;
        res.json({ failing });
    });
}

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/charge', async (req, res) => {
    const incomingCtx = tracer.extractContext(req.headers as Record<string, string>);

    try {
        await tracer.trace('chargeCard', async () => {
            await sleep(jitter(80));
            if (failing) {
                throw new Error('PaymentGatewayError: upstream returned 503');
            }
            const { amount, currency } = req.body;
            res.json({ amount, currency, status: 'charged' });
        }, { 'payment.amount': req.body.amount, 'payment.currency': req.body.currency }, incomingCtx);
    } catch (err) {
        res.status(502).json({ error: err instanceof Error ? err.message : 'payment error' });
    }
});

app.listen(PORT, () => console.log(`[payment-service] Listening on port ${PORT}`));
