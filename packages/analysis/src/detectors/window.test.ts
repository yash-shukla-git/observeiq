import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultConfig as cfg } from '../config';
import { stats } from '../testSpans';
import { findErrorSpikes, findLatencyRegressions } from './window';

test('flags a p99 that is far above the baseline', () => {
    const found = findLatencyRegressions([stats('inventory', 'db.query', { recentP99: 800, baselineP99: 40 })], cfg);
    assert.equal(found.length, 1);
    assert.equal(found[0]!.kind, 'latency_regression');
    assert.equal(found[0]!.details.ratio, 20);
});

test('ignores a small change in p99', () => {
    // 1.5x is under the 2x ratio
    assert.equal(findLatencyRegressions([stats('a', 'b', { recentP99: 60, baselineP99: 40 })], cfg).length, 0);
    // 3x but only 20 ms more
    assert.equal(findLatencyRegressions([stats('a', 'b', { recentP99: 30, baselineP99: 10 })], cfg).length, 0);
});

test('skips operations with too few samples', () => {
    assert.equal(findLatencyRegressions([stats('a', 'b', { recentP99: 900, recentCount: 5 })], cfg).length, 0);
    assert.equal(findLatencyRegressions([stats('a', 'b', { recentP99: 900, baselineCount: 5 })], cfg).length, 0);
});

test('a bigger regression gets a higher severity', () => {
    const small = findLatencyRegressions([stats('a', 'b', { recentP99: 200, baselineP99: 50 })], cfg)[0]!;
    const big = findLatencyRegressions([stats('a', 'b', { recentP99: 800, baselineP99: 50 })], cfg)[0]!;
    assert.ok(big.severity > small.severity);
    assert.ok(big.severity <= 1);
});

test('flags an error rate far above the baseline', () => {
    const found = findErrorSpikes([stats('payment', 'chargeCard', { recentErrors: 30, baselineErrors: 0 })], cfg);
    assert.equal(found.length, 1);
    assert.equal(found[0]!.kind, 'error_spike');
    assert.equal(found[0]!.severity, 1);
});

test('does not flag errors that are normal for the operation', () => {
    // 10 of 30 recent (33%) against 20 of 60 baseline (33%)
    const same = stats('a', 'b', { recentErrors: 10, baselineErrors: 20 });
    assert.equal(findErrorSpikes([same], cfg).length, 0);
});

test('needs a minimum number of errors', () => {
    assert.equal(findErrorSpikes([stats('a', 'b', { recentErrors: 3 })], cfg).length, 0);
});
