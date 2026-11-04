import 'dotenv/config';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Pool } from 'pg';
import {
    analyzeTrace, defaultConfig, detectorDiagnosis, diagnoseTrace, pgStore, providerFromEnv,
    type AnalysisResult,
} from '@observeiq/analysis';
import { scenarios, type Variant } from './scenarios';
import { namesCause, scoreAnswer, summarise, type Answer, type TraceScore } from './score';
import { checkServices, clearFaults, sendOrders, setFaults, waitForSpans } from './traffic';

// npm run eval -- --mode detector --variant b
// modes:   detector  the detectors alone
//          llm       detectors + model (the product: a failed model answer falls back to the detector answer)
//          llm-only  the model alone, without the detector findings
// options: --variant a|b  --baseline 60  --fault 30  --traces 5  --scenario slow_db  --delay 6000 (ms between model calls)  --timeout 60000
// Needs the collector, the worker and the three demo services running (demo services with ENABLE_FAULTS=true).
// The llm modes also need GEMINI_API_KEY (or AI_PROVIDER=ollama with OLLAMA_MODEL).
// It EMPTIES the spans table, so it only runs against a local database.
const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};

const mode = arg('mode', 'detector');
const variant = arg('variant', 'a') as Variant;
const baselineCount = Number(arg('baseline', '60'));
const faultCount = Number(arg('fault', '30'));
const tracesPerScenario = Number(arg('traces', '5'));
const delayMs = Number(arg('delay', '6000'));
// longer than the product's 20 s on purpose: the evaluation measures the model, the number of calls above 20 s is reported separately
const timeoutMs = Number(arg('timeout', '60000'));
const only = arg('scenario', '');

if (!['detector', 'llm', 'llm-only'].includes(mode)) throw new Error(`unknown --mode ${mode}`);
if (variant !== 'a' && variant !== 'b') throw new Error('--variant must be a or b');

const dbHost = new URL(process.env.DATABASE_URL ?? 'postgres://missing').hostname;
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(dbHost)) {
    throw new Error(`refusing to run: DATABASE_URL points to ${dbHost}, this script empties the spans table`);
}

const provider = mode === 'detector' ? null : providerFromEnv(process.env);
if (mode !== 'detector' && !provider) {
    throw new Error('no model configured: set GEMINI_API_KEY in .env (or AI_PROVIDER=ollama and OLLAMA_MODEL)');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const store = pgStore(pool);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// evenly spaced picks, so the traces are not cherry-picked
function spread<T>(items: T[], n: number): T[] {
    if (items.length <= n) return items;
    return Array.from({ length: n }, (_, i) => items[Math.floor((i * items.length) / n)]!);
}

const percentile = (values: number[], p: number) => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
};
const median = (values: number[]) => percentile(values, 0.5);

async function main() {
    await checkServices();
    const results = [];
    let modelCalls = 0;

    for (const scenario of scenarios.filter((s) => !only || s.id === only)) {
        console.log(`\n== ${scenario.id}: ${scenario.description}`);
        await clearFaults();
        await pool.query('TRUNCATE spans');

        await sendOrders(baselineCount); // normal traffic first, this is the baseline
        await waitForSpans(pool);

        await setFaults(scenario.faults(variant));
        const faultStart = Date.now();
        const sent = await sendOrders(faultCount);
        await clearFaults();
        await waitForSpans(pool);
        console.log(`   fault traffic: ${sent.ok} orders ok, ${sent.failed} failed`);

        // "recent" is exactly the fault period, "baseline" is everything before it
        const anchor = Number((await pool.query('SELECT MAX(start_time + duration) AS t FROM spans')).rows[0].t);
        const config = { anchorMs: anchor, recentMs: anchor - faultStart + 500, baselineMs: 10 * 60_000 };

        const roots = await pool.query(
            'SELECT trace_id FROM spans WHERE parent_span_id IS NULL AND start_time >= $1 ORDER BY start_time',
            [faultStart]
        );
        const traceIds = spread<string>(roots.rows.map((r) => r.trace_id), tracesPerScenario);

        const traces = [];
        const scores: TraceScore[] = [];
        for (const traceId of traceIds) {
            const analysis = await analyzeTrace(pool, traceId, config);
            if (!analysis) continue;

            let answer: Answer | null = analysis.primary && {
                kind: analysis.primary.kind, service: analysis.primary.service, operation: analysis.primary.operation,
            };
            let text = detectorDiagnosis(analysis).summary;
            let model: Pick<AnalysisResult, 'source' | 'fallbackReason' | 'attempts' | 'latencyMs' | 'summary' | 'checks' | 'confidence'> | null = null;

            if (provider) {
                if (modelCalls > 0) await sleep(delayMs); // stay well under the free tier limits
                modelCalls++;
                const result = await diagnoseTrace(analysis, {
                    provider, store, limits: null, timeoutMs, useCache: false, useFindings: mode === 'llm',
                });
                const fromModel = result.source === 'llm' && result.rootCause.kind !== 'unknown';
                const detectorFallback = result.source === 'detector' && mode === 'llm'; // the product shows this answer
                answer = fromModel
                    ? { kind: result.rootCause.kind, service: result.rootCause.service, operation: result.rootCause.operation }
                    : detectorFallback ? answer : null;
                text = result.summary;
                model = {
                    source: result.source, fallbackReason: result.fallbackReason, attempts: result.attempts, latencyMs: result.latencyMs,
                    summary: result.summary, checks: result.checks, confidence: result.confidence,
                };
            }

            const score = scoreAnswer(answer, scenario.expected);
            scores.push(score);
            traces.push({
                traceId,
                answer,
                detectorFindings: analysis.findings.map((f) => ({ kind: f.kind, service: f.service, operation: f.operation, severity: Number(f.severity.toFixed(2)) })),
                explanationNamesCause: scenario.expected.length > 0 ? namesCause(text, scenario.expected) : null,
                model,
                score,
            });
            const note = model ? ` [${model.source}${model.fallbackReason ? ':' + model.fallbackReason : ''}, ${model.attempts} call(s)]` : '';
            console.log(`   ${traceId.slice(0, 8)}  ${answer ? `${answer.kind} @ ${answer.service} ${answer.operation}` : 'nothing flagged'}${note}`);
        }

        results.push({ scenario: scenario.id, expected: scenario.expected, summary: summarise(scenario.id, scores), traces });
    }
    await clearFaults();

    console.log('\nscenario              traces  flagged  culprit  kind  exact');
    for (const r of results) {
        const s = r.summary;
        console.log(`${s.scenario.padEnd(22)}${String(s.traces).padStart(6)}${(s.flaggedPct + '%').padStart(9)}${(s.culpritPct + '%').padStart(9)}${(s.kindPct + '%').padStart(6)}${(s.exactPct + '%').padStart(7)}`);
    }

    const faulty = results.filter((r) => r.expected.length > 0).flatMap((r) => r.traces);
    const healthy = results.filter((r) => r.expected.length === 0).flatMap((r) => r.traces);
    const rate = (items: { score: TraceScore }[], key: keyof TraceScore) =>
        items.length === 0 ? null : Math.round((items.filter((t) => t.score[key]).length / items.length) * 100);

    const modelRuns = results.flatMap((r) => r.traces).flatMap((t) => (t.model ? [t.model] : []));
    const overall = {
        faultTraces: faulty.length,
        culpritPct: rate(faulty, 'culprit'),
        exactPct: rate(faulty, 'exact'),
        explanationNamesCausePct: faulty.length === 0 ? null : Math.round((faulty.filter((t) => t.explanationNamesCause).length / faulty.length) * 100),
        healthyTraces: healthy.length,
        falsePositivePct: rate(healthy, 'flagged'),
        ...(provider ? {
            provider: provider.name,
            model: provider.model,
            modelCalls: modelRuns.length,
            answeredByModel: modelRuns.filter((m) => m.source === 'llm').length,
            answeredFirstTry: modelRuns.filter((m) => m.source === 'llm' && m.attempts === 1).length,
            answeredAfterRetry: modelRuns.filter((m) => m.source === 'llm' && m.attempts === 2).length,
            rejectedTwice: modelRuns.filter((m) => m.fallbackReason === 'invalid_answer').length,
            modelUnavailable: modelRuns.filter((m) => m.source === 'detector' && m.fallbackReason !== 'invalid_answer').length,
            timedOut: modelRuns.filter((m) => m.fallbackReason === 'timeout').length,
            medianLatencyMs: median(modelRuns.flatMap((m) => (m.latencyMs ? [m.latencyMs] : []))),
            p90LatencyMs: percentile(modelRuns.flatMap((m) => (m.latencyMs ? [m.latencyMs] : [])), 0.9),
            callsOver20s: modelRuns.filter((m) => (m.latencyMs ?? 0) > 20_000).length, // would have timed out with the product's default
        } : {}),
    };
    console.log(`\nfault traces: ${overall.faultTraces}, culprit ${overall.culpritPct}%, exact ${overall.exactPct}%, explanation names the cause ${overall.explanationNamesCausePct}%`);
    console.log(`healthy traces: ${overall.healthyTraces}, falsely flagged ${overall.falsePositivePct}%`);
    if (provider) console.log(JSON.stringify(overall, null, 2));

    let commit = 'unknown';
    try {
        commit = execSync('git rev-parse --short HEAD').toString().trim();
    } catch {
        // not a git checkout, leave it as unknown
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    mkdirSync('docs/eval-results', { recursive: true });
    const file = `docs/eval-results/${stamp}-${mode}-${variant}.json`;
    writeFileSync(file, JSON.stringify({
        mode, variant, commit,
        command: `npm run eval -- ${args.join(' ')}`.trim(),
        params: { baselineCount, faultCount, tracesPerScenario, delayMs, timeoutMs },
        thresholds: defaultConfig,
        overall, results,
    }, null, 2) + '\n');
    console.log(`\nresults saved to ${file}`);
}

main()
    .catch((err) => {
        console.error('[eval] failed:', err.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
