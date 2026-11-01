import { test } from 'node:test';
import assert from 'node:assert/strict';
import { span } from '../testSpans';
import type { Finding } from '../types';
import { pickPrimary } from './primary';

function finding(kind: Finding['kind'], spanId: string, severity: number): Finding {
    return { kind, service: 'svc', operation: spanId, spanIds: [spanId], severity, message: kind, details: {} };
}

const chain = [span('root', null), span('middle', 'root'), span('leaf', 'middle')];

test('no findings means no primary', () => {
    assert.equal(pickPrimary([], chain), null);
});

test('the highest severity wins when findings are not related', () => {
    const spans = [span('root', null), span('a', 'root'), span('b', 'root')];
    const primary = pickPrimary([finding('error_spike', 'a', 0.3), finding('latency_regression', 'b', 0.8)], spans);
    assert.equal(primary?.operation, 'b');
});

test('a finding above another finding is a symptom, the deeper one is the cause', () => {
    const primary = pickPrimary(
        [finding('error_spike', 'root', 1), finding('error_spike', 'middle', 1), finding('latency_regression', 'leaf', 0.4)],
        chain
    );
    assert.equal(primary?.operation, 'leaf');
});

test('every span of a finding counts, not only the first one', () => {
    // two attempts, the failing call below attempt 2 is not below the first span of the retry finding
    const spans = [span('root', null), span('try1', 'root'), span('try2', 'root'), span('call2', 'try2')];
    const retries: Finding = { ...finding('retry_storm', 'try1', 0.9), spanIds: ['try1', 'try2'] };
    const failing = finding('error_spike', 'call2', 0.7);
    assert.equal(pickPrimary([retries, failing], spans)?.kind, 'error_spike');
});

test('a finding without a span in the trace is still considered', () => {
    const lonely: Finding = { ...finding('latency_regression', 'x', 0.5), spanIds: [] };
    assert.equal(pickPrimary([lonely], chain), lonely);
});
