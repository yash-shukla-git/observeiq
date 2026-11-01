import Link from 'next/link';
import AuthForm from '../AuthForm';
import { signup } from '@/app/actions/auth';

// read ALLOW_SIGNUP on every request, not once at build time
export const dynamic = 'force-dynamic';

export default function SignupPage() {
    if (process.env.ALLOW_SIGNUP === 'false') {
        return (
            <main className="min-h-screen w-full bg-[#111113] font-sans text-zinc-300 flex items-center justify-center p-8">
                <div className="max-w-sm rounded-xl border border-zinc-800/60 bg-[#18181b] p-6 space-y-3">
                    <h1 className="text-xl font-bold text-zinc-200">Signup is closed</h1>
                    <p className="text-xs text-zinc-500">Ask the owner of this ObserveIQ instance for an account.</p>
                    <Link href="/login" className="text-xs text-zinc-300 underline underline-offset-2">Back to log in</Link>
                </div>
            </main>
        );
    }

    return (
        <AuthForm
            title="Create an account"
            submitLabel="Sign up"
            action={signup}
            otherText="Already have an account?"
            otherLabel="Log in"
            otherHref="/login"
        />
    );
}
