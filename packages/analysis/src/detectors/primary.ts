import type { Finding, SpanRow } from '../types';
import { isAncestor } from '../spans';

// Picks the finding that is most likely the cause.
// A finding on a span that has another finding somewhere below it is treated as a symptom:
// the slow or failing child is what makes the parent slow or failing.
// Among the rest, the highest severity wins.
export function pickPrimary(findings: Finding[], spans: SpanRow[]): Finding | null {
    if (findings.length === 0) return null;

    const byId = new Map(spans.map((s) => [s.spanId, s]));
    const spansOf = (f: Finding): SpanRow[] =>
        f.spanIds.map((id) => byId.get(id)).filter((s): s is SpanRow => s !== undefined);

    // f is a symptom when some span of another finding sits below one of its own spans
    const causes = findings.filter((f) => {
        const mine = spansOf(f);
        if (mine.length === 0) return true;
        return !findings.some(
            (other) =>
                other !== f &&
                spansOf(other).some((theirs) => mine.some((m) => isAncestor(m, theirs, byId)))
        );
    });

    const pool = causes.length > 0 ? causes : findings;
    return [...pool].sort((a, b) => b.severity - a.severity)[0] ?? null;
}
