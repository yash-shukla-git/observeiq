import type { Pool } from 'pg';
import type { AnalysisConfig, Finding, OperationStats } from '../types';

// One query gives recent and baseline numbers for every service + operation.
// Recent = [anchor - recentMs, anchor], baseline = the baselineMs before that.
export async function getOperationStats(pool: Pool, anchor: number, cfg: AnalysisConfig): Promise<OperationStats[]> {
    const recentStart = anchor - cfg.recentMs;
    const baselineStart = recentStart - cfg.baselineMs;

    const result = await pool.query(
        `SELECT
            service_name, operation_name,
            COUNT(*) FILTER (WHERE start_time >= $1) AS recent_count,
            COUNT(*) FILTER (WHERE start_time <  $1) AS baseline_count,
            percentile_cont(0.99) WITHIN GROUP (ORDER BY duration) FILTER (WHERE start_time >= $1) AS recent_p99,
            percentile_cont(0.99) WITHIN GROUP (ORDER BY duration) FILTER (WHERE start_time <  $1) AS baseline_p99,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY duration) FILTER (WHERE start_time <  $1) AS baseline_p95,
            COUNT(*) FILTER (WHERE status = 'error' AND start_time >= $1) AS recent_errors,
            COUNT(*) FILTER (WHERE status = 'error' AND start_time <  $1) AS baseline_errors
         FROM spans
         WHERE start_time >= $2 AND start_time <= $3
         GROUP BY service_name, operation_name`,
        [recentStart, baselineStart, anchor]
    );

    // counts are BIGINT (strings), percentiles are null when a window has no rows
    return result.rows.map((r) => ({
        service: r.service_name,
        operation: r.operation_name,
        recentCount: Number(r.recent_count),
        baselineCount: Number(r.baseline_count),
        recentP99: Number(r.recent_p99 ?? 0),
        baselineP99: Number(r.baseline_p99 ?? 0),
        baselineP95: Number(r.baseline_p95 ?? 0),
        recentErrors: Number(r.recent_errors),
        baselineErrors: Number(r.baseline_errors),
    }));
}

const round = (n: number) => Math.round(n);

export function findLatencyRegressions(stats: OperationStats[], cfg: AnalysisConfig): Finding[] {
    const findings: Finding[] = [];
    for (const s of stats) {
        if (s.recentCount < cfg.minSamples || s.baselineCount < cfg.minSamples) continue;
        if (s.baselineP99 <= 0) continue;

        const ratio = s.recentP99 / s.baselineP99;
        const increase = s.recentP99 - s.baselineP99;
        if (ratio < cfg.regressionRatio || increase < cfg.regressionMinIncreaseMs) continue;

        findings.push({
            kind: 'latency_regression',
            service: s.service,
            operation: s.operation,
            spanIds: [],
            // 2x is 0.25, 4x is 0.5, 16x and above is 1
            severity: Math.min(1, Math.log2(ratio) / 4),
            message: `${s.service} ${s.operation}: p99 is ${round(s.recentP99)} ms, baseline ${round(s.baselineP99)} ms (${ratio.toFixed(1)}x)`,
            details: {
                recentP99Ms: round(s.recentP99),
                baselineP99Ms: round(s.baselineP99),
                ratio: Number(ratio.toFixed(1)),
                recentSpans: s.recentCount,
                baselineSpans: s.baselineCount,
            },
        });
    }
    return findings;
}

export function findErrorSpikes(stats: OperationStats[], cfg: AnalysisConfig): Finding[] {
    const findings: Finding[] = [];
    for (const s of stats) {
        if (s.recentCount < cfg.minSamples || s.baselineCount < cfg.minSamples) continue;

        const recentRate = s.recentErrors / s.recentCount;
        const baselineRate = s.baselineErrors / s.baselineCount;
        if (s.recentErrors < cfg.errorMinCount) continue;
        if (recentRate < Math.max(cfg.errorMinRate, cfg.errorRateRatio * baselineRate)) continue;

        findings.push({
            kind: 'error_spike',
            service: s.service,
            operation: s.operation,
            spanIds: [],
            severity: Math.min(1, recentRate),
            message: `${s.service} ${s.operation}: ${Math.round(recentRate * 100)}% of spans failed, baseline ${Math.round(baselineRate * 100)}%`,
            details: {
                recentErrorRatePct: Math.round(recentRate * 100),
                baselineErrorRatePct: Math.round(baselineRate * 100),
                recentErrors: s.recentErrors,
                recentSpans: s.recentCount,
            },
        });
    }
    return findings;
}
