import repl from 'node:repl';
// import { TriplitClient } from '@triplit/client';
import * as Triplit from '@triplit/client';
import WebSocket from 'ws';
import { Command } from '../command.js';
import { serverRequesterMiddleware } from '../middleware/add-server-requester.js';

// @ts-ignore
global.WebSocket = WebSocket;
export default Command({
  description: 'Start a REPL with the Triplit client',
  middleware: [serverRequesterMiddleware],
  run: ({ ctx }) => {
    global.triplit = new Triplit.TriplitClient({
      serverUrl: ctx.url,
      token: ctx.token,
    });
    repl.start(`db> `);
  },
});
