'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
    return (
        <main className="min-h-screen w-full bg-[#111113] font-sans text-zinc-300 flex items-center justify-center p-8">
            <div className="max-w-md rounded-xl border border-zinc-800/60 bg-[#18181b] p-6 space-y-3">
                <h1 className="text-lg font-bold text-zinc-200">Could not load data</h1>
                <p className="text-xs text-zinc-500 font-mono break-words">{error.message}</p>
                <p className="text-xs text-zinc-500">Check that the collector is running and NEXT_PUBLIC_COLLECTOR_URL points to it.</p>
                <button
                    onClick={reset}
                    className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors"
                >
                    Try again
                </button>
            </div>
        </main>
    );
}
