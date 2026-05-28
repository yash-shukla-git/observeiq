'use client';

import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { TraceSummary } from '@/lib/api';

interface Props {
    traces: TraceSummary[];
}

export default function TraceTable({ traces }: Props) {
    const router = useRouter();

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Trace ID</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Spans</TableHead>
                    <TableHead>Status</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {traces.map((trace) => (
                    <TableRow
                        key={trace.trace_id}
                        className="cursor-pointer hover:bg-muted"
                        onClick={() => router.push(`/traces/${trace.trace_id}`)}
                    >
                        <TableCell className="font-mono text-xs">
                            {trace.trace_id.slice(0, 8)}...
                        </TableCell>
                        <TableCell>{trace.service_name}</TableCell>
                        <TableCell>
                            {new Date(Number(trace.start_time)).toLocaleString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                                hour12: true,
                            })}
                        </TableCell>
                        <TableCell>{trace.total_duration_ms}ms</TableCell>
                        <TableCell>{trace.span_count}</TableCell>
                        <TableCell>
                            <Badge variant={trace.has_error ? 'destructive' : 'default'}>
                                {trace.has_error ? 'error' : 'ok'}
                            </Badge>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}