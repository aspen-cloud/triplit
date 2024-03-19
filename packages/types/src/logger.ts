export interface Logger {
  info: (message: any, ...args: any[]) => void;
  warn: (message: any, ...args: any[]) => void;
  error: (message: any, ...args: any[]) => void;
  debug: (message: any, ...args: any[]) => void;
  scope: (logScope: string) => Logger;
}

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
