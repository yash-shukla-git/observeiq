import type { Pool } from 'pg';
import { resolveConfig } from '../config';
import { loadTraceSpans, traceEnd, traceTotalMs } from '../spans';
import type { AnalysisConfig, Finding, SpanRow, TraceAnalysis } from '../types';
import { pickPrimary } from './primary';
import { findRepeats, findSlowDownstream } from './trace';
import { findErrorSpikes, findLatencyRegressions, getOperationStats } from './window';

// Window findings are about an operation in general. Link them to the slowest spans of that operation in this trace.
function attachSpans(finding: Finding, spans: SpanRow[]): Finding {
    const spanIds = spans
        .filter((s) => s.service === finding.service && s.operation === finding.operation)
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 3)
        .map((s) => s.spanId);
    return { ...finding, spanIds };
}

export async function analyzeTrace(
    pool: Pool,
    traceId: string,
    partialConfig: Partial<AnalysisConfig> = {}
): Promise<TraceAnalysis | null> {
    const config = resolveConfig(partialConfig);
    const spans = await loadTraceSpans(pool, traceId);
    if (spans.length === 0) return null;

    const anchor = config.anchorMs ?? traceEnd(spans);
    const allStats = await getOperationStats(pool, anchor, config);
    const inTrace = new Set(spans.map((s) => `${s.service}|${s.operation}`));
    const stats = allStats.filter((s) => inTrace.has(`${s.service}|${s.operation}`));

    const windowFindings = [
        ...findLatencyRegressions(stats, config),
        ...findErrorSpikes(stats, config),
    ].map((f) => attachSpans(f, spans));

    const findings = [
        ...windowFindings,
        ...findRepeats(spans, config),
        ...findSlowDownstream(spans, stats, config),
    ].sort((a, b) => b.severity - a.severity);

    return {
        traceId,
        spans,
        totalMs: traceTotalMs(spans),
        stats,
        findings,
        primary: pickPrimary(findings, spans),
        config,
    };
}

export { pickPrimary } from './primary';
export { findRepeats, findSlowDownstream } from './trace';
export { findErrorSpikes, findLatencyRegressions, getOperationStats } from './window';
