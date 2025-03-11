export const LOG_LEVELS = [
  'TRACE', // 1-4
  'DEBUG', // 5-8
  'INFO', // 9-12
  'WARN', // 13-16
  'ERROR', // 17-20
  'FATAL', // 21-24
] as const;

export type LogLevelName = (typeof LOG_LEVELS)[number];

export const logLevelNumberToLevelName = (number: number): LogLevelName => {
  if (number < 5) return 'TRACE';
  if (number < 9) return 'DEBUG';
  if (number < 13) return 'INFO';
  if (number < 17) return 'WARN';
  if (number < 21) return 'ERROR';
  return 'FATAL';
};

/***************************************
 * LOG RECORD INTERFACE
 ***************************************/
export interface LogRecord {
  level: LogLevelName;
  message: string;
  timestamp: number; // Unix epoch or Date.now()
  context?: string; // e.g. "user-service"
  attributes?: Record<string, any>;
  resource?: Record<string, any>; // For additional OT resource info
}

export interface LogHandler {
  /**
   * Handles a single LogRecord. For example, writing to console, file, or
   * sending to a remote logging service.
   */
  log(record: LogRecord): void;

  /**
   * Starts a new span for tracing.
   * Returns a handle/ID that can be used to end the span.
   */
  startSpan(
    name: string,
    context?: string,
    attributes?: Record<string, any>
  ): any;

  /**
   * Ends an existing span (closing the trace).
   */
  endSpan(span: any): void;

  /**
   * Records a metric, e.g. gauge, counter, etc.
   */
  recordMetric(
    name: string,
    value: number,
    attributes?: Record<string, any>
  ): void;
}

/***************************************
 * DISPOSABLE SPAN WRAPPER
 * This is the object you get when you call `logger.trace(...)`.
 * It implements [Symbol.dispose] so that when you exit the `using` block,
 * it automatically calls logger.endSpan(...).
 ***************************************/
export class DisposableSpan {
  constructor(
    private logger: Logger,
    private spans: any[]
  ) {}

  [Symbol.dispose](): void {
    this.logger._endSpans(this.spans);
  }
}

/***************************************
 * LOGGER CLASS
 ***************************************/
export class Logger {
  private handlers: LogHandler[];
  private loggerContext?: string;
  private resourceAttributes: Record<string, any>;
  exclusiveHandlerMode: boolean = false;

  constructor(
    handlers?: LogHandler[],
    resourceAttributes?: Record<string, any>
  ) {
    // Provide a default ConsoleTransport if none supplied:
    this.handlers = handlers ?? [];

    // Resource attributes allow you to specify
    // things like service.name, service.version, etc.
    this.resourceAttributes = resourceAttributes || {};
  }

  registerHandler(
    handler: LogHandler,
    options?: { exclusive?: boolean }
  ): boolean {
    if (this.exclusiveHandlerMode) {
      return false;
    }
    this.handlers.push(handler);
    if (options?.exclusive) {
      this.exclusiveHandlerMode = true;
    }
    return true;
  }

  /**
   * Create a new Logger that has a given context.
   * This context can represent a subsystem, feature, or namespace.
   */
  context(context: string): Logger {
    const childLogger = new Logger(this.handlers, this.resourceAttributes);
    childLogger.loggerContext = context;
    return childLogger;
  }

  /**
   * Catch all internal log method to dispatch to log handlers
   */
  _log(level: LogLevelName, message: string, attributes?: Record<string, any>) {
    const record: LogRecord = {
      level,
      message,
      timestamp: Date.now(),
      context: this.loggerContext,
      attributes,
      resource: this.resourceAttributes,
    };

    // Send to all registered transports
    for (const handler of this.handlers) {
      handler.log(record);
    }
  }

  spanTrace(name: string, attributes?: Record<string, any>): DisposableSpan {
    // This method starts a "span" for tracing.
    // We'll return a DisposableSpan that calls endSpan upon disposal.
    const startedSpans = this.handlers.map((transport) =>
      transport.startSpan(name, this.loggerContext, {
        ...this.resourceAttributes,
        ...attributes,
      })
    );
    return new DisposableSpan(this, startedSpans);
  }

  trace(message: string, attributes?: Record<string, any>) {
    this._log('TRACE', message, attributes);
  }

  debug(message: string, attributes?: Record<string, any>) {
    this._log('DEBUG', message, attributes);
  }

  // Using `info` is preferred
  log(message: string, attributes?: Record<string, any>) {
    this.info(message, attributes);
  }

  info(message: string, attributes?: Record<string, any>) {
    this._log('INFO', message, attributes);
  }

  warn(message: string, attributes?: Record<string, any>) {
    this._log('WARN', message, attributes);
  }

  error(message: string, attributes?: Record<string, any>) {
    this._log('ERROR', message, attributes);
  }

  fatal(message: string, attributes?: Record<string, any>) {
    this._log('FATAL', message, attributes);
  }

  /*******************************
   * METRICS
   *******************************/

  /**
   * Emit a metric value to all transports.
   */
  metric(name: string, value: number, attributes?: Record<string, any>): void {
    for (const transport of this.handlers) {
      transport.recordMetric(name, value, {
        ...this.resourceAttributes,
        ...attributes,
      });
    }
  }

  /*******************************
   * INTERNAL SPAN HANDLING
   *******************************/

  /**
   * Called internally when a DisposableSpan goes out of scope
   * and triggers its [Symbol.dispose]() method.
   */
  _endSpans(spans: any[]): void {
    for (let i = 0; i < spans.length; i++) {
      const span = spans[i];
      const transport = this.handlers[i];
      if (transport) {
        transport.endSpan(span);
      }
    }
  }
}

export const logger = new Logger();
