import { getTraces } from '@/lib/api';
import TraceTable from '@/app/components/TraceTable';

export default async function Home() {
    const traces = await getTraces();

    const totalTraces = traces.length;
    const errorCount = traces.filter((t) => t.has_error).length;
    const errorRate = totalTraces > 0 ? ((errorCount / totalTraces) * 100).toFixed(1) : '0';
    const avgDuration = totalTraces > 0
        ? Math.round(traces.reduce((sum, t) => sum + Number(t.total_duration_ms), 0) / totalTraces)
        : 0;
    const isHighErrorRate = Number(errorRate) > 10;

    return (
        <main className="min-h-screen bg-zinc-950 font-sans antialiased text-zinc-300">
            {/* Minimalist Tech Header Navigation */}
            <header className="w-full border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50 px-8 py-4 flex items-center">
                <div className="flex items-center gap-2.5">
                    {/* Modern Clean Trace Identity Logo */}
                    <svg className="w-4 h-4 text-zinc-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h3l3-9 4 18 3-13 3 4h3" />
                    </svg>
                    <span className="text-sm font-bold tracking-tight text-white uppercase">ObserveIQ</span>
                </div>
            </header>

            {/* Application Dashboard Core Wrapper */}
            <div className="p-8 max-w-400 mx-auto">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Traces</h1>
                    <p className="text-sm text-zinc-500 mt-0.5">Live distributed trace feed</p>
                </div>

                {/* Visible Layered Depth Cards */}
                <div className="grid grid-cols-3 gap-5 mb-10">
                    <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/50 p-6 flex flex-col gap-2 shadow-sm">
                        <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Total Traces</p>
                        <p className="text-5xl font-extrabold text-zinc-100 tabular-nums tracking-tight">{totalTraces}</p>
                        <p className="text-xs text-zinc-500 font-medium">active traces</p>
                    </div>

                    <div className={`rounded-xl bg-zinc-900/60 border p-6 flex flex-col gap-2 shadow-sm transition-all duration-300 ${
                        isHighErrorRate
                            ? 'border-rose-500/30 shadow-[0_0_30px_rgba(244,63,94,0.02)]'
                            : 'border-zinc-800/50'
                    }`}>
                        <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Error Rate</p>
                        <p className={`text-5xl font-extrabold tabular-nums tracking-tight ${isHighErrorRate ? 'text-rose-500' : 'text-emerald-400'}`}>
                            {errorRate}%
                        </p>
                        <p className="text-xs text-zinc-500 font-medium">vs 1.2% target</p>
                    </div>

                    <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/50 p-6 flex flex-col gap-2 shadow-sm">
                        <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Avg Duration</p>
                        <p className="text-5xl font-extrabold text-zinc-100 tabular-nums tracking-tight">
                            {avgDuration}<span className="text-2xl font-semibold text-zinc-500 ml-1">ms</span>
                        </p>
                        <p className="text-xs text-zinc-500 font-medium">across all services</p>
                    </div>
                </div>

                <TraceTable initialTraces={traces} />
            </div>
        </main>
    );
}