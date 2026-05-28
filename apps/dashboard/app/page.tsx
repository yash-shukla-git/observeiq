import { getTraces } from '@/lib/api';
import TraceTable from './components/TraceTable';

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
        <main className="min-h-screen w-full bg-slate-950 font-sans antialiased text-zinc-300 block">
            {/* Professional Clean Top Navbar */}
            <header className="w-full border-b border-white/[0.04] bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 px-8 py-4 flex items-center">
                <div className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h3l3-9 4 18 3-13 3 4h3" />
                    </svg>
                    <span className="text-sm font-bold tracking-wider text-zinc-100 uppercase">ObserveIQ</span>
                </div>
            </header>

            {/* Dashboard Context Frame */}
            <div className="p-8 max-w-[1600px] mx-auto block">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold tracking-tight text-white">Traces</h1>
                    <p className="text-sm text-zinc-500 mt-0.5">Live distributed trace feed</p>
                </div>

                {/* Subtle 3D Elevated Metric Panels */}
                <div className="grid grid-cols-3 gap-5 mb-10 w-full">
                    {/* Total Traces Card */}
                    <div className="rounded-xl bg-gradient-to-b from-zinc-900 to-zinc-900/60 border border-white/[0.05] p-6 flex flex-col gap-2.5 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
                        <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Total Traces</p>
                        <p className="text-5xl font-extrabold text-zinc-100 tabular-nums tracking-tight">{totalTraces}</p>
                        <p className="text-xs text-zinc-500 font-medium">active traces</p>
                    </div>

                    {/* Dynamic Error Status Card with Micro Glow */}
                    <div className={`rounded-xl bg-gradient-to-b from-zinc-900 to-zinc-900/60 border p-6 flex flex-col gap-2.5 shadow-[0_4px_20px_rgba(0,0,0,0.3)] transition-all duration-300 ${
                        isHighErrorRate
                            ? 'border-rose-500/20 shadow-[0_0_30px_rgba(244,63,94,0.02)]'
                            : 'border-white/[0.05]'
                    }`}>
                        <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Error Rate</p>
                        <p className={`text-5xl font-extrabold tabular-nums tracking-tight ${isHighErrorRate ? 'text-rose-500' : 'text-emerald-400'}`}>
                            {errorRate}%
                        </p>
                        <p className="text-xs text-zinc-500 font-medium">vs 1.2% target</p>
                    </div>

                    {/* Avg Duration Card */}
                    <div className="rounded-xl bg-gradient-to-b from-zinc-900 to-zinc-900/60 border border-white/[0.05] p-6 flex flex-col gap-2.5 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
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