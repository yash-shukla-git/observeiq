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

const reasonTexts: Record<string, string> = {
    disabled: 'No model is configured, so this answer comes from the detectors only.',
    rate_limited: 'The model call limit was reached, so this answer comes from the detectors only.',
    timeout: 'The model took too long, so this answer comes from the detectors only.',
    unavailable: 'The model could not be reached, so this answer comes from the detectors only.',
    invalid_answer: 'The model answered twice with something that did not match the trace, so this answer comes from the detectors only.',
    error: 'The model call failed, so this answer comes from the detectors only.',
};

export function fallbackText(reason: string | null): string {
    return (reason && reasonTexts[reason]) || 'This answer comes from the detectors only.';
}
