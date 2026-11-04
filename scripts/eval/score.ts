import type { Expected } from './scenarios';

export interface Answer {
    kind: string;
    service: string;
    operation: string;
}

export interface TraceScore {
    flagged: boolean;  // the method said something was wrong
    culprit: boolean;  // right service and operation
    kind: boolean;     // right kind of problem
    exact: boolean;    // both, for the same expected answer
}

// answer = null means the method found nothing
export function scoreAnswer(answer: Answer | null, expected: Expected[]): TraceScore {
    if (!answer) return { flagged: false, culprit: false, kind: false, exact: false };
    const sameSpot = (e: Expected) => e.service === answer.service && e.operation === answer.operation;
    const sameKind = (e: Expected) => e.kind === answer.kind;
    return {
        flagged: true,
        culprit: expected.some(sameSpot),
        kind: expected.some(sameKind),
        exact: expected.some((e) => sameSpot(e) && sameKind(e)),
    };
}

export interface SummaryRow {
    scenario: string;
    traces: number;
    flaggedPct: number;
    culpritPct: number;
    kindPct: number;
    exactPct: number;
}

const pct = (part: number, total: number) => (total === 0 ? 0 : Math.round((part / total) * 100));

export function summarise(scenario: string, scores: TraceScore[]): SummaryRow {
    const n = scores.length;
    return {
        scenario,
        traces: n,
        flaggedPct: pct(scores.filter((s) => s.flagged).length, n),
        culpritPct: pct(scores.filter((s) => s.culprit).length, n),
        kindPct: pct(scores.filter((s) => s.kind).length, n),
        exactPct: pct(scores.filter((s) => s.exact).length, n),
    };
}

// Does the written explanation name the expected service and operation? A simple rule, no second model involved.
// The service must be mentioned (without "-service"), and so must a word from the operation name
// ("db.query" -> "query", "processPayment" -> "payment"). Words are compared by their first letters, so
// "queries" counts for "query".
const words = (text: string) =>
    text.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4);

export function namesCause(text: string, expected: Expected[]): boolean {
    const lower = text.toLowerCase();
    return expected.some(
        (e) =>
            lower.includes(e.service.replace(/-service$/, '').toLowerCase()) &&
            words(e.operation).some((w) => lower.includes(w.slice(0, Math.max(4, w.length - 2))))
    );
}
