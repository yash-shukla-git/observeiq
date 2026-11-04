const kindLabels: Record<string, string> = {
    latency_regression: 'Latency regression',
    error_spike: 'Error spike',
    n_plus_one: 'Repeated identical calls (N+1)',
    retry_storm: 'Retry storm',
    slow_downstream: 'Slow downstream call',
    unknown: 'Unclear',
};

export function kindLabel(kind: string): string {
    return kindLabels[kind] ?? kind;
}
