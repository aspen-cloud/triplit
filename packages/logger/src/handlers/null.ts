import { LogHandler } from '../index.js';

// This is a no-op log handler that does nothing with the logs.
export class NullHandler implements LogHandler {
  log(): void {}

  startSpan(
    name: string,
    context?: string,
    attributes?: Record<string, any>
  ): any {
    // Return a dummy span object
    return { name, context, attributes, startTime: Date.now() };
  }

  endSpan(): void {}

  recordMetric(): void {}
}
