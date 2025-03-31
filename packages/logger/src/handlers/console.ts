import type { LogHandler, LogRecord } from '../index.ts';

export class ConsoleHandler implements LogHandler {
  constructor(options: { formatter?: (record: LogRecord) => any[] }) {
    this.formatter = options.formatter ?? ((record) => [record]);
  }

  private formatter: (record: LogRecord) => any[];

  log(record: LogRecord): void {
    const { level } = record;
    const logArgs = this.formatter(record);
    if (
      (level === 'ERROR' || level === 'FATAL') &&
      methodExists(console.error)
    ) {
      console.error(...logArgs);
    } else if (level === 'WARN' && methodExists(console.warn)) {
      console.warn(...logArgs);
    } else if (level === 'INFO' && methodExists(console.info)) {
      console.info(...logArgs);
    } else if (level === 'DEBUG' && methodExists(console.debug)) {
      console.debug(...logArgs);
    } else {
      // Fallback to console.log
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

function methodExists(method: any) {
  return typeof method === 'function';
}
