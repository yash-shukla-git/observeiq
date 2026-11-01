import 'dotenv/config';
import amqp, {ChannelModel, ConsumeMessage} from 'amqplib';
import { Span } from './types';
import { pool } from './db';
import { isPermanentDbError } from './errors';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://missing-env';
const QUEUE_NAME = process.env.QUEUE_NAME || 'spans';
const DEAD_LETTER_QUEUE = `${QUEUE_NAME}.dlq`;
const PREFETCH = 10; // process up to 10 messages at once
const RETRY_DELAY_MS = 2000;

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

// Messages that can never be saved go to a second queue so they can be inspected later.
// Done here instead of with queue arguments, because changing the arguments of the existing
// spans queue would make RabbitMQ reject it.
function sendToDeadLetter(channel: any, msg: ConsumeMessage, reason: string): void {
    channel.sendToQueue(DEAD_LETTER_QUEUE, msg.content, { persistent: true, headers: { reason } });
    channel.ack(msg);
}

async function start() {
    // Verify DB connection
    await pool.query('SELECT 1');
    console.log('[worker] Connected to PostgreSQL');

    const connection: any = await connectWithRetry(RABBITMQ_URL);
    const channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: true });
    await channel.assertQueue(DEAD_LETTER_QUEUE, { durable: true });
    channel.prefetch(PREFETCH);

    console.log(`[worker] Waiting for spans on queue: ${QUEUE_NAME}`);

    channel.consume(QUEUE_NAME, async (msg: ConsumeMessage | null) => {
        if (!msg) return;

        let span: Span;
        try {
            span = JSON.parse(msg.content.toString()) as Span;
            if (typeof span !== 'object' || span === null) throw new Error('not an object');
        } catch {
            console.error('[worker] Failed to parse message, moving to dead letter queue');
            sendToDeadLetter(channel, msg, 'invalid message');
            return;
        }

        try {
            await insertSpan(span);
            channel.ack(msg);
            console.log(`[worker] Saved span ${span.spanId} (trace: ${span.traceId})`);
        } catch (err) {
            if (isPermanentDbError(err)) {
                console.error(`[worker] Span ${span.spanId} can never be saved, moving to dead letter queue:`, (err as Error).message);
                sendToDeadLetter(channel, msg, (err as Error).message);
                return;
            }
            // probably the database is down, so wait a bit instead of retrying in a tight loop
            console.error('[worker] DB insert failed, requeuing:', (err as Error).message);
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
            channel.nack(msg, false, true);
        }
    });
}

start().catch((err) => {
    console.error('[worker] Fatal startup error:', err);
    process.exit(1);
});