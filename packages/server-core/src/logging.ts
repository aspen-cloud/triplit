export interface Logger {
  log: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  debug: (message: string, ...args: any[]) => void;
}

export const NullLogger: Logger = {
  log: () => {},
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
};
