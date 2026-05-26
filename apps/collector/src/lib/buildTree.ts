export interface SpanNode {
    id: number;
    trace_id: string;
    span_id: string;
    parent_span_id: string | null;
    operation_name: string;
    service_name: string;
    start_time: number;
    duration: number;
    status: string;
    error: string | null;
    tags: Record<string, unknown>;
    children: SpanNode[];
}

export function buildTree(spans: SpanNode[]): SpanNode[] {
    const map = new Map<string, SpanNode>();

    for (const span of spans) {
        map.set(span.span_id, { ...span, children: [] });
    }

    const roots: SpanNode[] = [];

    for (const span of spans) {
        const node = map.get(span.span_id)!;
        if (span.parent_span_id && map.has(span.parent_span_id)) {
            map.get(span.parent_span_id)!.children.push(node);
        } else {
            roots.push(node);
        }
    }

    return roots;
}