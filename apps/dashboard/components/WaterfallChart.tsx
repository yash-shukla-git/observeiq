'use client';

import { SpanNode } from '@/lib/api';

interface FlatSpan {
    node: SpanNode;
    depth: number;
}

function flatten(nodes: SpanNode[], depth = 0): FlatSpan[] {
    const result: FlatSpan[] = [];
    for (const node of nodes) {
        result.push({ node, depth });
        result.push(...flatten(node.children, depth + 1));
    }
    return result;
}

const COLOR_PALETTE = [
    '#6366f1', '#22c55e', '#f59e0b', '#3b82f6',
    '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
];

const serviceColorMap = new Map<string, string>();
let colorIndex = 0;

function getColor(serviceName: string, isError: boolean): string {
    if (isError) return '#ef4444';
    if (!serviceColorMap.has(serviceName)) {
        serviceColorMap.set(serviceName, COLOR_PALETTE[colorIndex % COLOR_PALETTE.length]);
        colorIndex++;
    }
    return serviceColorMap.get(serviceName)!;
}

interface Props {
    tree: SpanNode[];
}

export default function WaterfallChart({ tree }: Props) {
    const flat = flatten(tree);

    if (flat.length === 0) return <p>No spans found.</p>;

    const traceStart = Math.min(...flat.map((f) => Number(f.node.start_time)));
    const traceEnd = Math.max(...flat.map((f) => Number(f.node.start_time) + Number(f.node.duration)));
    const totalDuration = traceEnd - traceStart || 1;

    return (
        <div className="w-full font-mono text-xs">
            {flat.map(({ node, depth }) => {
                const offsetPct = ((Number(node.start_time) - traceStart) / totalDuration) * 100;
                const widthPct = Math.max((Number(node.duration) / totalDuration) * 100, 1);
                const color = getColor(node.service_name, node.status === 'error');

                return (
                    <div key={node.span_id} className="flex items-center mb-1 gap-2">
                        {/* Label */}
                        <div
                            className="truncate shrink-0 text-right pr-2"
                            style={{ width: '260px', paddingLeft: `${depth * 16}px` }}
                        >
                            <span className="text-muted-foreground">{node.service_name} / </span>
                            <span>{node.operation_name}</span>
                        </div>

                        {/* Bar track */}
                        <div className="relative flex-1 h-5 bg-muted rounded">
                            <div
                                className="absolute h-full rounded"
                                style={{
                                    left: `${offsetPct}%`,
                                    width: `${widthPct}%`,
                                    backgroundColor: color,
                                }}
                            />
                        </div>

                        {/* Duration */}
                        <div className="shrink-0 w-16 text-right text-muted-foreground">
                            {node.duration}ms
                        </div>
                    </div>
                );
            })}
        </div>
    );
}