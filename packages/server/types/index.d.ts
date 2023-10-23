import { ParsedToken, Session } from '@triplit/server-core';

declare module 'ws' {
  class _WS extends WebSocket {}
  export interface WebSocket extends _WS {
    isAlive: boolean;
    token?: ParsedToken;
    clientId?: string;
    session?: Session;
  }
}

// declare global {
//   namespace Express {
//     interface Request {
//       token?: ParsedToken;
//     }
//   }
// }

declare global {
  namespace Express {
    export interface Request {
      token?: ParsedToken;
    }
  }
}
