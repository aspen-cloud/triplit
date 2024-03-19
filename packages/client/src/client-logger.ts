import { LogLevel, Logger } from '@triplit/types/logger.js';

export type LogCapturer = ((log: any) => void) | undefined;
export interface LoggerOptions {
  scope?: string;
  capture?: LogCapturer;
  level?: LogLevel;
}

export class DefaultLogger implements Logger {
  onLog: (log: any) => void;
  logScope: string | undefined;
  level: LogLevel = 'info';
  constructor(opts: LoggerOptions) {
    this.logScope = opts.scope;
    this.onLog = opts.capture ?? (() => {});
  }

  private constructLogObj(level: LogLevel, message: any, ...args: any[]) {
    const logMsg = {
      args,
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
      capture: this.onLog,
      level: this.level,
    });
  }

  info(message: any, ...args: any[]) {
    const log = this.constructLogObj('info', message, ...args);
    console.info(`%c${log.scope}`, 'color: #888', log.message, log.args);
  }

  warn(message: any, ...args: any[]) {
    console.warn(this.constructLogObj('warn', message, ...args));
  }

  error(message: any, ...args: any[]) {
    console.error(this.constructLogObj('error', message, ...args));
  }

  debug(message: any, ...args: any[]) {
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
      obj.args
    );
  }
}
