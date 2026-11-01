import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidence } from './evidence';
import { defaultConfig } from './config';
import { span } from './testSpans';
import type { Finding, SpanRow, TraceAnalysis } from './types';

function analysisOf(spans: SpanRow[], findings: Finding[] = []): TraceAnalysis {
    return { traceId: 't1', spans, totalMs: 500, stats: [], findings, primary: findings[0] ?? null, config: defaultConfig };
}

const spans = [
    span('root-id', null, { service: 'order', operation: 'POST /order', startTime: 1000, duration: 500 }),
    span('child-id', 'root-id', {
        service: 'inventory', operation: 'db.query', startTime: 1010, duration: 400,
        tags: { 'db.statement': 'SELECT ' + 'x'.repeat(300), 'user.email': 'person@example.com', 'http.method': 'POST' },
    }),
];

test('spans are renamed S1, S2 in start order and mapped back to real ids', () => {
    const { evidence, refToSpanId } = buildEvidence(analysisOf(spans));
    assert.deepEqual(evidence.spans.map((s) => s.ref), ['S1', 'S2']);
    assert.deepEqual(refToSpanId, { S1: 'root-id', S2: 'child-id' });
    assert.equal(evidence.spans[1]!.parentRef, 'S1');
    assert.equal(evidence.spans[0]!.parentRef, null);
});

test('real span ids never appear in the evidence', () => {
    const { evidence } = buildEvidence(analysisOf(spans));
    assert.ok(!JSON.stringify(evidence).includes('child-id'));
    assert.ok(!JSON.stringify(evidence).includes('root-id'));
});

test('only allowed tags are kept and long text is cut', () => {
    const { evidence } = buildEvidence(analysisOf(spans));
    const tags = evidence.spans[1]!.tags!;
    assert.equal(tags['http.method'], 'POST');
    assert.equal(tags['user.email'], undefined);
    assert.equal((tags['db.statement'] as string).length, 120);
});

test('error text is truncated', () => {
    const failing = [span('a', null, { status: 'error', error: 'e'.repeat(500) })];
    assert.equal(buildEvidence(analysisOf(failing)).evidence.spans[0]!.error!.length, 200);
});

test('findings point at refs, and the primary index is set', () => {
    const f: Finding = { kind: 'latency_regression', service: 'inventory', operation: 'db.query', spanIds: ['child-id'], severity: 0.5, message: 'm', details: {} };
    const { evidence } = buildEvidence(analysisOf(spans, [f]));
    assert.deepEqual(evidence.findings[0]!.refs, ['S2']);
    assert.equal(evidence.primaryFinding, 0);
});

test('big traces are cut down and finding spans are kept', () => {
    const many = [span('root', null, { duration: 1000 })];
    for (let i = 0; i < 80; i++) many.push(span(`s${i}`, 'root', { startTime: 1000 + i, duration: 5 }));
    const wanted = 's77';
    const f: Finding = { kind: 'n_plus_one', service: 'svc', operation: wanted, spanIds: [wanted], severity: 0.5, message: 'm', details: {} };
    const { evidence, refToSpanId } = buildEvidence(analysisOf(many, [f]));
    assert.ok(evidence.spans.length <= 25);
    assert.equal(evidence.trace.spanCount, 81);
    assert.ok(Object.values(refToSpanId).includes(wanted));
});

test('the hash is stable for the same input and changes with the data', () => {
    const a = buildEvidence(analysisOf(spans)).hash;
    assert.equal(a, buildEvidence(analysisOf(spans)).hash);
    const slower = spans.map((s) => ({ ...s, duration: s.duration + 1 }));
    assert.notEqual(a, buildEvidence(analysisOf(slower)).hash);
});
