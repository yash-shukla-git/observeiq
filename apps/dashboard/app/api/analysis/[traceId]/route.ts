import { analyzeTrace, diagnoseTrace, limitsFromEnv, pgStore, providerFromEnv, timeoutFromEnv } from '@observeiq/analysis';
import { pool } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Streams the progress of one analysis as Server-Sent Events:
//   status  {stage: 'asking_model'}   the model is being called
//   result  {...AnalysisResult}       the validated answer, or the detector answer with the reason
//   error   {message}
// POST, not GET: it can spend model quota, and the session cookie is not sent on cross-site POSTs.
// proxy.ts does not run for /api paths, so the session is checked here.
export async function POST(_request: Request, { params }: { params: Promise<{ traceId: string }> }) {
    if (!(await getSession())) return new Response('Unauthorized', { status: 401 });

    const { traceId } = await params;
    if (traceId.length === 0 || traceId.length > 36) return new Response('Bad trace id', { status: 400 });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const send = (event: string, data: unknown) =>
                controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            try {
                const analysis = await analyzeTrace(pool, traceId);
                if (!analysis) {
                    send('error', { message: 'Trace not found' });
                    return;
                }
                const result = await diagnoseTrace(analysis, {
                    provider: providerFromEnv(process.env),
                    store: pgStore(pool),
                    limits: limitsFromEnv(process.env),
                    timeoutMs: timeoutFromEnv(process.env),
                    onStage: (stage) => send('status', { stage }),
                });
                send('result', result);
            } catch (err) {
                console.error('[dashboard] analysis failed:', err);
                send('error', { message: 'The analysis failed' });
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform' },
    });
}
