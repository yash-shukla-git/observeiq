export interface SpanRow {
    spanId: string;
    traceId: string;
    parentSpanId: string | null;
    service: string;
    operation: string;
    startTime: number; // Unix ms
    duration: number;  // ms
    status: 'ok' | 'error';
    error: string | null;
    tags: Record<string, unknown>;
}

// Recent vs baseline numbers for one service + operation
export interface OperationStats {
    service: string;
    operation: string;
    recentCount: number;
    baselineCount: number;
    recentP99: number;
    baselineP99: number;
    baselineP95: number;
    recentErrors: number;
    baselineErrors: number;
}

export type FindingKind =
    | 'latency_regression'
    | 'error_spike'
    | 'n_plus_one'
    | 'retry_storm'
    | 'slow_downstream';

export interface Finding {
    kind: FindingKind;
    service: string;
    operation: string;
    spanIds: string[];  // spans of the analysed trace this finding is about
    severity: number;   // 0 to 1, only used to order findings, not a probability
    message: string;
    details: Record<string, number | string>;
}

export interface AnalysisConfig {
    recentMs: number;       // window being checked
    baselineMs: number;     // window before it, used as "normal"
    anchorMs: number | null; // end of the recent window, null = end of the analysed trace
    minSamples: number;     // p99 of a handful of spans means nothing, so smaller windows are skipped
    regressionRatio: number;
    regressionMinIncreaseMs: number;
    errorMinCount: number;
    errorMinRate: number;
    errorRateRatio: number;
    repeatMin: number;      // identical sibling spans needed to call it an N+1
    retryMin: number;       // identical sibling spans, mostly failing, to call it a retry storm
    slowRatio: number;
    slowNoBaselineShare: number;
    slowNoBaselineMinMs: number;
}

export interface TraceAnalysis {
    traceId: string;
    spans: SpanRow[];
    totalMs: number;
    stats: OperationStats[]; // only operations that appear in this trace
    findings: Finding[];     // highest severity first
    primary: Finding | null; // the finding picked as the most likely cause
    config: AnalysisConfig;
}
