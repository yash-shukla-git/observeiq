'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { TraceSummary, getTraces } from '@/lib/api';

function StatusBadge({ hasError }: { hasError: boolean }) {
    if (hasError) {
        return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/10">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
                error
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/10">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
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

    return (
        <div className="space-y-6">
            {/* Search and Dropdowns Filter Section */}
            <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md group">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-zinc-500 group-focus-within:text-zinc-400 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </span>
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search traces..."
                        className="w-full rounded-lg bg-zinc-900 border border-zinc-800/60 pl-10 pr-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-700 focus:bg-black/30 shadow-inner transition-all duration-200"
                    />
                </div>

                <div className="flex items-center gap-2.5">
                    <select
                        style={{ colorScheme: 'dark' }}
                        value={serviceFilter}
                        onChange={(e) => setServiceFilter(e.target.value)}
                        className="rounded-lg bg-zinc-900 border border-zinc-800/60 px-3.5 py-2.5 text-sm text-zinc-400 outline-none cursor-pointer hover:border-zinc-700 transition-colors"
                    >
                        {services.map((s) => (
                            <option key={s} value={s}>{s === 'all' ? 'All Services' : s}</option>
                        ))}
                    </select>
                    <select
                        style={{ colorScheme: 'dark' }}
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="rounded-lg bg-zinc-900 border border-zinc-800/60 px-3.5 py-2.5 text-sm text-zinc-400 outline-none cursor-pointer hover:border-zinc-700 transition-colors"
                    >
                        <option value="all">All Status</option>
                        <option value="ok">OK</option>
                        <option value="error">Error</option>
                    </select>
                </div>
            </div>

            {/* Fixed-Width Formatted Table Canvas */}
            <div className="w-full overflow-x-auto">
                <table className="w-full table-fixed border-collapse">
                    <thead>
                    <tr className="border-b border-zinc-900 text-left">
                        <th className="w-[42%] pb-3 text-[11px] font-bold text-zinc-500 uppercase tracking-widest pl-4 pr-2">Service / Trace</th>
                        <th className="w-[24%] pb-3 text-[11px] font-bold text-zinc-500 uppercase tracking-widest px-2">Started</th>
                        <th className="w-[12%] pb-3 text-[11px] font-bold text-zinc-500 uppercase tracking-widest px-2">Duration</th>
                        <th className="w-[10%] pb-3 text-[11px] font-bold text-zinc-500 uppercase tracking-widest px-2">Spans</th>
                        <th className="w-[12%] pb-3 text-[11px] font-bold text-zinc-500 uppercase tracking-widest px-2">Status</th>
                    </tr>
                    </thead>
                    <tbody className="before:content-[''] before:block before:h-2">
                    {filtered.length === 0 && (
                        <tr>
                            <td colSpan={5} className="text-sm text-zinc-600 py-16 text-center border border-zinc-800 border-dashed rounded-xl bg-zinc-900/5">
                                No traces match your active filters.
                            </td>
                        </tr>
                    )}
                    {filtered.map((trace) => (
                        <tr
                            key={trace.trace_id}
                            onClick={() => router.push(`/traces/${trace.trace_id}`)}
                            className={`group cursor-pointer border-y border-transparent transition-all duration-150 ${
                                newTraceIds.has(trace.trace_id)
                                    ? 'bg-emerald-500/5'
                                    : 'hover:bg-zinc-900/40'
                            }`}
                        >
                            <td className="py-4 pl-4 pr-2 rounded-l-lg">
                                <div className="flex flex-col gap-1 min-w-0">
                                    <p className="text-[16px] font-semibold text-zinc-200 group-hover:text-white transition-colors truncate tracking-tight">
                                        {trace.service_name}
                                    </p>
                                    <p className="text-xs text-zinc-500 font-mono truncate max-w-[340px]">
                                        {trace.trace_id}
                                    </p>
                                </div>
                            </td>
                            <td className="py-4 px-2 text-sm text-zinc-400 tabular-nums vertical-align-middle">
                                {new Date(Number(trace.start_time)).toLocaleString('en-IN', {
                                    day: '2-digit',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit',
                                    hour12: true,
                                })}
                            </td>
                            <td className="py-4 px-2 text-sm font-semibold text-zinc-300 font-mono tabular-nums">
                                {trace.total_duration_ms}ms
                            </td>
                            <td className="py-4 px-2 text-sm text-zinc-400 font-mono tabular-nums">
                                {trace.span_count}
                            </td>
                            <td className="py-4 px-2 rounded-r-lg">
                                <div className="inline-flex">
                                    <StatusBadge hasError={trace.has_error} />
                                </div>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}