import Link from 'next/link';
import { getSession } from '@/lib/session';
import { logout } from '@/app/actions/auth';

export default async function Header() {
    const session = await getSession();

    return (
        <header className="w-full border-b border-zinc-800/60 bg-[#18181b]/80 px-8 py-3.5 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5">
                <svg className="w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h3l3-9 4 18 3-13 3 4h3" />
                </svg>
                <span className="text-xs font-bold tracking-wider text-zinc-300 uppercase">ObserveIQ</span>
            </Link>

            {session && (
                <form action={logout} className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500 font-mono">{session.email}</span>
                    <button
                        type="submit"
                        className="rounded border border-zinc-800/60 px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
                    >
                        Log out
                    </button>
                </form>
            )}
        </header>
    );
}
