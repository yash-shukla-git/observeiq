import 'dotenv/config';
import express, { Request, Response } from 'express';
import amqp from 'amqplib';
import { Span } from './types';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4318;
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://missing-env';
const QUEUE_NAME = process.env.QUEUE_NAME || 'spans';

let channel: amqp.Channel;

async function connectRabbitMQ(): Promise<void> {
    const connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: true });
    console.log(`[collector] Connected to RabbitMQ, queue: ${QUEUE_NAME}`);
}

function validateSpan(body: unknown): body is Span {
    if (typeof body !== 'object' || body === null) return false;
    const s = body as Record<string, unknown>;
    return (
        typeof s.traceId === 'string' &&
        typeof s.spanId === 'string' &&
        (s.parentSpanId === null || typeof s.parentSpanId === 'string') &&
        typeof s.operationName === 'string' &&
        typeof s.serviceName === 'string' &&
        typeof s.startTime === 'number' &&
        typeof s.duration === 'number' &&
        (s.status === 'ok' || s.status === 'error')
    );
}

app.post('/ingest', (req: Request, res: Response) => {
    const body = req.body;

    // Accept both a single span and a batch array
    const spans: unknown[] = Array.isArray(body) ? body : [body];

    const invalid = spans.filter((s) => !validateSpan(s));
    if (invalid.length > 0) {
        res.status(400).json({ error: 'Invalid span payload', count: invalid.length });
        return;
    }

    if (!channel) {
        res.status(503).json({ error: 'Queue not ready' });
        return;
    }

    for (const span of spans) {
        channel.sendToQueue(
            QUEUE_NAME,
            Buffer.from(JSON.stringify(span)),
            { persistent: true }
        );
    }

    console.log(`[collector] Queued ${spans.length} span(s)`);
    res.status(202).json({ queued: spans.length });
});

app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
});

async function start() {
    await connectRabbitMQ();
    app.listen(PORT, () => {
        console.log(`[collector] Listening on port ${PORT}`);
    });
}

start().catch((err) => {
    console.error('[collector] Fatal startup error:', err);
    process.exit(1);
});