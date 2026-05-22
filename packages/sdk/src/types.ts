export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  operationName: string;
  serviceName: string;
  startTime: number;      // Unix ms
  duration: number;       // ms
  status: 'ok' | 'error';
  tags: Record<string, string | number | boolean>;
  error?: string;
}