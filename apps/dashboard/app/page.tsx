import { getTraces } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default async function Home() {
  const traces = await getTraces();

  return (
      <main className="p-8">
        <h1 className="text-2xl font-semibold mb-6">Traces</h1>
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
                <TableRow key={trace.trace_id} className="cursor-pointer hover:bg-muted">
                  <TableCell className="font-mono text-xs">
                    {trace.trace_id.slice(0, 8)}...
                  </TableCell>
                  <TableCell>{trace.service_name}</TableCell>
                  <TableCell>{new Date(Number(trace.start_time)).toLocaleTimeString()}</TableCell>
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
      </main>
  );
}