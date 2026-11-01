'use server';

import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { createSession, deleteSession } from '@/lib/session';

export type FormState = { error?: string; email?: string } | undefined;

// bcrypt only uses the first 72 bytes of a password, so longer ones are rejected
const credentials = z.object({
    email: z.email('Enter a valid email address').max(255),
    password: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password is too long'),
});

// Compared against when the email is unknown, so a wrong email takes as long as a wrong password.
const dummyHash = bcrypt.hashSync('not-a-real-password', 10);

function readForm(formData: FormData) {
    return credentials.safeParse({
        email: String(formData.get('email') ?? '').trim().toLowerCase(),
        password: String(formData.get('password') ?? ''),
    });
}

export async function signup(_prev: FormState, formData: FormData): Promise<FormState> {
    if (process.env.ALLOW_SIGNUP === 'false') return { error: 'Signup is disabled' };

    const parsed = readForm(formData);
    const email = String(formData.get('email') ?? '').trim().toLowerCase();
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input', email };

    let userId: string;
    try {
        const passwordHash = await bcrypt.hash(parsed.data.password, 10);
        const result = await pool.query(
            'INSERT INTO users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING id',
            [parsed.data.email, passwordHash]
        );
        if (result.rows.length === 0) return { error: 'An account with this email already exists', email };
        userId = String(result.rows[0].id);
    } catch (err) {
        console.error('[dashboard] signup failed:', err);
        return { error: 'Something went wrong, please try again', email };
    }

    await createSession({ userId, email: parsed.data.email });
    redirect('/'); // redirect works by throwing, so it stays outside the try/catch
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
    const parsed = readForm(formData);
    const email = String(formData.get('email') ?? '').trim().toLowerCase();
    // same message for every failure so the form does not reveal which emails exist
    const failed: FormState = { error: 'Invalid email or password', email };
    if (!parsed.success) return failed;

    let userId: string;
    try {
        const result = await pool.query('SELECT id, password_hash FROM users WHERE email = $1', [parsed.data.email]);
        const user = result.rows[0];
        const match = await bcrypt.compare(parsed.data.password, user?.password_hash ?? dummyHash);
        if (!user || !match) return failed;
        userId = String(user.id);
    } catch (err) {
        console.error('[dashboard] login failed:', err);
        return { error: 'Something went wrong, please try again', email };
    }

    await createSession({ userId, email: parsed.data.email });
    redirect('/');
}

export async function logout(): Promise<void> {
    await deleteSession();
    redirect('/login');
}
