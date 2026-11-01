import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTree, type SpanNode } from './buildTree';

function span(spanId: string, parentSpanId: string | null, startTime: number): SpanNode {
    return {
        id: 1,
        trace_id: 't1',
        span_id: spanId,
        parent_span_id: parentSpanId,
        operation_name: spanId,
        service_name: 'svc',
        start_time: startTime,
        duration: 10,
        status: 'ok',
        error: null,
        tags: {},
        children: [],
    };
}

test('puts children under their parent', () => {
    const tree = buildTree([span('root', null, 1), span('a', 'root', 2), span('b', 'a', 3)]);

    assert.equal(tree.length, 1);
    assert.equal(tree[0]!.span_id, 'root');
    assert.equal(tree[0]!.children[0]!.span_id, 'a');
    assert.equal(tree[0]!.children[0]!.children[0]!.span_id, 'b');
});

test('keeps siblings in the order they were given', () => {
    const tree = buildTree([span('root', null, 1), span('a', 'root', 2), span('b', 'root', 3)]);

    assert.deepEqual(tree[0]!.children.map((c) => c.span_id), ['a', 'b']);
});

test('a span whose parent is missing becomes a root', () => {
    // happens when the parent span was never received
    const tree = buildTree([span('root', null, 1), span('orphan', 'lost-parent', 2)]);

    assert.deepEqual(tree.map((n) => n.span_id), ['root', 'orphan']);
});

test('does not change the input spans', () => {
    const input = [span('root', null, 1), span('a', 'root', 2)];
    buildTree(input);

    assert.equal(input[0]!.children.length, 0);
});

test('empty input gives an empty tree', () => {
    assert.deepEqual(buildTree([]), []);
});
