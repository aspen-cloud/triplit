import type { Session, SyncConnection } from '@triplit/server-core';
import type { ProjectJWT } from '@triplit/server-core/token';

declare module 'ws' {
  class _WS extends WebSocket {}
  export interface WebSocket extends _WS {
    isAlive: boolean;
    token?: ProjectJWT;
    clientId?: string;
    syncConnection?: SyncConnection;
  }
}

declare global {
  namespace Express {
    export interface Request {
      token?: ProjectJWT;
    }
  }
}
