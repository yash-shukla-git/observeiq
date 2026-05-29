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
        <main className="min-h-screen w-full bg-[#111113] font-sans antialiased text-zinc-300 block">
            {/* Header */}
            <header className="w-full border-b border-zinc-800/60 bg-[#18181b]/80 px-8 py-3.5 flex items-center">
                <div className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h3l3-9 4 18 3-13 3 4h3" />
                    </svg>
                    <span className="text-xs font-bold tracking-wider text-zinc-300 uppercase">ObserveIQ</span>
                </div>
            </header>

            <div className="p-8 max-w-[1600px] mx-auto block">
                <div className="mb-8">
                    <h1 className="text-xl font-bold tracking-tight text-zinc-200">Traces</h1>
                    <p className="text-xs text-zinc-500 mt-0.5">Live distributed trace feed</p>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-3 gap-5 mb-10 w-full">
                    <div className="rounded-lg bg-[#18181b] border border-zinc-800/60 p-5 flex flex-col gap-1.5 shadow-md">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Total Traces</p>
                        <p className="text-4xl font-bold text-zinc-300 tabular-nums tracking-tight">{totalTraces}</p>
                        <p className="text-[11px] text-zinc-600 font-medium">active traces</p>
                    </div>

                    <div className={`rounded-lg bg-[#18181b] border p-5 flex flex-col gap-1.5 shadow-md transition-all ${
                        isHighErrorRate ? 'border-rose-900/60' : 'border-zinc-800/60'
                    }`}>
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Error Rate</p>
                        <p className={`text-4xl font-bold tabular-nums tracking-tight ${isHighErrorRate ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {errorRate}%
                        </p>
                        <p className="text-[11px] text-zinc-600 font-medium">vs 1.2% target</p>
                    </div>

                    <div className="rounded-lg bg-[#18181b] border border-zinc-800/60 p-5 flex flex-col gap-1.5 shadow-md">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Avg Duration</p>
                        <p className="text-4xl font-bold text-zinc-300 tabular-nums tracking-tight">
                            {avgDuration}<span className="text-xl font-medium text-zinc-500 ml-0.5">ms</span>
                        </p>
                        <p className="text-[11px] text-zinc-600 font-medium">across all services</p>
                    </div>
                </div>

                <TraceTable initialTraces={traces} />
            </div>
        </main>
    );
}