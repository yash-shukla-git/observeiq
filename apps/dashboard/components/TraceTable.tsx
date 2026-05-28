'use client';

import { useEffect, useState, useRef } from 'react';
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
import { TraceSummary, getTraces } from '@/lib/api';

export default function TraceTable({ initialTraces }: { initialTraces: TraceSummary[] }) {
    const [traces, setTraces] = useState<TraceSummary[]>(initialTraces);
    const [newTraceIds, setNewTraceIds] = useState<Set<string>>(new Set());
    const knownIds = useRef<Set<string>>(new Set(initialTraces.map((t) => t.trace_id)));
    const router = useRouter();

    useEffect(() => {
        const interval = setInterval(async () => {
            const fresh = await getTraces();
            const newIds = fresh
                .map((t) => t.trace_id)
                .filter((id) => !knownIds.current.has(id));

            if (newIds.length > 0) {
                newIds.forEach((id) => knownIds.current.add(id));
                setNewTraceIds(new Set(newIds));
                setTraces(fresh);

                // Remove highlight after 2 second
                setTimeout(() => setNewTraceIds(new Set()), 2000);
            }
        }, 5000);

        return () => clearInterval(interval);
    }, []);

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
                        className={`cursor-pointer transition-colors duration-700 ${
                            newTraceIds.has(trace.trace_id)
                                ? 'bg-green-500/20'
                                : 'hover:bg-muted'
                        }`}
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