import { createHash } from 'crypto';
import { selfTimes } from './spans';
import type { Finding, SpanRow, TraceAnalysis } from './types';

// The model never sees raw spans. It gets this small summary, with spans renamed S1, S2, ...
// so answers can only point at spans that are really in the evidence.
const MAX_SPANS = 25;
const MAX_REFS_PER_FINDING = 3;
const ALLOWED_TAGS = ['http.method', 'http.status_code', 'db.system', 'db.statement', 'peer.service'];

export interface EvidenceSpan {
    ref: string;
    parentRef: string | null;
    service: string;
    operation: string;
    durationMs: number;
    selfMs: number;
    status: 'ok' | 'error';
    error?: string;
    tags?: Record<string, string | number | boolean>;
    baselineP95Ms?: number;
}

export interface EvidenceFinding {
    kind: Finding['kind'];
    service: string;
    operation: string;
    refs: string[];
    severity: number;
    message: string;
    details: Record<string, number | string>;
}

export interface Evidence {
    trace: { totalMs: number; spanCount: number; errorSpanCount: number; rootService: string; rootOperation: string };
    spans: EvidenceSpan[];
    findings: EvidenceFinding[];
    primaryFinding: number | null; // index into findings, the detector's own pick
}

export interface BuiltEvidence {
    evidence: Evidence;
    refToSpanId: Record<string, string>; // stays on the server
    hash: string;
}

function cleanTags(tags: Record<string, unknown>): Record<string, string | number | boolean> | undefined {
    const result: Record<string, string | number | boolean> = {};
    for (const key of ALLOWED_TAGS) {
        const value = tags[key];
        if (typeof value === 'string') result[key] = value.slice(0, key === 'db.statement' ? 120 : 80);
        else if (typeof value === 'number' || typeof value === 'boolean') result[key] = value;
    }
    return Object.keys(result).length > 0 ? result : undefined;
}

function pickSpans(analysis: TraceAnalysis, self: Map<string, number>): SpanRow[] {
    const byId = new Map(analysis.spans.map((s) => [s.spanId, s]));
    const chosen = new Set<string>();
    const add = (id: string) => {
        if (chosen.size < MAX_SPANS && byId.has(id)) chosen.add(id);
    };

    // spans the detectors talk about come first, then failing spans, then the biggest self time
    for (const f of analysis.findings) f.spanIds.slice(0, MAX_REFS_PER_FINDING).forEach(add);
    analysis.spans
        .filter((s) => s.status === 'error')
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 5)
        .forEach((s) => add(s.spanId));
    [...analysis.spans]
        .sort((a, b) => (self.get(b.spanId) ?? 0) - (self.get(a.spanId) ?? 0))
        .slice(0, 10)
        .forEach((s) => add(s.spanId));

    // parents give the tree its shape
    for (const id of [...chosen]) {
        let parent = byId.get(id)?.parentSpanId;
        while (parent) {
            add(parent);
            parent = byId.get(parent)?.parentSpanId;
        }
    }

    return analysis.spans
        .filter((s) => chosen.has(s.spanId))
        .sort((a, b) => a.startTime - b.startTime || a.spanId.localeCompare(b.spanId));
}

export function buildEvidence(analysis: TraceAnalysis): BuiltEvidence {
    const self = selfTimes(analysis.spans);
    const selected = pickSpans(analysis, self);
    const byId = new Map(analysis.spans.map((s) => [s.spanId, s]));

    const refOf = new Map<string, string>();
    selected.forEach((s, i) => refOf.set(s.spanId, `S${i + 1}`));

    const nearestRef = (span: SpanRow): string | null => {
        let parent = span.parentSpanId;
        while (parent) {
            const ref = refOf.get(parent);
            if (ref) return ref;
            parent = byId.get(parent)?.parentSpanId ?? null;
        }
        return null;
    };

    const spans: EvidenceSpan[] = selected.map((s) => {
        const stat = analysis.stats.find((x) => x.service === s.service && x.operation === s.operation);
        const tags = cleanTags(s.tags);
        return {
            ref: refOf.get(s.spanId)!,
            parentRef: nearestRef(s),
            service: s.service,
            operation: s.operation,
            durationMs: s.duration,
            selfMs: Math.round(self.get(s.spanId) ?? 0),
            status: s.status,
            ...(s.error ? { error: s.error.slice(0, 200) } : {}),
            ...(tags ? { tags } : {}),
            ...(stat && stat.baselineCount > 0 ? { baselineP95Ms: Math.round(stat.baselineP95) } : {}),
        };
    });

    const findings: EvidenceFinding[] = analysis.findings.map((f) => ({
        kind: f.kind,
        service: f.service,
        operation: f.operation,
        refs: f.spanIds.slice(0, MAX_REFS_PER_FINDING).map((id) => refOf.get(id)).filter((r): r is string => !!r),
        severity: Number(f.severity.toFixed(2)),
        message: f.message,
        details: f.details,
    }));

    const root = analysis.spans.find((s) => !s.parentSpanId) ?? analysis.spans[0]!;
    const evidence: Evidence = {
        trace: {
            totalMs: analysis.totalMs,
            spanCount: analysis.spans.length,
            errorSpanCount: analysis.spans.filter((s) => s.status === 'error').length,
            rootService: root.service,
            rootOperation: root.operation,
        },
        spans,
        findings,
        primaryFinding: analysis.primary ? analysis.findings.indexOf(analysis.primary) : null,
    };

    const refToSpanId: Record<string, string> = {};
    for (const [spanId, ref] of refOf) refToSpanId[ref] = spanId;

    const hash = createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
    return { evidence, refToSpanId, hash };
}
