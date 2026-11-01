import type { Finding, SpanRow } from '../types';
import { isAncestor } from '../spans';

// Picks the finding that is most likely the cause.
// A finding on a span that has another finding somewhere below it is treated as a symptom:
// the slow or failing child is what makes the parent slow or failing.
// Among the rest, the highest severity wins.
export function pickPrimary(findings: Finding[], spans: SpanRow[]): Finding | null {
    if (findings.length === 0) return null;

    const byId = new Map(spans.map((s) => [s.spanId, s]));
    const representative = (f: Finding): SpanRow | undefined => {
        for (const id of f.spanIds) {
            const span = byId.get(id);
            if (span) return span;
        }
        return undefined;
    };

    const causes = findings.filter((f) => {
        const mine = representative(f);
        if (!mine) return true;
        return !findings.some((other) => {
            if (other === f) return false;
            const theirs = representative(other);
            return theirs !== undefined && isAncestor(mine, theirs, byId);
        });
    });

    const pool = causes.length > 0 ? causes : findings;
    return [...pool].sort((a, b) => b.severity - a.severity)[0] ?? null;
}
