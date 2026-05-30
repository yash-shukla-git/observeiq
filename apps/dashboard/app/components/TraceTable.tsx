'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { TraceSummary, getTraces } from '@/lib/api';

function StatusBadge({ hasError }: { hasError: boolean }) {
    if (hasError) {
        return (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-950/40 text-rose-400 border border-rose-900/40 text-[11px] font-medium tracking-wide uppercase">
                <span className="w-1 h-1 rounded-full bg-rose-400 shrink-0" />
                error
            </span>
        );
    }
    return (
        // OK badge
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-teal-950/40 text-teal-400 border border-teal-900/30 text-[11px] font-medium tracking-wide uppercase">
            <span className="w-1 h-1 rounded-full bg-teal-400 shrink-0" />
            ok
        </span>
    );
}

export default function TraceTable({ initialTraces }: { initialTraces: TraceSummary[] }) {
    const [traces, setTraces] = useState<TraceSummary[]>(initialTraces);
    const [newTraceIds, setNewTraceIds] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState('');
    const [serviceFilter, setServiceFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const knownIds = useRef<Set<string>>(new Set(initialTraces.map((t) => t.trace_id)));
    const router = useRouter();

    useEffect(() => {
        const interval = setInterval(async () => {
            const fresh = await getTraces();
            const newIds = fresh.map((t) => t.trace_id).filter((id) => !knownIds.current.has(id));
            if (newIds.length > 0) {
                newIds.forEach((id) => knownIds.current.add(id));
                setNewTraceIds(new Set(newIds));
                setTraces(fresh);
                setTimeout(() => setNewTraceIds(new Set()), 3000);
            }
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    const services = ['all', ...Array.from(new Set(traces.map((t) => t.service_name)))];

    const filtered = traces.filter((t) => {
        const matchesSearch =
            search === '' ||
            t.trace_id.toLowerCase().includes(search.toLowerCase()) ||
            t.service_name.toLowerCase().includes(search.toLowerCase());
        const matchesService = serviceFilter === 'all' || t.service_name === serviceFilter;
        const matchesStatus =
            statusFilter === 'all' ||
            (statusFilter === 'error' && t.has_error) ||
            (statusFilter === 'ok' && !t.has_error);
        return matchesSearch && matchesService && matchesStatus;
    });

    const maxDuration = Math.max(...traces.map(t => Number(t.total_duration_ms)), 1);

    return (
        <div className="space-y-4 w-full block">
            {/* Utility Bar */}
            <div className="flex items-center justify-between gap-4 w-full">
                <div className="relative flex-1 max-w-md group">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-zinc-600 group-focus-within:text-zinc-400 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </span>
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search traces..."
                        className="w-full rounded bg-[#18181b] border border-zinc-800/60 pl-9 pr-4 py-2 text-xs font-mono text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-600 transition-colors"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <select
                        style={{ colorScheme: 'dark' }}
                        value={serviceFilter}
                        onChange={(e) => setServiceFilter(e.target.value)}
                        className="rounded bg-[#18181b] border border-zinc-800/60 px-3 py-2 text-xs font-mono text-zinc-400 outline-none cursor-pointer hover:border-zinc-600 transition-colors"
                    >
                        {services.map((s) => (
                            <option key={s} value={s}>{s === 'all' ? 'All Services' : s}</option>
                        ))}
                    </select>
                    <select
                        style={{ colorScheme: 'dark' }}
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="rounded bg-[#18181b] border border-zinc-800/60 px-3 py-2 text-xs font-mono text-zinc-400 outline-none cursor-pointer hover:border-zinc-600 transition-colors"
                    >
                        <option value="all">All Status</option>
                        <option value="ok">OK</option>
                        <option value="error">Error</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="w-full overflow-x-auto block border border-zinc-800/60 rounded-lg bg-[#18181b]">
                <table className="w-full table-fixed border-collapse">
                    <thead>
                    <tr className="border-b border-zinc-800/60 text-left bg-[#1c1c1f]">
                        <th className="w-[38%] py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-4 pr-2">Service / Trace</th>
                        <th className="w-[20%] py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-2">Started</th>
                        <th className="w-[24%] py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-2">Latency</th>
                        <th className="w-[8%] py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-2">Spans</th>
                        <th className="w-[10%] py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-2 text-right pr-4">Status</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/40">
                    {filtered.length === 0 && (
                        <tr>
                            <td colSpan={5} className="text-xs text-zinc-600 font-mono py-12 text-center">
                                No traces match your active filters.
                            </td>
                        </tr>
                    )}
                    {filtered.map((trace) => {
                        const relativePct = (Number(trace.total_duration_ms) / maxDuration) * 100;
                        return (
                            <tr
                                key={trace.trace_id}
                                onClick={() => router.push(`/traces/${trace.trace_id}`)}
                                className={`group cursor-pointer transition-colors duration-100 ${
                                    newTraceIds.has(trace.trace_id) ? 'bg-emerald-500/5' : 'hover:bg-zinc-800/30'
                                }`}
                            >
                                <td className="py-3 pl-4 pr-2">
                                    <div className="flex flex-col gap-0.5 min-w-0">
                                        <p className="text-sm font-semibold text-zinc-300 group-hover:text-zinc-200 transition-colors truncate tracking-tight">
                                            {trace.service_name}
                                        </p>
                                        <p className="text-[11px] text-zinc-600 font-mono truncate">
                                            {trace.trace_id}
                                        </p>
                                    </div>
                                </td>
                                <td className="py-3 px-2 text-xs font-mono text-zinc-500 tabular-nums">
                                    {new Date(Number(trace.start_time)).toLocaleString('en-IN', {
                                        day: '2-digit',
                                        month: 'short',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit',
                                        hour12: true,
                                    })}
                                </td>
                                <td className="py-3 px-2">
                                    <div className="flex items-center gap-3 w-full pr-4">
                                        <div className="relative flex-1 h-1.5 bg-zinc-800/60 rounded-sm overflow-hidden">
                                            <div
                                                className={`absolute h-full rounded-sm ${trace.has_error ? 'bg-rose-500/70' : 'bg-indigo-500/60'}`}
                                                style={{ width: `${Math.max(relativePct, 2)}%` }}
                                            />
                                        </div>
                                        <span className="text-xs font-semibold text-zinc-400 font-mono shrink-0 tabular-nums w-14 text-right">
                                                {trace.total_duration_ms}ms
                                            </span>
                                    </div>
                                </td>
                                <td className="py-3 px-2 text-xs text-zinc-500 font-mono tabular-nums">
                                    {trace.span_count}
                                </td>
                                <td className="py-3 px-2 text-right pr-4">
                                    <div className="inline-flex">
                                        <StatusBadge hasError={trace.has_error} />
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}