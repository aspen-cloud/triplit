import type { LogHandler, LogRecord } from '@triplit/logger';
import { ClientSyncMessage, ServerSyncMessage } from '@triplit/server-core';

const START_GREEN = '\x1b[32m';
const START_WHITE = '\x1b[37m';
const START_RED = '\x1b[31m';
const START_YELLOW = '\x1b[33m';
const START_DIM = '\x1b[2m';
const START_BOLD = '\x1b[1m';
const END_COLOR = '\x1b[0m';
export function green(text: string) {
  return `${START_GREEN}${text}${END_COLOR}`;
}

export function white(text: string) {
  return `${START_WHITE}${text}${END_COLOR}`;
}

export function red(text: string) {
  return `${START_RED}${text}${END_COLOR}`;
}

export function yellow(text: string) {
  return `${START_YELLOW}${text}${END_COLOR}`;
}

export function dim(text: string) {
  return `${START_DIM}${text}${END_COLOR}`;
}

export function bold(text: string) {
  return `${START_BOLD}${text}${END_COLOR}`;
}

const RECEIVED_SYMBOL = '➡';
const SENT_SYMBOL = '⬅';
const ERROR_COLOR = red;
const SUCCESS_COLOR = green;
const REQUEST_TYPE_COLOR = yellow;
type Actions = 'sent' | 'received';

export class DevServerLogHandler implements LogHandler {
  verbose: boolean;
  constructor({ verbose = false }: { verbose?: boolean } = {}) {
    this.verbose = verbose;
  }

  log(record: LogRecord): void {
    const { level, message, timestamp, context, attributes } = record;
    if (!this.verbose && level === 'DEBUG') return;
    process.stdout.write(dim(new Date(timestamp).toLocaleTimeString() + ' '));
    if (level === 'ERROR' || level === 'FATAL') {
      console.error(
        `${red('⚠️  ERROR:')} ${white(message)}\n`,
        attributes || ''
      );
      return;
    }
    if (context === 'request') {
      // @ts-expect-error TODO: dangerously assuming attributes exists
      const { path, body } = attributes;
      this.#logRequest(path, body);
      return;
    }
    if (context === 'response') {
      // @ts-expect-error TODO: dangerously assuming attributes exists
      const { payload, statusCode, path } = attributes;
      this.#logResponse(path, statusCode, payload);
      return;
    }
    if (context === 'message') {
      //   const { action, message } = attributes;
      this.#logMessage(message as Actions, attributes as unknown as any);
      return;
    }
    console.log('ℹ', white(message));
    return;
    // const timeStr = new Date(timestamp).toISOString();
    // const logArgs = [
    //   `[${timeStr}] [${context ?? '*'}] ${message}`,
    //   attributes || '',
    // ];
    // if (level === 'ERROR' || level === 'FATAL') {
    //   console.error(...logArgs);
    // } else if (level === 'WARN') {
    //   console.warn(...logArgs);
    // } else {
    //   console.log(...logArgs);
    // }
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

  #logRequest(path: string[], body?: any) {
    console.log(
      REQUEST_TYPE_COLOR(RECEIVED_SYMBOL),
      REQUEST_TYPE_COLOR('/' + path.join('/')),
      ...(this.verbose && body
        ? [REQUEST_TYPE_COLOR('\nRequest body: '), formatBody(body)]
        : [])
    );
  }

  #logResponse(path: string[], statusCode: number, body?: any) {
    const isError = isErrorResponse(statusCode);
    const primaryColor = isError ? ERROR_COLOR : SUCCESS_COLOR;
    console.log(
      primaryColor(SENT_SYMBOL),
      dim('/' + path.join('/')),
      isError
        ? ERROR_COLOR(String(statusCode))
        : SUCCESS_COLOR(String(statusCode)),
      // dim(`${time}ms`),

      ...(this.verbose && body
        ? [SUCCESS_COLOR('\nResponse body: '), formatBody(body)]
        : [])
    );
  }
  #logRequestAndResponse(request: any, response: any, time: number) {
    const { method, url, body: reqBody } = request;
    const { statusCode, body: resBody } = response;
    const isError = isErrorResponse(statusCode);
    console.log(
      bold(method),
      REQUEST_TYPE_COLOR(url),
      isError
        ? ERROR_COLOR(String(statusCode))
        : SUCCESS_COLOR(String(statusCode)),
      dim(`${time}ms`),
      isError ? formatResponseError(resBody) : '',
      ...(this.verbose
        ? [
            REQUEST_TYPE_COLOR('\nRequest body: '),
            formatBody(reqBody),
            ...(!isError
              ? [SUCCESS_COLOR('\nResponse body: '), formatBody(resBody)]
              : []),
          ]
        : [])
    );
  }

  #logMessage(action: Actions, message: ServerSyncMessage | ClientSyncMessage) {
    const { type, payload } = message;
    const symbol = action === 'sent' ? SENT_SYMBOL : RECEIVED_SYMBOL;
    const isError = isErrorMessage(type);
    const primaryColor = isError
      ? ERROR_COLOR
      : action === 'received'
      ? REQUEST_TYPE_COLOR
      : SUCCESS_COLOR;
    const messageBody = isError
      ? formatErrorPayload(payload)
      : formatMessagePayload(action, message, this.verbose);
    console.log(primaryColor(symbol), primaryColor(type), messageBody);
  }
}

function formatResponseError({ name, message, status }: any) {
  if (name === undefined && message === undefined && status === undefined)
    return '';
  return `\n      ${red(String(status))} ${bold(red(name))}
        ${red(message)}`;
}

function formatBody(body: any) {
  if (body === undefined) return '';
  try {
    let stringified = JSON.stringify(body, null, 2);
    if (stringified.length > 100) {
      stringified = `${stringified.slice(0, 100)}...`;
    }
    return stringified;
  } catch (e) {
    return body;
  }
}

function formatErrorPayload({ type, message }: any) {
  return `${bold(red(type))} ${red(message)}`;
}

function isErrorResponse(statusCode: number) {
  return statusCode >= 400;
}

function formatMessagePayload(
  action: Actions,
  message: ServerSyncMessage | ClientSyncMessage,
  verbose: boolean
) {
  const { type, payload } = message;
  if (type === 'CONNECT_QUERY') {
    return formatConnectQueryPayload(payload, verbose);
  }
  if (payload === undefined || !verbose) return '';
  if (verbose) {
    return JSON.stringify(payload, null, 2);
  }
}

function formatTriplesPayload(
  action: Actions,
  payload: ClientSyncMessage['payload'],
  verbose: boolean
) {
  if (verbose) return JSON.stringify(payload, null, 2);
  // @ts-expect-error
  const { triples } = payload;
  return dim(`${action} ${triples.length} triple(s)`);
}

function formatConnectQueryPayload(
  payload: ClientSyncMessage['payload'],
  verbose: boolean
) {
  if (payload === undefined || !verbose) return '';
  if (verbose) {
    return JSON.stringify(payload, null, 2);
  }
}

function isErrorMessage(messageType: string) {
  return (
    messageType === 'ERROR' ||
    messageType === 'UNAUTHORIZED' ||
    messageType === 'INTERNAL_ERROR' ||
    messageType === 'CLOSE'
  );
}
