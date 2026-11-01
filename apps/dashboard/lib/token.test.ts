import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { createToken, readToken } from './token';

process.env.SESSION_SECRET = 'a-test-secret-that-is-at-least-32-chars';

test('a token we created can be read back', async () => {
    const token = await createToken({ userId: '7', email: 'a@example.com' });
    assert.deepEqual(await readToken(token), { userId: '7', email: 'a@example.com' });
});

test('missing or garbage tokens give null', async () => {
    assert.equal(await readToken(undefined), null);
    assert.equal(await readToken(''), null);
    assert.equal(await readToken('not.a.token'), null);
});

test('a token with a changed payload is rejected', async () => {
    const token = await createToken({ userId: '7', email: 'a@example.com' });
    const [header, , signature] = token.split('.');
    const fakePayload = Buffer.from(JSON.stringify({ userId: '1', email: 'admin@example.com' })).toString('base64url');
    assert.equal(await readToken(`${header}.${fakePayload}.${signature}`), null);
});

test('a token signed with another secret is rejected', async () => {
    const other = new TextEncoder().encode('a-different-secret-that-is-32-chars-long');
    const token = await new SignJWT({ userId: '7', email: 'a@example.com' })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('1h')
        .sign(other);
    assert.equal(await readToken(token), null);
});

test('an expired token is rejected', async () => {
    const key = new TextEncoder().encode(process.env.SESSION_SECRET);
    const token = await new SignJWT({ userId: '7', email: 'a@example.com' })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
        .sign(key);
    assert.equal(await readToken(token), null);
});

test('creating a token without a long enough secret fails', async () => {
    const saved = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = 'too-short';
    await assert.rejects(createToken({ userId: '7', email: 'a@example.com' }), /SESSION_SECRET/);
    process.env.SESSION_SECRET = saved;
});
