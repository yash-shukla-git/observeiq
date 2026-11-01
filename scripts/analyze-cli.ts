import 'dotenv/config';
import { Pool } from 'pg';
import { analyzeTrace, buildEvidence, detectorDiagnosis } from '@observeiq/analysis';

// npm run analyze -- <traceId>
// npm run analyze -- --latest          analyse the newest trace
// add --evidence to print the summary the model would receive
const args = process.argv.slice(2);
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? true : undefined,
});

async function main() {
    let traceId = args.find((a) => !a.startsWith('--'));
    if (args.includes('--latest')) {
        const latest = await pool.query('SELECT trace_id FROM spans GROUP BY trace_id ORDER BY MIN(start_time) DESC LIMIT 1');
        traceId = latest.rows[0]?.trace_id;
    }
    if (!traceId) {
        console.error('Usage: npm run analyze -- <traceId> | --latest [--evidence]');
        process.exitCode = 1;
        return;
    }

    const analysis = await analyzeTrace(pool, traceId);
    if (!analysis) {
        console.error(`Trace ${traceId} not found`);
        process.exitCode = 1;
        return;
    }

    const errors = analysis.spans.filter((s) => s.status === 'error').length;
    console.log(`trace ${traceId}: ${analysis.spans.length} spans, ${analysis.totalMs} ms, ${errors} failed`);

    if (analysis.findings.length === 0) {
        console.log('findings: none');
    } else {
        console.log('findings:');
        for (const f of analysis.findings) {
            const mark = f === analysis.primary ? '*' : ' ';
            console.log(` ${mark} [${f.severity.toFixed(2)}] ${f.kind.padEnd(18)} ${f.message}`);
        }
        console.log('(* = picked as the most likely cause)');
    }

    const diagnosis = detectorDiagnosis(analysis);
    console.log(`\ndetector-only diagnosis: ${diagnosis.summary}`);
    diagnosis.checks.forEach((c) => console.log(`  - ${c}`));

    const { evidence, hash } = buildEvidence(analysis);
    console.log(`\nevidence for the model: ${evidence.spans.length} spans, ${JSON.stringify(evidence).length} bytes, hash ${hash.slice(0, 12)}`);
    if (args.includes('--evidence')) console.log(JSON.stringify(evidence, null, 2));
}

main()
    .catch((err) => {
        console.error('[analyze] failed:', err);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
