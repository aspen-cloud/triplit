import { ClientSyncMessage, ServerSyncMessage } from '@triplit/server-core';
import { consola } from 'consola';
import { colorize } from 'consola/utils';

export function green(text: string) {
  return colorize('green', text);
}

export function white(text: string) {
  return colorize('white', text);
}

export function red(text: string) {
  return colorize('red', text);
}

export function yellow(text: string) {
  return colorize('yellow', text);
}

export function dim(text: string) {
  return colorize('dim', text);
}

export function bold(text: string) {
  return colorize('bold', text);
}

const RECEIVED_SYMBOL = '➡';
const SENT_SYMBOL = '⬅';
const ERROR_COLOR = red;
const SUCCESS_COLOR = green;
const REQUEST_TYPE_COLOR = yellow;

type Actions = 'sent' | 'received';

class Logger {
  private _logger: typeof consola;
  public verbose: boolean = false;
  constructor() {
    this._logger = consola;
  }

  info(message: any, ...args: any[]) {
    this._logger.info(message, ...args);
  }

  warn(message: any, ...args: any[]) {
    this._logger.warn(message, ...args);
  }

  error(message: any, ...args: any[]) {
    this._logger.error(message, ...args);
  }

  debug(message: any, ...args: any[]) {
    this._logger.debug(message, ...args);
  }
  logRequest(method: string, path: string, body?: any) {
    this.info(
      REQUEST_TYPE_COLOR(RECEIVED_SYMBOL),
      bold(method),
      REQUEST_TYPE_COLOR(path),
      ...(this.verbose && body
        ? [REQUEST_TYPE_COLOR('\nRequest body: '), formatBody(body)]
        : [])
    );
  }
  logResponse(
    method: string,
    path: string,
    statusCode: number,
    time: number,
    body?: any
  ) {
    const isError = isErrorResponse(statusCode);
    const primaryColor = isError ? ERROR_COLOR : SUCCESS_COLOR;
    this.info(
      primaryColor(SENT_SYMBOL),
      bold(method),
      REQUEST_TYPE_COLOR(path),
      isError
        ? ERROR_COLOR(String(statusCode))
        : SUCCESS_COLOR(String(statusCode)),
      dim(`${time}ms`),

      ...(this.verbose && body
        ? [SUCCESS_COLOR('\nResponse body: '), formatBody(body)]
        : [])
    );
  }
  logRequestAndResponse(request: any, response: any, time: number) {
    const { method, url, body: reqBody } = request;
    const { statusCode, body: resBody } = response;
    const isError = isErrorResponse(statusCode);
    this.info(
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

  logMessage(action: Actions, message: ServerSyncMessage | ClientSyncMessage) {
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
    this.info(primaryColor(symbol), primaryColor(type), messageBody);
  }
}

export const logger = new Logger();
logger.verbose = false;

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
  if (type === 'TRIPLES') {
    return formatTriplesPayload(action, payload, verbose);
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
