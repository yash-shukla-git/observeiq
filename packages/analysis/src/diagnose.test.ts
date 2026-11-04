import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultConfig } from './config';
import { diagnoseTrace, type AnalysisResult } from './diagnose';
import { LlmError, createFakeProvider } from './llm';
import type { LlmProvider } from './llm/provider';
import { span } from './testSpans';
import type { AnalysisStore, RunRecord } from './store';
import type { Finding, TraceAnalysis } from './types';

const spans = [
    span('r', null, { service: 'order', operation: 'POST /order', startTime: 1000, duration: 900 }),
    span('q', 'r', { service: 'inventory', operation: 'db.query', startTime: 1010, duration: 800 }),
];
const finding: Finding = {
    kind: 'latency_regression', service: 'inventory', operation: 'db.query', spanIds: ['q'],
    severity: 0.9, message: 'inventory db.query: p99 is 800 ms, baseline 40 ms (20.0x)', details: {},
};
const analysis: TraceAnalysis = { traceId: 't1', spans, totalMs: 900, stats: [], findings: [finding], primary: finding, config: defaultConfig };

const good = JSON.stringify({
    summary: 'The inventory query is much slower than normal.',
    root_cause: { kind: 'latency_regression', span_ref: 'S2', service: 'inventory', operation: 'db.query' },
    evidence: [{ span_ref: 'S2', note: 'took 800 ms' }],
    confidence: 'high',
    suggested_checks: ['Look at the query plan'],
});
const invented = good.replace(/S2/g, 'S9');

function memoryStore(callsInLastMinute = 0) {
    const runs: RunRecord[] = [];
    const store: AnalysisStore = {
        async findCached(traceId, hash, provider, model) {
            const hit = [...runs].reverse().find((r) => r.status === 'ok' && r.traceId === traceId && r.evidenceHash === hash && r.provider === provider && r.model === model);
            return hit?.result ?? null;
        },
        async countCalls() { return callsInLastMinute; },
        async save(run) { runs.push(run); },
    };
    return { store, runs };
}

const base = { limits: null, timeoutMs: 1000 };

test('without a provider the detector answer is returned', async () => {
    const { store } = memoryStore();
    const result = await diagnoseTrace(analysis, { ...base, provider: null, store });
    assert.equal(result.source, 'detector');
    assert.equal(result.fallbackReason, 'disabled');
    assert.equal(result.rootCause.service, 'inventory');
});

test('a valid answer is returned with real span ids and saved', async () => {
    const { store, runs } = memoryStore();
    const provider = createFakeProvider([good]);
    const result = await diagnoseTrace(analysis, { ...base, provider, store });
    assert.equal(result.source, 'llm');
    assert.equal(result.attempts, 1);
    assert.equal(result.rootCause.spanId, 'q'); // S2 mapped back to the real id
    assert.equal(result.evidence[0]!.spanId, 'q');
    assert.equal(runs.length, 1);
    assert.equal(runs[0]!.status, 'ok');
});

test('the model never receives real span ids, only S1, S2', async () => {
    const { store } = memoryStore();
    const provider = createFakeProvider([good]);
    await diagnoseTrace(analysis, { ...base, provider, store });
    assert.ok(!provider.requests[0]!.user.includes('"q"'));
    assert.match(provider.requests[0]!.user, /S2/);
});

test('an invented span is rejected, the model is told why, and the second answer is used', async () => {
    const { store, runs } = memoryStore();
    const provider = createFakeProvider([invented, good]);
    const result = await diagnoseTrace(analysis, { ...base, provider, store });
    assert.equal(result.source, 'llm');
    assert.equal(result.attempts, 2);
    assert.equal(provider.requests.length, 2);
    assert.match(provider.requests[1]!.user, /S9, which is not in the evidence/);
    assert.equal(runs[0]!.attempts, 2);
});

test('two rejected answers fall back to the detector answer', async () => {
    const { store, runs } = memoryStore();
    const provider = createFakeProvider([invented, 'not json']);
    const result = await diagnoseTrace(analysis, { ...base, provider, store });
    assert.equal(result.source, 'detector');
    assert.equal(result.fallbackReason, 'invalid_answer');
    assert.equal(result.attempts, 2);
    assert.equal(result.rootCause.operation, 'db.query');
    assert.equal(runs[0]!.status, 'fallback');
});

test('a provider failure falls back without retrying', async () => {
    for (const reason of ['rate_limited', 'unavailable', 'error'] as const) {
        const { store, runs } = memoryStore();
        const provider = createFakeProvider([new LlmError(reason, 'boom')]);
        const result = await diagnoseTrace(analysis, { ...base, provider, store });
        assert.equal(result.source, 'detector');
        assert.equal(result.fallbackReason, reason);
        assert.equal(provider.requests.length, 1);
        assert.equal(runs[0]!.status, 'error');
    }
});

test('a model that takes too long is cut off', async () => {
    const { store } = memoryStore();
    const slow: LlmProvider = {
        name: 'slow', model: 'slow-model',
        generate: ({ signal }) => new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }),
    };
    const result = await diagnoseTrace(analysis, { limits: null, timeoutMs: 20, provider: slow, store });
    assert.equal(result.fallbackReason, 'timeout');
    assert.equal(result.source, 'detector');
});

test('a model that ignores the abort signal is still cut off on time', async () => {
    const { store } = memoryStore();
    const stuck: LlmProvider = { name: 'stuck', model: 'stuck-model', generate: () => new Promise(() => {}) }; // never answers, never rejects
    const started = Date.now();
    const result = await diagnoseTrace(analysis, { limits: null, timeoutMs: 30, provider: stuck, store });
    assert.equal(result.fallbackReason, 'timeout');
    assert.ok(Date.now() - started < 1000);
});

test('the same evidence is answered from the cache, without calling the model again', async () => {
    const { store } = memoryStore();
    const provider = createFakeProvider([good]);
    await diagnoseTrace(analysis, { ...base, provider, store });
    const second = await diagnoseTrace(analysis, { ...base, provider, store });
    assert.equal(second.cached, true);
    assert.equal(second.source, 'llm');
    assert.equal(provider.requests.length, 1);
});

test('the cache can be switched off', async () => {
    const { store } = memoryStore();
    const provider = createFakeProvider([good, good]);
    await diagnoseTrace(analysis, { ...base, provider, store });
    await diagnoseTrace(analysis, { ...base, provider, store, useCache: false });
    assert.equal(provider.requests.length, 2);
});

test('over the rate limit the model is not called', async () => {
    const { store } = memoryStore(5);
    const provider = createFakeProvider([good]);
    const result = await diagnoseTrace(analysis, { provider, store, limits: { perMinute: 5, perDay: 100 }, timeoutMs: 1000 });
    assert.equal(result.fallbackReason, 'rate_limited');
    assert.equal(provider.requests.length, 0);
});

test('the model-only arm hides the findings', async () => {
    const { store } = memoryStore();
    const provider = createFakeProvider([good]);
    await diagnoseTrace(analysis, { ...base, provider, store, useFindings: false });
    assert.match(provider.requests[0]!.user, /"findings":\[\]/);
});

test('the result type carries everything the dashboard needs', async () => {
    const { store } = memoryStore();
    const result: AnalysisResult = await diagnoseTrace(analysis, { ...base, provider: createFakeProvider([good]), store });
    assert.deepEqual(Object.keys(result).sort(), [
        'attempts', 'cached', 'checks', 'confidence', 'evidence', 'fallbackReason',
        'latencyMs', 'model', 'provider', 'rootCause', 'source', 'summary',
    ]);
});
