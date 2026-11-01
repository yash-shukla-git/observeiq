import type { AnalysisConfig, Finding, OperationStats, SpanRow } from '../types';
import { traceTotalMs } from '../spans';

// Identical sibling spans (same parent, service and operation) inside one trace.
// Mostly failing = retry storm, otherwise = the same call repeated many times (N+1).
export function findRepeats(spans: SpanRow[], cfg: AnalysisConfig): Finding[] {
    const total = traceTotalMs(spans);
    const groups = new Map<string, SpanRow[]>();
    for (const s of spans) {
        const key = `${s.parentSpanId}|${s.service}|${s.operation}`;
        groups.set(key, [...(groups.get(key) ?? []), s]);
    }

    const findings: Finding[] = [];
    for (const group of groups.values()) {
        const first = group[0]!;
        const errors = group.filter((s) => s.status === 'error').length;
        const totalMs = group.reduce((sum, s) => sum + s.duration, 0);
        const spanIds = group.map((s) => s.spanId);

        if (group.length >= cfg.retryMin && errors / group.length >= 0.5) {
            findings.push({
                kind: 'retry_storm',
                service: first.service,
                operation: first.operation,
                spanIds,
                severity: Math.min(1, 0.4 + 0.1 * group.length),
                message: `${first.service} ${first.operation} was attempted ${group.length} times in one request, ${errors} failed`,
                details: { attempts: group.length, failedAttempts: errors, totalMs },
            });
        } else if (group.length >= cfg.repeatMin) {
            const statement = first.tags['db.statement'];
            findings.push({
                kind: 'n_plus_one',
                service: first.service,
                operation: first.operation,
                spanIds,
                severity: total > 0 ? Math.min(1, totalMs / total) : 0,
                message: `${first.service} ${first.operation} ran ${group.length} times in one request (${totalMs} ms in total)`,
                details: {
                    count: group.length,
                    totalMs,
                    ...(typeof statement === 'string' ? { statement: statement.slice(0, 120) } : {}),
                },
            });
        }
    }
    return findings;
}

// A call into another service that is much slower than that operation normally is.
export function findSlowDownstream(spans: SpanRow[], stats: OperationStats[], cfg: AnalysisConfig): Finding[] {
    const byId = new Map(spans.map((s) => [s.spanId, s]));
    const total = traceTotalMs(spans);
    const findings: Finding[] = [];

    for (const s of spans) {
        const parent = s.parentSpanId ? byId.get(s.parentSpanId) : undefined;
        if (!parent || parent.service === s.service) continue; // only calls that cross a service boundary

        const stat = stats.find((x) => x.service === s.service && x.operation === s.operation);
        const share = total > 0 ? s.duration / total : 0;

        if (stat && stat.baselineCount >= cfg.minSamples && stat.baselineP95 > 0) {
            const tooSlow =
                s.duration >= cfg.slowRatio * stat.baselineP95 &&
                s.duration - stat.baselineP95 >= cfg.regressionMinIncreaseMs;
            if (!tooSlow) continue;
            findings.push({
                kind: 'slow_downstream',
                service: s.service,
                operation: s.operation,
                spanIds: [s.spanId],
                severity: Math.min(1, share),
                message: `call to ${s.service} ${s.operation} took ${s.duration} ms, its normal p95 is ${Math.round(stat.baselineP95)} ms`,
                details: { durationMs: s.duration, baselineP95Ms: Math.round(stat.baselineP95), sharePct: Math.round(share * 100) },
            });
        } else if (share >= cfg.slowNoBaselineShare && s.duration >= cfg.slowNoBaselineMinMs) {
            // no history to compare with, so only a clearly dominant slow call is reported
            findings.push({
                kind: 'slow_downstream',
                service: s.service,
                operation: s.operation,
                spanIds: [s.spanId],
                severity: Math.min(1, share),
                message: `call to ${s.service} ${s.operation} took ${s.duration} ms, ${Math.round(share * 100)}% of the request (no baseline yet)`,
                details: { durationMs: s.duration, sharePct: Math.round(share * 100) },
            });
        }
    }
    return findings;
}
