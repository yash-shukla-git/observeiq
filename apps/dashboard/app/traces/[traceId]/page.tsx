import { getTrace } from '@/lib/api';
import TraceView from '@/app/components/TraceView';
import Header from '@/app/components/Header';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { analyzeTrace, detectorDiagnosis } from '@observeiq/analysis';
import type { AnalysisSummary } from '@/lib/analysisTypes';
import { pool } from '@/lib/db';
import { getSession } from '@/lib/session';

interface Props {
    params: Promise<{ traceId: string }>;
}

export default async function TracePage({ params }: Props) {
    if (!(await getSession())) redirect('/login');

    const { traceId } = await params;
    const tree = await getTrace(traceId);
    if (!tree) notFound();
    const rootSpan = tree[0];

    // The checks are plain SQL and arithmetic, so they run on every page view. A failure here
    // must not break the trace page, the panel just says the checks could not run.
    let summary: AnalysisSummary | null = null;
    try {
        const analysis = await analyzeTrace(pool, traceId);
        if (analysis) {
            summary = {
                findings: analysis.findings.map((f) => ({
                    kind: f.kind, service: f.service, operation: f.operation,
                    spanIds: f.spanIds, severity: f.severity, message: f.message,
                })),
                primaryIndex: analysis.primary ? analysis.findings.indexOf(analysis.primary) : null,
                checks: detectorDiagnosis(analysis).checks,
            };
        }
    } catch (err) {
        console.error('[dashboard] trace analysis failed:', err);
    }

    return (
        <main className="min-h-screen w-full bg-[#111113] font-sans antialiased text-zinc-300">
            <Header />

            <div className="p-8 max-w-[1600px] mx-auto">
                <Link
                    href="/"
                    className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-6 group"
                >
                    <svg className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to Traces
                </Link>

                <div className="mb-8">
                    <h1 className="text-xl font-bold tracking-tight text-zinc-200">
                        {rootSpan ? rootSpan.service_name : 'Trace Detail'}
                    </h1>
                    <p className="text-xs text-zinc-600 font-mono mt-0.5">{traceId}</p>
                </div>

                <TraceView tree={tree} summary={summary} />
            </div>
        </main>
    );
}