import type { LogHandler, LogRecord } from '../index.ts';

export class ConsoleHandler implements LogHandler {
  log(record: LogRecord): void {
    const { level, message, timestamp, context, attributes } = record;
    const timeStr = new Date(timestamp).toISOString();
    const logArgs = [
      `[${timeStr}] [${context ?? '*'}] ${message}`,
      attributes || '',
    ];
    if (level === 'ERROR' || level === 'FATAL') {
      console.error(...logArgs);
    } else if (level === 'WARN') {
      console.warn(...logArgs);
    } else {
      console.log(...logArgs);
    }
  }

  startSpan(
    name: string,
    context?: string,
    attributes?: Record<string, any>
  ): any {
    // Minimal/no-op example. A real implementation might integrate
    // with an OTLP exporter or local trace library.
    console.log(`Starting span "${name}" in context="${context}"`, attributes);
    return {
      name,
      context,
      attributes,
      startTime: Date.now(),
    };
  }

  endSpan(span: any): void {
    if (!span) return;
    const durationMs = Date.now() - span.startTime;
    console.log(`Ending span "${span.name}". Duration: ${durationMs}ms`);
  }

  recordMetric(
    name: string,
    value: number,
    attributes?: Record<string, any>
  ): void {
    console.log(`Metric [${name}]: ${value}`, attributes || '');
  }
}
