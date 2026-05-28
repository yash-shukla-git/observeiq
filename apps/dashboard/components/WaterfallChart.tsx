'use client';

import { useState } from 'react';
import { SpanNode } from '@/lib/api';
import SpanDetail from './SpanDetail';

interface FlatSpan {
    node: SpanNode;
    depth: number;
    isLastChild: boolean;
}

function flatten(nodes: SpanNode[], depth = 0): FlatSpan[] {
    const result: FlatSpan[] = [];
    nodes.forEach((node, index) => {
        const isLastChild = index === nodes.length - 1;
        result.push({ node, depth, isLastChild });
        result.push(...flatten(node.children, depth + 1));
    });
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
    const [selected, setSelected] = useState<SpanNode | null>(null);
    const flat = flatten(tree);

    if (flat.length === 0) return <p className="text-zinc-500 text-sm font-sans">No spans found.</p>;

    const traceStart = Math.min(...flat.map((f) => Number(f.node.start_time)));
    const traceEnd = Math.max(...flat.map((f) => Number(f.node.start_time) + Number(f.node.duration)));
    const totalDuration = traceEnd - traceStart || 1;

    return (
        <div className="w-full font-mono text-sm space-y-0.5 select-none">
            {flat.map(({ node, depth, isLastChild }) => {
                const offsetPct = ((Number(node.start_time) - traceStart) / totalDuration) * 100;
                const widthPct = Math.max((Number(node.duration) / totalDuration) * 100, 1);
                const isError = node.status === 'error';
                const color = getColor(node.service_name, isError);
                const isSelected = selected?.span_id === node.span_id;

                return (
                    <div
                        key={node.span_id}
                        className={`flex items-center h-9 px-3 rounded-lg cursor-pointer border border-transparent transition-all duration-150 ${
                            isSelected
                                ? 'bg-zinc-900 border-white/5 shadow-inner'
                                : 'hover:bg-zinc-900/40'
                        }`}
                        onClick={() => setSelected(isSelected ? null : node)}
                    >
                        {/* Service / Operation Column with Depth Tree Lines */}
                        <div
                            className="truncate shrink-0 pr-4 flex items-center relative h-full text-left"
                            style={{ width: '340px', paddingLeft: `${depth * 20}px` }}
                        >
                            {depth > 0 && (
                                <div
                                    className="absolute left-0 top-0 bottom-0 border-l border-white/10"
                                    style={{
                                        left: `${(depth - 1) * 20 + 8}px`,
                                        height: isLastChild ? '50%' : '100%'
                                    }}
                                />
                            )}
                            {depth > 0 && (
                                <div
                                    className="absolute border-b border-white/10"
                                    style={{
                                        left: `${(depth - 1) * 20 + 8}px`,
                                        width: '12px',
                                        top: '50%'
                                    }}
                                />
                            )}
                            <div className="truncate tracking-tight">
                                <span className="font-semibold text-zinc-100">{node.service_name}</span>
                                <span className="text-zinc-500 font-normal"> / {node.operation_name}</span>
                            </div>
                        </div>

                        {/* Timeline Window - Floating Bars with Zero Track Background */}
                        <div className="relative flex-1 h-full flex items-center mx-4">
                            <div
                                className={`absolute h-3.5 rounded-full transition-all duration-200 relative group ${
                                    isError ? 'shadow-[0_0_12px_rgba(239,68,68,0.25)]' : ''
                                }`}
                                style={{
                                    left: `${offsetPct}%`,
                                    width: `${widthPct}%`,
                                    backgroundColor: color,
                                }}
                            >
                                {isError && (
                                    <span className="absolute inset-0 rounded-full bg-white/20 animate-pulse" />
                                )}
                            </div>
                        </div>

                        {/* Right Aligned Duration Tag */}
                        <div className="shrink-0 w-20 text-right text-sm font-semibold text-zinc-400 tabular-nums">
                            {node.duration}ms
                        </div>
                    </div>
                );
            })}

            {selected && <SpanDetail span={selected} onClose={() => setSelected(null)} />}
        </div>
    );
}