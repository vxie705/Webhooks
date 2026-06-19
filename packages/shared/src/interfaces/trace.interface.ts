export interface ITraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: 'INTERNAL' | 'CLIENT' | 'SERVER' | 'PRODUCER' | 'CONSUMER';
  status: 'OK' | 'ERROR';
  startTime: [number, number];
  endTime: [number, number];
  attributes: Record<string, string | number | boolean>;
  events: Array<{
    name: string;
    timestamp: [number, number];
    attributes?: Record<string, unknown>;
  }>;
}