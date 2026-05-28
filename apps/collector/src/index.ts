import 'dotenv/config';
import { pool } from './lib/db';
import cors from 'cors';
import express, { Request, Response } from 'express';
import amqp from 'amqplib';
import { Span } from './types';
import {buildTree} from "./lib/buildTree";

const app = express();
app.use(express.json());
app.use(cors());

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
        const result = await pool.query(`
          SELECT
            trace_id,
            MIN(service_name)             AS service_name,
            MIN(start_time)               AS start_time,
            SUM(duration)                 AS total_duration_ms,
            COUNT(*)                      AS span_count,
            BOOL_OR(status = 'error')     AS has_error
          FROM spans
          GROUP BY trace_id
          ORDER BY MIN(start_time) DESC
          LIMIT 50
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