'use client';

import { useState } from 'react';
import type { AnalysisResult } from '@observeiq/analysis';
import type { AnalysisSummary } from '@/lib/analysisTypes';
import { fallbackText, kindLabel } from '@/lib/analysisText';
import { parseSse } from '@/lib/sse';

interface Props {
    traceId: string;
    summary: AnalysisSummary | null;
    aiEnabled: boolean;
    onHighlight: (spanIds: string[]) => void;
}

type Phase = 'idle' | 'running' | 'done' | 'error';

export default function AnalysisPanel({ traceId, summary, aiEnabled, onHighlight }: Props) {
    const [phase, setPhase] = useState<Phase>('idle');
    const [status, setStatus] = useState('');
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [error, setError] = useState('');

    async function analyze() {
        setPhase('running');
        setStatus('Collecting evidence...');
        setResult(null);
        setError('');

        try {
            const res = await fetch(`/api/analysis/${encodeURIComponent(traceId)}`, { method: 'POST' });
            if (!res.ok || !res.body) throw new Error(res.status === 401 ? 'Please log in again' : 'The analysis could not be started');

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let finished = false;
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const parsed = parseSse(buffer);
                buffer = parsed.rest;
                for (const e of parsed.events) {
                    if (e.event === 'status') setStatus('Asking the model...');
                    if (e.event === 'result') {
                        setResult(e.data as AnalysisResult);
                        setPhase('done');
                        finished = true;
                    }
                    if (e.event === 'error') throw new Error((e.data as { message?: string }).message ?? 'The analysis failed');
                }
            }
            if (!finished) throw new Error('The analysis ended without an answer');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'The analysis failed');
            setPhase('error');
        }
    }

    const findings = summary?.findings ?? [];

    return (
        <aside className="rounded-xl border border-zinc-800/60 bg-[#18181b] p-5 space-y-5 text-sm">
            <div>
                <h2 className="text-base font-bold tracking-tight text-zinc-200">AI Analysis</h2>
                <p className="text-xs text-zinc-600 mt-0.5">Checks the trace against what is normal for each operation</p>
            </div>

            <section>
                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Detector findings</h3>
                {findings.length === 0 ? (
                    <p className="text-xs text-zinc-500">
                        {summary ? 'Nothing unusual was flagged in this trace.' : 'The detectors could not run for this trace.'}
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

            <section className="space-y-3">
                <button
                    onClick={analyze}
                    disabled={!aiEnabled || phase === 'running'}
                    className="w-full rounded bg-zinc-200 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-50 transition-colors"
                >
                    {phase === 'running' ? status : 'Analyze with AI'}
                </button>
                {!aiEnabled && (
                    <p className="text-xs text-zinc-600">No model is configured on the server (GEMINI_API_KEY). The detector findings above still work.</p>
                )}
                {phase === 'error' && <p className="text-xs text-rose-400">{error}</p>}

                {result && (
                    <div className="space-y-3">
                        {result.source === 'detector' && (
                            <p className="text-xs text-amber-500/90 rounded border border-amber-900/40 bg-amber-950/20 px-3 py-2">
                                {fallbackText(result.fallbackReason)}
                            </p>
                        )}

                        <p className="text-zinc-300">{result.summary}</p>

                        {result.rootCause.kind !== 'unknown' && (
                            <p className="text-xs text-zinc-500">
                                Likely cause: <span className="text-zinc-300">{kindLabel(result.rootCause.kind)}</span> in{' '}
                                <span className="font-mono text-zinc-300">{result.rootCause.service} {result.rootCause.operation}</span>
                                {result.confidence && <> ({result.confidence} confidence)</>}
                            </p>
                        )}

                        {result.evidence.length > 0 && (
                            <ul className="space-y-1">
                                {result.evidence.map((e, i) => (
                                    <li key={i} className="text-xs text-zinc-400">
                                        <button
                                            onClick={() => onHighlight([e.spanId])}
                                            className="mr-1.5 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300 hover:bg-zinc-700"
                                        >
                                            show span
                                        </button>
                                        {e.note}
                                    </li>
                                ))}
                            </ul>
                        )}

                        {result.checks.length > 0 && (
                            <div>
                                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">What to check next</h3>
                                <ul className="list-disc pl-4 space-y-1 text-xs text-zinc-400">
                                    {result.checks.map((c, i) => <li key={i}>{c}</li>)}
                                </ul>
                            </div>
                        )}

                        <p className="text-[10px] text-zinc-600 font-mono">
                            {result.source === 'llm'
                                ? `${result.provider} ${result.model}, ${result.cached ? 'cached' : `${result.attempts} call${result.attempts === 1 ? '' : 's'}, ${result.latencyMs} ms`}`
                                : 'detectors only'}
                        </p>
                    </div>
                )}
            </section>
        </aside>
    );
}
