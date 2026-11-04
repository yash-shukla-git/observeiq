import type { FindingKind, TraceAnalysis } from './types';

export interface Diagnosis {
    summary: string;
    rootCause: { kind: FindingKind | 'unknown'; service: string; operation: string; spanId: string | null };
    checks: string[];
}

const checksFor: Record<FindingKind, (service: string, operation: string) => string[]> = {
    latency_regression: (service, operation) => [
        `Look at what changed recently in ${service} (deploys, config, dependencies) that could slow ${operation}.`,
        `Compare slow and fast ${operation} spans and look for a tag or input they differ in.`,
    ],
    error_spike: (service, operation) => [
        `Open the failing ${operation} spans and read the error message.`,
        `Check whether ${service} or something it depends on is unhealthy.`,
    ],
    n_plus_one: (service, operation) => [
        `Find the loop in ${service} that runs ${operation} once per item.`,
        'Replace it with one batched query or a join.',
    ],
    retry_storm: (service, operation) => [
        `Find why ${operation} keeps failing in ${service}.`,
        'Add a retry limit with backoff, or a circuit breaker.',
    ],
    slow_downstream: (service, operation) => [
        `Check the latency and own dependencies of ${service} ${operation}.`,
        'Consider a timeout and a fallback for this call.',
    ],
};

// Plain answer built only from the detectors: a summary of the most likely cause and what to check next.
export function detectorDiagnosis(analysis: TraceAnalysis): Diagnosis {
    const primary = analysis.primary;
    if (!primary) {
        return {
            summary: 'No detector flagged anything unusual in this trace.',
            rootCause: { kind: 'unknown', service: '', operation: '', spanId: null },
            checks: [],
        };
    }
    return {
        summary: primary.message,
        rootCause: {
            kind: primary.kind,
            service: primary.service,
            operation: primary.operation,
            spanId: primary.spanIds[0] ?? null,
        },
        checks: checksFor[primary.kind](primary.service, primary.operation),
    };
}
