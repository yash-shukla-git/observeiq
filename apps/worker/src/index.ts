import 'dotenv/config';
import amqp, {ChannelModel} from 'amqplib';
import { Pool } from 'pg';
import { Span } from './types';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://missing-env';
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://missing-env';
const QUEUE_NAME = 'spans';
const PREFETCH = 10; // process up to 10 messages at once

const pool = new Pool({ connectionString: DATABASE_URL });

console.log("RABBITMQ_URL: ", RABBITMQ_URL)
console.log("DATABASE_URL: ", DATABASE_URL)

async function insertSpan(span: Span): Promise<void> {
    const query = `
    INSERT INTO spans (
      trace_id, span_id, parent_span_id,
      operation_name, service_name,
      start_time, duration,
      status, error, tags
    ) VALUES (
      $1, $2, $3,
      $4, $5,
      $6, $7,
      $8, $9, $10
    )
    ON CONFLICT (span_id) DO NOTHING
  `;

    const values = [
        span.traceId,
        span.spanId,
        span.parentSpanId ?? null,
        span.operationName,
        span.serviceName,
        span.startTime,
        span.duration,
        span.status,
        span.error ?? null,
        JSON.stringify(span.tags ?? {}),
    ];

    await pool.query(query, values);
}

async function connectWithRetry(url: string, retries = 10, delayMs = 3000): Promise<ChannelModel> {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const conn = await amqp.connect(url);
            console.log('[worker] Connected to RabbitMQ');
            return conn;
        } catch (err) {
            console.warn(`[worker] RabbitMQ not ready (attempt ${attempt}/${retries}), retrying in ${delayMs}ms...`);
            await new Promise((r) => setTimeout(r, delayMs));
        }
    }
    throw new Error('[worker] Could not connect to RabbitMQ after retries');
}

async function start() {
    // Verify DB connection
    await pool.query('SELECT 1');
    console.log('[worker] Connected to PostgreSQL');

    const connection: any = await connectWithRetry(RABBITMQ_URL);
    const channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: true });
    channel.prefetch(PREFETCH);

    console.log(`[worker] Waiting for spans on queue: ${QUEUE_NAME}`);

    channel.consume(QUEUE_NAME, async (msg: { content: { toString: () => string; }; }) => {
        if (!msg) return;

        let span: Span;
        try {
            span = JSON.parse(msg.content.toString()) as Span;
        } catch {
            console.error('[worker] Failed to parse message, discarding');
            channel.nack(msg, false, false); // dead-letter it, don't requeue garbage
            return;
        }

        try {
            await insertSpan(span);
            channel.ack(msg);
            console.log(`[worker] Saved span ${span.spanId} (trace: ${span.traceId})`);
        } catch (err) {
            console.error('[worker] DB insert failed, requeuing:', err);
            channel.nack(msg, false, true); // requeue on transient DB errors
        }
    });
}

start().catch((err) => {
    console.error('[worker] Fatal startup error:', err);
    process.exit(1);
});