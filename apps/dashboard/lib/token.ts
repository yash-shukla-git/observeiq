import { SignJWT, jwtVerify } from 'jose';

// No 'server-only' import here because proxy.ts uses this file too.
export const SESSION_COOKIE = 'session';
export const SESSION_DAYS = 7;

export interface SessionData {
    userId: string;
    email: string;
}

function getKey(): Uint8Array {
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error('SESSION_SECRET must be set and at least 32 characters (openssl rand -base64 32)');
    }
    return new TextEncoder().encode(secret);
}

export async function createToken(data: SessionData): Promise<string> {
    return new SignJWT({ ...data })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${SESSION_DAYS}d`)
        .sign(getKey());
}

// Returns null for a missing, tampered or expired token.
export async function readToken(token: string | undefined): Promise<SessionData | null> {
    if (!token) return null;
    try {
        const { payload } = await jwtVerify(token, getKey(), { algorithms: ['HS256'] });
        if (typeof payload.userId !== 'string' || typeof payload.email !== 'string') return null;
        return { userId: payload.userId, email: payload.email };
    } catch {
        return null;
    }
}
