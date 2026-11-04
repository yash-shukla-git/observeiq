import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultConfig } from './config';
import { detectorDiagnosis } from './diagnosis';
import { span } from './testSpans';
import type { Finding, TraceAnalysis } from './types';

const base: TraceAnalysis = { traceId: 't', spans: [span('a', null)], totalMs: 10, stats: [], findings: [], primary: null, config: defaultConfig };

test('says so when nothing was flagged', () => {
    const d = detectorDiagnosis(base);
    assert.equal(d.rootCause.kind, 'unknown');
    assert.equal(d.checks.length, 0);
});

test('uses the primary finding for the summary, root cause and checks', () => {
    const f: Finding = { kind: 'retry_storm', service: 'order', operation: 'processPayment', spanIds: ['a'], severity: 1, message: 'retried 5 times', details: {} };
    const d = detectorDiagnosis({ ...base, findings: [f], primary: f });
    assert.equal(d.summary, 'retried 5 times');
    assert.deepEqual(d.rootCause, { kind: 'retry_storm', service: 'order', operation: 'processPayment', spanId: 'a' });
    assert.ok(d.checks.length >= 1);
});
