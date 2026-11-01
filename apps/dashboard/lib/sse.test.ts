import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSse } from './sse';

test('reads complete events', () => {
    const { events, rest } = parseSse('event: status\ndata: {"stage":"asking_model"}\n\nevent: result\ndata: {"ok":true}\n\n');
    assert.deepEqual(events, [
        { event: 'status', data: { stage: 'asking_model' } },
        { event: 'result', data: { ok: true } },
    ]);
    assert.equal(rest, '');
});

test('keeps an unfinished event for the next piece', () => {
    const first = parseSse('event: status\ndata: {"a":1}\n\nevent: result\ndata: {"b"');
    assert.equal(first.events.length, 1);
    const second = parseSse(first.rest + ':2}\n\n');
    assert.deepEqual(second.events, [{ event: 'result', data: { b: 2 } }]);
});

test('skips events that are not valid JSON', () => {
    const { events } = parseSse('event: x\ndata: not json\n\nevent: y\ndata: {"ok":1}\n\n');
    assert.deepEqual(events, [{ event: 'y', data: { ok: 1 } }]);
});
