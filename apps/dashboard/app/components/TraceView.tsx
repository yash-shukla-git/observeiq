'use client';

import { useState } from 'react';
import type { SpanNode } from '@/lib/api';
import type { AnalysisSummary } from '@/lib/analysisTypes';
import AnalysisPanel from './AnalysisPanel';
import WaterfallChart from './WaterfallChart';

interface Props {
    tree: SpanNode[];
    summary: AnalysisSummary | null;
}

// Waterfall on the left, trace analysis on the right. Clicking a finding highlights its spans.
export default function TraceView({ tree, summary }: Props) {
    const [highlighted, setHighlighted] = useState<string[]>([]);

    return (
        <div className="grid gap-6 items-start lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
            <div className="rounded-xl border border-zinc-800/60 bg-[#18181b] p-6">
                <WaterfallChart tree={tree} highlightedSpanIds={highlighted} />
            </div>
            <AnalysisPanel summary={summary} onHighlight={setHighlighted} />
        </div>
    );
}
