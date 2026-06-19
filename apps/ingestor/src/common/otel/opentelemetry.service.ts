import { Injectable, Logger } from '@nestjs/common';
import { trace, context, Span, SpanStatusCode } from '@opentelemetry/api';

@Injectable()
export class OpenTelemetryService {
  private readonly logger = new Logger(OpenTelemetryService.name);
  private readonly tracer = trace.getTracer('webhook-hub-ingestor');

  startSpan(name: string, attributes?: Record<string, unknown>): Span {
    const span = this.tracer.startSpan(name);
    if (attributes) {
      span.setAttributes(attributes as Record<string, string | number | boolean>);
    }
    return span;
  }

  endSpan(span: Span, status: 'OK' | 'ERROR' = 'OK'): void {
    span.setStatus({ code: status === 'OK' ? SpanStatusCode.OK : SpanStatusCode.ERROR });
    span.end();
  }

  recordException(span: Span, error: Error): void {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  }

  async runWithSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    attributes?: Record<string, unknown>,
  ): Promise<T> {
    const span = this.startSpan(name, attributes);
    try {
      const result = await context.with(trace.setSpan(context.active(), span), () => fn(span));
      this.endSpan(span, 'OK');
      return result;
    } catch (error) {
      this.recordException(span, error instanceof Error ? error : new Error(String(error)));
      this.endSpan(span, 'ERROR');
      throw error;
    }
  }
}