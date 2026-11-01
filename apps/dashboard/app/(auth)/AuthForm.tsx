'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import type { FormState } from '@/app/actions/auth';

interface Props {
    title: string;
    submitLabel: string;
    action: (prev: FormState, formData: FormData) => Promise<FormState>;
    otherText: string;
    otherLabel: string;
    otherHref: string;
}

export default function AuthForm({ title, submitLabel, action, otherText, otherLabel, otherHref }: Props) {
    const [state, formAction, pending] = useActionState(action, undefined);

    return (
        <main className="min-h-screen w-full bg-[#111113] font-sans antialiased text-zinc-300 flex items-center justify-center p-8">
            <div className="w-full max-w-sm rounded-xl border border-zinc-800/60 bg-[#18181b] p-6 space-y-5">
                <div>
                    <span className="text-xs font-bold tracking-wider text-zinc-400 uppercase">ObserveIQ</span>
                    <h1 className="text-xl font-bold tracking-tight text-zinc-200 mt-1">{title}</h1>
                </div>

                <form action={formAction} className="space-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="email" className="text-xs text-zinc-500">Email</label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            required
                            defaultValue={state?.email}
                            className="w-full rounded bg-[#111113] border border-zinc-800/60 px-3 py-2 text-sm text-zinc-300 outline-none focus:border-zinc-600"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="password" className="text-xs text-zinc-500">Password</label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            required
                            className="w-full rounded bg-[#111113] border border-zinc-800/60 px-3 py-2 text-sm text-zinc-300 outline-none focus:border-zinc-600"
                        />
                    </div>

                    {state?.error && <p className="text-xs text-rose-400">{state.error}</p>}

                    <button
                        type="submit"
                        disabled={pending}
                        className="w-full rounded bg-zinc-200 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-50 transition-colors"
                    >
                        {pending ? 'Please wait...' : submitLabel}
                    </button>
                </form>

                <p className="text-xs text-zinc-500">
                    {otherText}{' '}
                    <Link href={otherHref} className="text-zinc-300 underline underline-offset-2">{otherLabel}</Link>
                </p>
            </div>
        </main>
    );
}
