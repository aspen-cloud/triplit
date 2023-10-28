import repl from 'node:repl';
// import { TriplitClient } from '@triplit/client';
import * as Triplit from '@triplit/client';
import WebSocket from 'ws';
import { Command } from '../command.js';
import { serverRequesterMiddleware } from '../middleware/add-server-requester.js';

global.WebSocket = WebSocket;
export default Command({
  description: 'Start a REPL with the Triplit client',
  middleware: [serverRequesterMiddleware],
  run: ({ ctx }) => {
    const [protocol, host] = ctx.url.split('://');
    //   console.log(Triplit.TriplitClient);
    global.triplit = new Triplit.TriplitClient({
      sync: {
        server: host,
        secure: protocol === 'https',
      },
      auth: {
        token: ctx.token,
      },
    });

    repl.start(`db> `);
  },
});
