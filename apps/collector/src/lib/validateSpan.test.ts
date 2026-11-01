import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSpan } from './validateSpan';

function goodSpan(): Record<string, unknown> {
    return {
        traceId: 'trace-1',
        spanId: 'span-1',
        parentSpanId: null,
        operationName: 'GET /orders',
        serviceName: 'order-service',
        startTime: 1700000000000,
        duration: 42,
        status: 'ok',
        tags: { 'http.status_code': 200, cached: false, route: '/orders' },
    };
}

test('accepts a normal span', () => {
    assert.equal(validateSpan(goodSpan()), null);
});

test('accepts an error span with a parent and no tags', () => {
    const span = { ...goodSpan(), parentSpanId: 'span-0', status: 'error', error: 'boom' };
    delete span.tags;
    assert.equal(validateSpan(span), null);
});

test('rejects things that are not objects', () => {
    for (const value of [null, undefined, 'span', 5, [goodSpan()]]) {
        assert.notEqual(validateSpan(value), null);
    }
});

test('rejects ids longer than the database column', () => {
    assert.notEqual(validateSpan({ ...goodSpan(), traceId: 'a'.repeat(37) }), null);
    assert.equal(validateSpan({ ...goodSpan(), traceId: 'a'.repeat(36) }), null);
});

test('rejects empty and missing text fields', () => {
    assert.notEqual(validateSpan({ ...goodSpan(), spanId: '' }), null);
    assert.notEqual(validateSpan({ ...goodSpan(), serviceName: undefined }), null);
    assert.notEqual(validateSpan({ ...goodSpan(), operationName: 'x'.repeat(256) }), null);
});

test('parentSpanId must be null or a string', () => {
    assert.notEqual(validateSpan({ ...goodSpan(), parentSpanId: undefined }), null);
    assert.notEqual(validateSpan({ ...goodSpan(), parentSpanId: 7 }), null);
});

test('rejects bad numbers', () => {
    assert.notEqual(validateSpan({ ...goodSpan(), duration: -1 }), null);
    assert.notEqual(validateSpan({ ...goodSpan(), duration: 1.5 }), null);
    assert.notEqual(validateSpan({ ...goodSpan(), duration: 2147483648 }), null);
    assert.notEqual(validateSpan({ ...goodSpan(), duration: '10' }), null);
    assert.notEqual(validateSpan({ ...goodSpan(), startTime: NaN }), null);
    assert.notEqual(validateSpan({ ...goodSpan(), startTime: -5 }), null);
});

test('status must be ok or error', () => {
    assert.notEqual(validateSpan({ ...goodSpan(), status: 'warning' }), null);
});

test('rejects too many tags and bad tag values', () => {
    const many = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, i]));
    assert.notEqual(validateSpan({ ...goodSpan(), tags: many }), null);
    assert.notEqual(validateSpan({ ...goodSpan(), tags: { nested: { a: 1 } } }), null);
    assert.notEqual(validateSpan({ ...goodSpan(), tags: { long: 'x'.repeat(501) } }), null);
    assert.notEqual(validateSpan({ ...goodSpan(), tags: [1, 2] }), null);
});

test('rejects an error message that is too long', () => {
    assert.notEqual(validateSpan({ ...goodSpan(), error: 'x'.repeat(2001) }), null);
});
