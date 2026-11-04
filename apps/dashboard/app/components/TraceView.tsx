'use client';

import { useState } from 'react';
import type { SpanNode } from '@/lib/api';
import type { AnalysisSummary } from '@/lib/analysisTypes';
import AnalysisPanel from './AnalysisPanel';
import WaterfallChart from './WaterfallChart';

interface Props {
    traceId: string;
    tree: SpanNode[];
    summary: AnalysisSummary | null;
    aiEnabled: boolean;
}

// Waterfall on the left, analysis on the right. Clicking a finding or a piece of evidence highlights its spans.
export default function TraceView({ traceId, tree, summary, aiEnabled }: Props) {
    const [highlighted, setHighlighted] = useState<string[]>([]);

    return (
        <div className="grid gap-6 items-start lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
            <div className="rounded-xl border border-zinc-800/60 bg-[#18181b] p-6">
                <WaterfallChart tree={tree} highlightedSpanIds={highlighted} />
            </div>
            <AnalysisPanel traceId={traceId} summary={summary} aiEnabled={aiEnabled} onHighlight={setHighlighted} />
        </div>
    );
}
