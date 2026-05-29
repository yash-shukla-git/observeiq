import { getTrace } from '@/lib/api';
import WaterfallChart from '@/app/components/WaterfallChart';
import Header from '@/app/components/Header';
import Link from 'next/link';

interface Props {
    params: Promise<{ traceId: string }>;
}

export default async function TracePage({ params }: Props) {
    const { traceId } = await params;
    const tree = await getTrace(traceId);
    const rootSpan = tree[0];

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

                <div className="rounded-xl border border-zinc-800/60 bg-[#18181b] p-6">
                    <WaterfallChart tree={tree} />
                </div>
            </div>
        </main>
    );
}