import { LogLevel, Logger } from './@triplit/types/logger.js';
import { TriplitError } from '@triplit/db';
import superjson from 'superjson';

export type LogListener = ((log: any) => void) | undefined;
export interface LoggerOptions {
  scope?: string;
  onLog?: LogListener;
  level?: LogLevel;
}

const LOG_LEVELS: LogLevel[] = ['error', 'warn', 'info', 'debug'];
export class DefaultLogger implements Logger {
  onLog: (log: any) => void;
  logScope: string | undefined;
  levelIndex: number;

  constructor(opts: LoggerOptions) {
    this.logScope = opts.scope;
    this.onLog = opts.onLog ?? (() => {});
    this.level = opts.level ?? 'info';
    this.levelIndex = LOG_LEVELS.indexOf(this.level);
  }

  set level(level: LogLevel) {
    this.levelIndex = LOG_LEVELS.indexOf(level);
  }

  get level() {
    return LOG_LEVELS[this.levelIndex];
  }

  private constructLogObj(level: LogLevel, message: any, ...args: any[]) {
    const logMsg = {
      args: args.map(superjson.serialize),
      scope: this.logScope,
      message,
      timestamp: Date.now(),
      level,
    };
    this.onLog(logMsg);
    return logMsg;
  }

  scope(logScope: string) {
    return new DefaultLogger({
      scope: logScope,
      onLog: this.onLog,
      level: this.level,
    });
  }

  info(message: any, ...args: any[]) {
    if (this.levelIndex < 2) return;
    const log = this.constructLogObj('info', message, ...args);
    console.info(`%c${log.scope}`, 'color: #888', message, args);
  }

  warn(message: any, ...args: any[]) {
    if (this.levelIndex < 1) return;
    const log = this.constructLogObj('warn', message, ...args);
    console.warn(log.scope, message, args);
  }

  error(message: any, ...args: any[]) {
    const errorArgs =
      args.length === 1 && args[0] instanceof TriplitError
        ? args[0].toJSON()
        : args;
    const log = this.constructLogObj('error', message, ...args);
    console.error(log.scope, log.message, errorArgs);
  }

  debug(message: any, ...args: any[]) {
    if (this.levelIndex < 3) return;
    const obj = this.constructLogObj('debug', message, ...args);
    if (obj.scope === 'sync') {
      if (obj.message === 'sent') {
        console.debug(
          '%c OUT ',
          'background: #228; color: #51acff',
          args[0].type,
          args[0].payload
        );
        return;
      }
      if (obj.message === 'received') {
        console.debug(
          '%c IN ',
          'background: #ccc; color: #333',
          args[0].type,
          args[0].payload
        );
        return;
      }
    }
    console.debug(
      `%c${obj.scope}`,
      'color: rgba(255,255,200,0.5)',
      obj.message,
      args
    );
  }
}
