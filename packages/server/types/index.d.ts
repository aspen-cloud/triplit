import type { Session, Connection } from '@triplit/server-core';
import type { ProjectJWT } from '@triplit/server-core/token';

declare module 'ws' {
  class _WS extends WebSocket {}
  export interface WebSocket extends _WS {
    isAlive: boolean;
    token?: ProjectJWT;
    clientId?: string;
    session?: Connection;
  }
}

declare global {
  namespace Express {
    export interface Request {
      token?: ProjectJWT;
    }
  }
}
