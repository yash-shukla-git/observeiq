import 'server-only';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, SESSION_DAYS, createToken, readToken, type SessionData } from './token';

export async function createSession(data: SessionData): Promise<void> {
    const token = await createToken(data);
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, {
        httpOnly: true, // not readable from browser javascript
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_DAYS * 24 * 60 * 60,
    });
}

export async function getSession(): Promise<SessionData | null> {
    const cookieStore = await cookies();
    return readToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function deleteSession(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE);
}
