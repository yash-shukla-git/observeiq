'use client';

import type { AnalysisSummary } from '@/lib/analysisTypes';
import { kindLabel } from '@/lib/analysisText';

interface Props {
    summary: AnalysisSummary | null;
    onHighlight: (spanIds: string[]) => void;
}

export default function AnalysisPanel({ summary, onHighlight }: Props) {
    const findings = summary?.findings ?? [];

    return (
        <aside className="rounded-xl border border-zinc-800/60 bg-[#18181b] p-5 space-y-5 text-sm">
            <div>
                <h2 className="text-base font-bold tracking-tight text-zinc-200">Trace analysis</h2>
                <p className="text-xs text-zinc-600 mt-0.5">Checks the trace against what is normal for each operation</p>
            </div>

            <section>
                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Findings</h3>
                {findings.length === 0 ? (
                    <p className="text-xs text-zinc-500">
                        {summary ? 'Nothing unusual was flagged in this trace.' : 'The checks could not run for this trace.'}
                    </p>
                ) : (
                    <ul className="space-y-1.5">
                        {findings.map((f, i) => (
                            <li key={i}>
                                <button
                                    onClick={() => onHighlight(f.spanIds)}
                                    className="w-full text-left rounded-lg border border-zinc-800/60 px-3 py-2 hover:bg-zinc-800/30 transition-colors"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-semibold text-zinc-300">{kindLabel(f.kind)}</span>
                                        {i === summary?.primaryIndex && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300">likely cause</span>
                                        )}
                                    </div>
                                    <p className="text-xs text-zinc-500 mt-0.5">{f.message}</p>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {summary && summary.checks.length > 0 && (
                <section>
                    <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">What to check next</h3>
                    <ul className="list-disc pl-4 space-y-1 text-xs text-zinc-400">
                        {summary.checks.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                </section>
            )}
        </aside>
    );
}
