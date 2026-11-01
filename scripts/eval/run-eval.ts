import 'dotenv/config';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Pool } from 'pg';
import { analyzeTrace, defaultConfig } from '@observeiq/analysis';
import { scenarios, type Variant } from './scenarios';
import { scoreAnswer, summarise, type TraceScore } from './score';
import { checkServices, clearFaults, sendOrders, setFaults, waitForSpans } from './traffic';

// npm run eval -- --mode detector --variant a
// options: --variant a|b  --baseline 60  --fault 30  --traces 5  --scenario slow_db
// Needs the collector, the worker and the three demo services running (demo services with ENABLE_FAULTS=true).
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
const only = arg('scenario', '');

if (mode !== 'detector') throw new Error(`unknown --mode ${mode}`);
if (variant !== 'a' && variant !== 'b') throw new Error('--variant must be a or b');

const dbHost = new URL(process.env.DATABASE_URL ?? 'postgres://missing').hostname;
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(dbHost)) {
    throw new Error(`refusing to run: DATABASE_URL points to ${dbHost}, this script empties the spans table`);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// evenly spaced picks, so the traces are not cherry-picked
function spread<T>(items: T[], n: number): T[] {
    if (items.length <= n) return items;
    return Array.from({ length: n }, (_, i) => items[Math.floor((i * items.length) / n)]!);
}

async function main() {
    await checkServices();
    const results = [];

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
            const primary = analysis.primary;
            const score = scoreAnswer(primary, scenario.expected);
            scores.push(score);
            traces.push({
                traceId,
                primary: primary && { kind: primary.kind, service: primary.service, operation: primary.operation },
                findings: analysis.findings.map((f) => ({ kind: f.kind, service: f.service, operation: f.operation, severity: Number(f.severity.toFixed(2)) })),
                score,
            });
            console.log(`   ${traceId.slice(0, 8)}  ${primary ? `${primary.kind} @ ${primary.service} ${primary.operation}` : 'nothing flagged'}`);
        }

        const summary = summarise(scenario.id, scores);
        results.push({ scenario: scenario.id, expected: scenario.expected, summary, traces });
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
    const overall = {
        faultTraces: faulty.length,
        culpritPct: rate(faulty, 'culprit'),
        exactPct: rate(faulty, 'exact'),
        healthyTraces: healthy.length,
        falsePositivePct: rate(healthy, 'flagged'),
    };
    console.log(`\nfault traces: ${overall.faultTraces}, culprit ${overall.culpritPct}%, exact ${overall.exactPct}%`);
    console.log(`healthy traces: ${overall.healthyTraces}, falsely flagged ${overall.falsePositivePct}%`);

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
        params: { baselineCount, faultCount, tracesPerScenario },
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
