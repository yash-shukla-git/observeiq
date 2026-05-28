import { SpanNode } from '@/lib/api';

interface Props {
    span: SpanNode;
    onClose: () => void;
}

export default function SpanDetail({ span, onClose }: Props) {
    const isError = span.status === 'error';

    return (
        <div className="mt-8 border border-white/5 rounded-xl p-6 bg-zinc-900/30 backdrop-blur-sm relative transition-all animate-in fade-in slide-in-from-bottom-2 duration-200">
            {/* Close Trigger Button */}
            <button
                onClick={onClose}
                className="absolute top-5 right-5 text-zinc-500 hover:text-zinc-200 transition-colors p-1 rounded-md hover:bg-white/5"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>

            <div className="mb-6">
                <h2 className="text-base font-bold tracking-tight text-zinc-100">Span Detail</h2>
                <p className="text-xs text-zinc-500 font-mono mt-0.5">{span.span_id}</p>
            </div>

            {/* Structured Parameters Panel */}
            <div className="grid grid-cols-2 gap-y-3.5 gap-x-6 text-sm border-b border-white/5 pb-5">
                <div className="flex flex-col gap-1">
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Trace ID</span>
                    <span className="font-mono text-zinc-300 break-all select-all">{span.trace_id}</span>
                </div>

                <div className="flex flex-col gap-1">
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Status</span>
                    <div>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            isError
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/10 shadow-[0_0_12px_rgba(244,63,94,0.05)]'
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10'
                        }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isError ? 'bg-rose-500 animate-pulse' : 'bg-emerald-400'}`} />
                            {span.status}
                        </span>
                    </div>
                </div>

                <div className="flex flex-col gap-1">
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Service Context</span>
                    <span className="text-zinc-200 font-medium">{span.service_name}</span>
                </div>

                <div className="flex flex-col gap-1">
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Operation Path</span>
                    <span className="text-zinc-200 font-medium">{span.operation_name}</span>
                </div>

                <div className="flex flex-col gap-1">
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Start Time Execution</span>
                    <span className="text-zinc-400 tabular-nums">
                        {new Date(Number(span.start_time)).toLocaleString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            fractionalSecondDigits: 3,
                            hour12: true,
                        })}
                    </span>
                </div>

                <div className="flex flex-col gap-1">
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Duration Impact</span>
                    <span className="text-zinc-200 font-semibold font-mono">{span.duration}ms</span>
                </div>
            </div>

            {/* Error Message Layout */}
            {span.error && (
                <div className="mt-5 p-4 rounded-lg bg-rose-500/5 border border-rose-500/10 flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-rose-400 uppercase tracking-widest">Exception Stack</span>
                    <span className="font-mono text-sm text-rose-300 whitespace-pre-wrap">{span.error}</span>
                </div>
            )}

            {/* Clean Metadata Tags Section */}
            {span.tags && Object.keys(span.tags).length > 0 && (
                <div className="mt-5">
                    <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Attributes & Tags</h3>
                    <div className="rounded-lg border border-white/5 bg-black/20 overflow-hidden divide-y divide-white/[0.04]">
                        {Object.entries(span.tags).map(([key, value]) => (
                            <div key={key} className="grid grid-cols-[220px_1fr] gap-4 px-4 py-2.5 items-center hover:bg-zinc-900/20 transition-colors">
                                <span className="text-xs font-medium text-zinc-400 truncate">{key}</span>
                                <span className="font-mono text-xs text-zinc-300 break-all select-all">{String(value)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}