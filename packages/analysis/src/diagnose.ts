import { buildEvidence } from './evidence';
import { detectorDiagnosis, type Diagnosis } from './fallback';
import { LlmError, toLlmError, type LlmFailure, type LlmProvider } from './llm/provider';
import { ANSWER_JSON_SCHEMA, SYSTEM_PROMPT, buildRetryPrompt, buildUserPrompt } from './prompt';
import type { AnalysisStore } from './store';
import type { TraceAnalysis } from './types';
import { validateAnswer } from './validate';

export type FallbackReason = 'disabled' | 'invalid_answer' | LlmFailure;

export interface AnalysisResult {
    source: 'llm' | 'detector';
    fallbackReason: FallbackReason | null; // why the detector answer is shown instead of a model answer
    cached: boolean;
    attempts: number;                      // model calls made for this result
    latencyMs: number | null;
    provider: string | null;
    model: string | null;
    summary: string;
    rootCause: Diagnosis['rootCause'];
    evidence: { spanId: string; note: string }[];
    confidence: 'low' | 'medium' | 'high' | null;
    checks: string[];
}

export interface DiagnoseOptions {
    provider: LlmProvider | null;
    store: AnalysisStore;
    limits: { perMinute: number; perDay: number } | null; // null = no limit (the evaluation throttles itself)
    timeoutMs: number;
    useCache?: boolean;     // default true
    useFindings?: boolean;  // false hides the detector findings from the model (the "model only" evaluation arm)
    onStage?: (stage: 'asking_model') => void;
}

function detectorResult(analysis: TraceAnalysis, reason: FallbackReason, extra: Partial<AnalysisResult> = {}): AnalysisResult {
    const d = detectorDiagnosis(analysis);
    return {
        source: 'detector',
        fallbackReason: reason,
        cached: false,
        attempts: 0,
        latencyMs: null,
        provider: null,
        model: null,
        summary: d.summary,
        rootCause: d.rootCause,
        evidence: [],
        confidence: null,
        checks: d.checks,
        ...extra,
    };
}

// Asks the model to explain the findings. Whatever goes wrong, the caller still gets an answer:
// the one built from the detectors alone.
export async function diagnoseTrace(analysis: TraceAnalysis, options: DiagnoseOptions): Promise<AnalysisResult> {
    const { provider, store, limits, timeoutMs, useCache = true, useFindings = true, onStage } = options;
    if (!provider) return detectorResult(analysis, 'disabled');

    const shown: TraceAnalysis = useFindings ? analysis : { ...analysis, findings: [], primary: null };
    const built = buildEvidence(shown);

    if (useCache) {
        const cached = await store.findCached(analysis.traceId, built.hash, provider.name, provider.model);
        if (cached) return { ...cached, cached: true };
    }

    if (limits) {
        const lastMinute = await store.countCalls(60_000);
        const lastDay = await store.countCalls(24 * 60 * 60_000);
        if (lastMinute >= limits.perMinute || lastDay >= limits.perDay) {
            return detectorResult(analysis, 'rate_limited');
        }
    }

    onStage?.('asking_model');
    const started = Date.now();
    const baseRecord = { traceId: analysis.traceId, evidenceHash: built.hash, provider: provider.name, model: provider.model };
    const firstPrompt = buildUserPrompt(built.evidence);
    let prompt = firstPrompt;
    let attempts = 0;
    let problems: string[] = [];

    // at most two tries: the second one tells the model what was wrong with its first answer
    while (attempts < 2) {
        attempts++;
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let raw: string;
        try {
            // The abort signal asks the client library to stop, but libraries do not always react to it
            // (one call hung for ten minutes). So the timeout is also enforced here, by racing the call.
            const call = provider.generate({ system: SYSTEM_PROMPT, user: prompt, schema: ANSWER_JSON_SCHEMA, signal: controller.signal });
            call.catch(() => {}); // if the timeout wins, a later failure of the call is ignored
            const timeout = new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                    controller.abort();
                    reject(new LlmError('timeout', 'request timed out'));
                }, timeoutMs);
            });
            raw = await Promise.race([call, timeout]);
        } catch (err) {
            const failure = toLlmError(err);
            const latencyMs = Date.now() - started;
            const result = detectorResult(analysis, failure.reason, { attempts, latencyMs, provider: provider.name, model: provider.model });
            await store.save({ ...baseRecord, status: 'error', attempts, latencyMs, result, error: failure.message.slice(0, 500) });
            return result;
        } finally {
            clearTimeout(timer);
        }

        const checked = validateAnswer(raw, built.evidence);
        if (checked.ok) {
            const a = checked.answer;
            const latencyMs = Date.now() - started;
            const result: AnalysisResult = {
                source: 'llm',
                fallbackReason: null,
                cached: false,
                attempts,
                latencyMs,
                provider: provider.name,
                model: provider.model,
                summary: a.summary,
                rootCause: {
                    kind: a.root_cause.kind,
                    service: a.root_cause.service,
                    operation: a.root_cause.operation,
                    spanId: built.refToSpanId[a.root_cause.span_ref] ?? null,
                },
                evidence: a.evidence.map((e) => ({ spanId: built.refToSpanId[e.span_ref]!, note: e.note })),
                confidence: a.confidence,
                checks: a.suggested_checks,
            };
            await store.save({ ...baseRecord, status: 'ok', attempts, latencyMs, result, error: null });
            return result;
        }

        problems = checked.problems;
        prompt = buildRetryPrompt(firstPrompt, raw, problems);
    }

    const latencyMs = Date.now() - started;
    const result = detectorResult(analysis, 'invalid_answer', { attempts, latencyMs, provider: provider.name, model: provider.model });
    await store.save({ ...baseRecord, status: 'fallback', attempts, latencyMs, result, error: problems.join(' | ').slice(0, 500) });
    return result;
}
