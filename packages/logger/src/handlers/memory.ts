import { LogHandler } from '../index.js';

export class MemoryHandler implements LogHandler {
  // Array to store log records in memory
  logs: any[] = [];

  log(record: any): void {
    // Store the log record in the array
    this.logs.push(record);
  }

  startSpan(
    name: string,
    context?: string,
    attributes?: Record<string, any>
  ): any {
    this.logs.push(
      `Starting span "${name}" in context="${context ?? ''}" ${attributes ? JSON.stringify(attributes) : ''}`
    );
    return { name, context, attributes, startTime: Date.now() };
  }

  endSpan(span: any): void {
    if (!span) return;
    const durationMs = Date.now() - span.startTime;
    this.logs.push(`Ending span "${span.name}". Duration: ${durationMs}ms`);
  }

  recordMetric(
    name: string,
    value: number,
    attributes?: Record<string, any>
  ): void {
    this.logs.push(
      `Metric [${name}]: ${value} ${attributes ? JSON.stringify(attributes) : ''}`
    );
  }
}
