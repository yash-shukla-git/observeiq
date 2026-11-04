import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidence } from './evidence';
import { defaultConfig } from './config';
import { span } from './testSpans';
import type { TraceAnalysis } from './types';
import { validateAnswer } from './validate';

const spans = [
    span('r', null, { service: 'order', operation: 'POST /order', startTime: 1000, duration: 900 }),
    span('q', 'r', { service: 'inventory', operation: 'db.query', startTime: 1010, duration: 800 }),
];
const analysis: TraceAnalysis = { traceId: 't1', spans, totalMs: 900, stats: [], findings: [], primary: null, config: defaultConfig };
const { evidence } = buildEvidence(analysis); // S1 = order POST /order, S2 = inventory db.query

function answer(overrides: Record<string, unknown> = {}) {
    return {
        summary: 'The inventory query is slow.',
        root_cause: { kind: 'latency_regression', span_ref: 'S2', service: 'inventory', operation: 'db.query' },
        evidence: [{ span_ref: 'S2', note: 'took 800 ms' }],
        confidence: 'high',
        suggested_checks: ['Look at the query plan'],
        ...overrides,
    };
}

test('accepts a correct answer', () => {
    const result = validateAnswer(JSON.stringify(answer()), evidence);
    assert.equal(result.ok, true);
});

test('accepts an answer wrapped in a markdown fence', () => {
    assert.equal(validateAnswer('```json\n' + JSON.stringify(answer()) + '\n```', evidence).ok, true);
});

test('rejects text that is not JSON', () => {
    const result = validateAnswer('The cause is the database.', evidence);
    assert.equal(result.ok, false);
});

test('rejects a cited span that is not in the evidence', () => {
    const bad = answer({ root_cause: { kind: 'latency_regression', span_ref: 'S9', service: 'inventory', operation: 'db.query' } });
    const result = validateAnswer(JSON.stringify(bad), evidence);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.problems.join(' '), /S9/);
});

test('rejects an invented span in the supporting evidence', () => {
    const bad = answer({ evidence: [{ span_ref: 'S2', note: 'fine' }, { span_ref: 'S40', note: 'made up' }] });
    assert.equal(validateAnswer(JSON.stringify(bad), evidence).ok, false);
});

test('rejects a service or operation that does not match the cited span', () => {
    const bad = answer({ root_cause: { kind: 'latency_regression', span_ref: 'S2', service: 'payment', operation: 'chargeCard' } });
    const result = validateAnswer(JSON.stringify(bad), evidence);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.problems.join(' '), /S2 is inventory db.query/);
});

test('rejects wrong shapes and values', () => {
    assert.equal(validateAnswer(JSON.stringify(answer({ confidence: 'certain' })), evidence).ok, false);
    assert.equal(validateAnswer(JSON.stringify(answer({ summary: 'x'.repeat(401) })), evidence).ok, false);
    assert.equal(validateAnswer(JSON.stringify(answer({ suggested_checks: [] })), evidence).ok, false);
    assert.equal(validateAnswer(JSON.stringify(answer({ evidence: [] })), evidence).ok, false);
    assert.equal(validateAnswer(JSON.stringify(answer({ root_cause: { kind: 'bad_luck', span_ref: 'S2', service: 'inventory', operation: 'db.query' } })), evidence).ok, false);
});
