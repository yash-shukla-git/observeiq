import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPermanentDbError } from './errors';

test('bad data and constraint errors are permanent', () => {
    assert.equal(isPermanentDbError({ code: '22001' }), true); // value too long
    assert.equal(isPermanentDbError({ code: '22P02' }), true); // invalid text representation
    assert.equal(isPermanentDbError({ code: '23502' }), true); // not null violation
    assert.equal(isPermanentDbError({ code: '23514' }), true); // check violation
});

test('connection problems are not permanent, the message should be retried', () => {
    assert.equal(isPermanentDbError({ code: '57P01' }), false); // admin shutdown
    assert.equal(isPermanentDbError({ code: '08006' }), false); // connection failure
    assert.equal(isPermanentDbError({ code: 'ECONNREFUSED' }), false);
});

test('errors without a postgres code are not permanent', () => {
    assert.equal(isPermanentDbError(new Error('something broke')), false);
    assert.equal(isPermanentDbError(null), false);
    assert.equal(isPermanentDbError(undefined), false);
    assert.equal(isPermanentDbError({ code: 22001 }), false); // number, not a string
});
