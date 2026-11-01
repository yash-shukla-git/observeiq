import 'dotenv/config';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import amqp from 'amqplib';
import { timingSafeEqual } from 'crypto';
import {buildTree} from "./lib/buildTree";
import {pool} from "./lib/db";
import {validateSpan} from "./lib/validateSpan";

const app = express();
app.use(express.json({ limit: '256kb' }));
// the dashboard calls this from the browser; set CORS_ORIGIN to its url in production
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));

const PORT = process.env.COLLECTOR_PORT || 4318;
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://missing-env';
const QUEUE_NAME = process.env.QUEUE_NAME || 'spans';
const INGEST_API_KEY = process.env.INGEST_API_KEY;
const MAX_BATCH_SIZE = 100;

let channel: amqp.Channel;

async function connectRabbitMQ(): Promise<void> {
    const connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: true });
    console.log(`[collector] Connected to RabbitMQ, queue: ${QUEUE_NAME}`);

    // Recreate channel if it closes
    channel.on('close', async () => {
        console.warn('[collector] Channel closed, reconnecting...');
        try {
            channel = await connection.createChannel();
            await channel.assertQueue(QUEUE_NAME, { durable: true });
            console.log('[collector] Channel recreated');
        } catch (err) {
            console.error('[collector] Failed to recreate channel:', err);
        }
    });

    // Reconnect if connection drops
    connection.on('close', async () => {
        console.warn('[collector] Connection closed, reconnecting in 3s...');
        setTimeout(connectRabbitMQ, 3000);
    });
}

// If no key is configured, ingest stays open so local development needs no setup.
function requireApiKey(req: Request, res: Response, next: NextFunction): void {
    if (!INGEST_API_KEY) {
        next();
        return;
    }
    const sent = Buffer.from(req.header('x-api-key') ?? '');
    const expected = Buffer.from(INGEST_API_KEY);
    // timingSafeEqual throws if lengths differ, so check length first
    if (sent.length !== expected.length || !timingSafeEqual(sent, expected)) {
        res.status(401).json({ error: 'Invalid or missing API key' });
        return;
    }
    next();
}

app.post('/ingest', requireApiKey, (req: Request, res: Response) => {
    const body = req.body;

    // Accept both a single span and a batch array
    const spans: unknown[] = Array.isArray(body) ? body : [body];

    if (spans.length === 0 || spans.length > MAX_BATCH_SIZE) {
        res.status(400).json({ error: `Send between 1 and ${MAX_BATCH_SIZE} spans per request` });
        return;
    }

    for (let i = 0; i < spans.length; i++) {
        const problem = validateSpan(spans[i]);
        if (problem) {
            res.status(400).json({ error: 'Invalid span payload', index: i, reason: problem });
            return;
        }
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

app.get('/health/db', async (_req: Request, res: Response) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok' });
    } catch (err) {
        res.status(503).json({ status: 'error', detail: 'Postgres unreachable' });
    }
});

app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
});

app.get('/traces', async (req: Request, res: Response) => {
    try {
        // total duration is first start to last end, not SUM, because child spans overlap their parent.
        // service_name comes from the root span (no parent); if the root is missing, the earliest span is used.
        const result = await pool.query(`
            SELECT
                trace_id,
                (ARRAY_AGG(service_name ORDER BY (parent_span_id IS NOT NULL), start_time))[1] AS service_name,
                MIN(start_time) AS start_time,
                MAX(start_time + duration) - MIN(start_time) AS total_duration_ms,
                COUNT(*) AS span_count,
                BOOL_OR(status = 'error') AS has_error
            FROM spans
            GROUP BY trace_id
            ORDER BY MIN(start_time) DESC
            LIMIT 50;
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('GET /traces error:', err);
        res.status(503).json({ error: 'DB unavailable' });
    }
});

app.get('/traces/:traceId', async (req: Request, res: Response) => {
    try {
        const { traceId } = req.params;
        const result = await pool.query(
            `SELECT * FROM spans WHERE trace_id = $1 ORDER BY start_time ASC`,
            [traceId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Trace not found' });
            return;
        }

        const tree = buildTree(result.rows);
        res.json(tree);
    } catch (err) {
        console.error('GET /traces/:traceId error:', err);
        res.status(503).json({ error: 'DB unavailable' });
    }
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