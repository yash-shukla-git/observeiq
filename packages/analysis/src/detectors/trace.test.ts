import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultConfig as cfg } from '../config';
import { span, stats } from '../testSpans';
import { findRepeats, findSlowDownstream } from './trace';

function repeated(count: number, overrides: (i: number) => Parameters<typeof span>[2] = () => ({})) {
    return Array.from({ length: count }, (_, i) =>
        span(`q${i}`, 'parent', { service: 'inventory', operation: 'db.query', startTime: 1000 + i * 30, duration: 30, ...overrides(i) })
    );
}

test('the same call repeated many times is an N+1', () => {
    const spans = [span('parent', null, { duration: 400 }), ...repeated(12, () => ({ tags: { 'db.statement': 'SELECT stock FROM inventory WHERE sku = ?' } }))];
    const found = findRepeats(spans, cfg);
    assert.equal(found.length, 1);
    assert.equal(found[0]!.kind, 'n_plus_one');
    assert.equal(found[0]!.details.count, 12);
    assert.equal(found[0]!.details.statement, 'SELECT stock FROM inventory WHERE sku = ?');
});

test('a few repeats are not reported', () => {
    const spans = [span('parent', null, { duration: 100 }), ...repeated(4)];
    assert.equal(findRepeats(spans, cfg).length, 0);
});

test('repeated calls that mostly fail are a retry storm', () => {
    const spans = [span('parent', null, { duration: 400 }), ...repeated(5, () => ({ status: 'error' as const }))];
    const found = findRepeats(spans, cfg);
    assert.equal(found.length, 1);
    assert.equal(found[0]!.kind, 'retry_storm');
    assert.equal(found[0]!.details.failedAttempts, 5);
});

test('three repeats are enough for a retry storm but not for an N+1', () => {
    const failing = [span('parent', null), ...repeated(3, () => ({ status: 'error' as const }))];
    assert.equal(findRepeats(failing, cfg)[0]?.kind, 'retry_storm');
    const fine = [span('parent', null), ...repeated(3)];
    assert.equal(findRepeats(fine, cfg).length, 0);
});

test('spans under different parents are not grouped together', () => {
    const spans = [
        span('p1', null), span('p2', null),
        ...Array.from({ length: 3 }, (_, i) => span(`a${i}`, 'p1', { operation: 'x' })),
        ...Array.from({ length: 3 }, (_, i) => span(`b${i}`, 'p2', { operation: 'x' })),
    ];
    assert.equal(findRepeats(spans, cfg).length, 0);
});

function crossServiceTrace(callDuration: number) {
    return [
        span('root', null, { service: 'order', operation: 'POST /order', duration: callDuration + 20 }),
        span('call', 'root', { service: 'inventory', operation: 'checkInventory', duration: callDuration }),
    ];
}

test('a cross-service call far above its baseline p95 is slow downstream', () => {
    const found = findSlowDownstream(crossServiceTrace(900), [stats('inventory', 'checkInventory', { baselineP95: 45 })], cfg);
    assert.equal(found.length, 1);
    assert.equal(found[0]!.kind, 'slow_downstream');
    assert.deepEqual(found[0]!.spanIds, ['call']);
});

test('a normal call is not reported even if it takes most of the request', () => {
    const found = findSlowDownstream(crossServiceTrace(60), [stats('inventory', 'checkInventory', { baselineP95: 55 })], cfg);
    assert.equal(found.length, 0);
});

test('without a baseline only a clearly dominant slow call is reported', () => {
    assert.equal(findSlowDownstream(crossServiceTrace(900), [], cfg).length, 1);
    assert.equal(findSlowDownstream(crossServiceTrace(100), [], cfg).length, 0);
});

test('calls inside the same service are not downstream calls', () => {
    const spans = [
        span('root', null, { service: 'inventory', duration: 900 }),
        span('child', 'root', { service: 'inventory', duration: 880 }),
    ];
    assert.equal(findSlowDownstream(spans, [], cfg).length, 0);
});
