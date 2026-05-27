import { SpanNode } from '@/lib/api';
import { Badge } from '@/components/ui/badge';

interface Props {
    span: SpanNode;
    onClose: () => void;
}

export default function SpanDetail({ span, onClose }: Props) {
    return (
        <div className="mt-6 border rounded-lg p-4 bg-muted/30 relative">
            <button
                onClick={onClose}
                className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
            >
                ✕
            </button>

            <h2 className="text-sm font-semibold mb-4">Span Detail</h2>

            <div className="grid grid-cols-2 gap-2 text-xs">
                <span className="text-muted-foreground">Span ID</span>
                <span className="font-mono">{span.span_id}</span>

                <span className="text-muted-foreground">Trace ID</span>
                <span className="font-mono">{span.trace_id}</span>

                <span className="text-muted-foreground">Service</span>
                <span>{span.service_name}</span>

                <span className="text-muted-foreground">Operation</span>
                <span>{span.operation_name}</span>

                <span className="text-muted-foreground">Start Time</span>
                <span>{new Date(Number(span.start_time)).toLocaleString()}</span>

                <span className="text-muted-foreground">Duration</span>
                <span>{span.duration}ms</span>

                <span className="text-muted-foreground">Status</span>
                <span>
          <Badge variant={span.status === 'error' ? 'destructive' : 'default'}>
            {span.status}
          </Badge>
        </span>

                {span.error && (
                    <>
                        <span className="text-muted-foreground">Error</span>
                        <span className="text-red-500">{span.error}</span>
                    </>
                )}
            </div>

            {span.tags && Object.keys(span.tags).length > 0 && (
                <div className="mt-4">
                    <h3 className="text-xs font-semibold mb-2 text-muted-foreground">Tags</h3>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                        {Object.entries(span.tags).map(([key, value]) => (
                            <div key={key} className="contents">
                                <span className="text-muted-foreground">{key}</span>
                                <span className="font-mono">{String(value)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}