import { z } from 'zod';
import type { Evidence } from './evidence';
import { FINDING_KINDS } from './prompt';

export const answerSchema = z.object({
    summary: z.string().min(1).max(400),
    root_cause: z.object({
        kind: z.enum(FINDING_KINDS),
        span_ref: z.string(),
        service: z.string(),
        operation: z.string(),
    }),
    evidence: z.array(z.object({ span_ref: z.string(), note: z.string().min(1).max(200) })).min(1).max(5),
    confidence: z.enum(['low', 'medium', 'high']),
    suggested_checks: z.array(z.string().min(1).max(160)).min(1).max(3),
});

export type ModelAnswer = z.infer<typeof answerSchema>;

export type Validation = { ok: true; answer: ModelAnswer } | { ok: false; problems: string[] };

// Models sometimes wrap JSON in a markdown fence even when asked not to
function stripFence(text: string): string {
    const match = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    return match ? match[1]! : text.trim();
}

// Checks the shape, and that every cited span really exists in the evidence.
export function validateAnswer(raw: string, evidence: Evidence): Validation {
    let parsed: unknown;
    try {
        parsed = JSON.parse(stripFence(raw));
    } catch {
        return { ok: false, problems: ['The answer is not valid JSON.'] };
    }

    const result = answerSchema.safeParse(parsed);
    if (!result.success) {
        const problems = result.error.issues.map((i) => `${i.path.join('.') || 'answer'}: ${i.message}`);
        return { ok: false, problems };
    }
    const answer = result.data;

    const spans = new Map(evidence.spans.map((s) => [s.ref, s]));
    const problems: string[] = [];
    const known = [...spans.keys()].join(', ');

    for (const ref of [answer.root_cause.span_ref, ...answer.evidence.map((e) => e.span_ref)]) {
        if (!spans.has(ref)) problems.push(`The answer cites span ${ref}, which is not in the evidence. Known spans: ${known}.`);
    }

    const cited = spans.get(answer.root_cause.span_ref);
    if (cited && (cited.service !== answer.root_cause.service || cited.operation !== answer.root_cause.operation)) {
        problems.push(
            `root_cause says ${answer.root_cause.service} ${answer.root_cause.operation}, but ${cited.ref} is ${cited.service} ${cited.operation}.`
        );
    }

    return problems.length > 0 ? { ok: false, problems } : { ok: true, answer };
}
