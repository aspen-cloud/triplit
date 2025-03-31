import { LogHandler, LogRecord } from '@triplit/logger';

export class LogHandlerSpy implements LogHandler {
  logs = [] as LogRecord[];

  log(record: LogRecord): void {
    this.logs.push(record);
  }
  startSpan(name: string, context?: string, attributes?: Record<string, any>) {
    throw new Error('Method not implemented.');
  }
  endSpan(span: any): void {
    throw new Error('Method not implemented.');
  }
  recordMetric(
    name: string,
    value: number,
    attributes?: Record<string, any>
  ): void {
    throw new Error('Method not implemented.');
  }
}
