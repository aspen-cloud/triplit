import Repl from 'node:repl';
// import { TriplitClient } from '@triplit/client';
import * as Triplit from '@triplit/client';
import WebSocket from 'ws';
import { Command } from '../command.js';
import { createServerRequesterMiddleware } from '../middleware/add-server-requester.js';
import { parseQuery } from '../parser.js';
import { TriplitError } from '@triplit/db';
import { projectSchemaMiddleware } from '../middleware/project-schema.js';
import ora from 'ora';
import { Logger } from '@triplit/types/logger';

async function awaitConnect(client: Triplit.TriplitClient) {
  return new Promise<void>((resolve) => {
    // client.syncEngine.onConnectionStatusChange((status) => {
    //   console.log('STATUS', status);
    //   if (status === 'OPEN') {
    //     resolve();
    //   }
    // }, true);
    if (client.syncEngine.connectionStatus === 'OPEN') {
      resolve();
    }
    setInterval(() => {
      if (client.syncEngine.connectionStatus === 'OPEN') {
        resolve();
      }
    }, 300);
  });
}

class CliLogger implements Logger {
  private _scope: string;
  constructor({ scope }: { scope?: string }) {
    this._scope = scope ?? '';
  }
  log(msg: string) {
    // console.log(msg);
  }
  info(msg: string) {
    // console.info(msg);
  }
  error(msg: any, err: unknown) {
    console.log('logging error', typeof msg, typeof err);
    if (this._scope === 'sync') return;
    if (msg instanceof TriplitError) {
      console.error(msg.message);
      return;
    }
    if (err instanceof TriplitError) {
      console.log('TRIPLIT ERROR');
      console.error(err.message);
      return;
    }
    console.error(msg, err);
  }
  debug(msg: string) {
    // console.debug(msg);
  }
  warn(msg: string) {
    // console.warn(msg);
  }
  scope(scope: string) {
    return new CliLogger({ scope });
  }
}

// @ts-ignore
global.WebSocket = WebSocket;
export default Command({
  description: 'Start a REPL with the Triplit client',
  middleware: [
    createServerRequesterMiddleware({ destructive: false }),
    projectSchemaMiddleware,
  ],
  run: async ({ ctx }) => {
    const schema = await ctx.projectSchema.getSchema();
    const triplit = new Triplit.TriplitClient({
      serverUrl: ctx.remote.url,
      token: ctx.remote.token,
      schema: schema?.collections,
      logger: new CliLogger({}),
    });
    const spinner = ora('Connecting to Triplit server').start();
    setTimeout(() => {
      spinner.text =
        'Still trying to connect... Make sure the server is running and your ENV is configured correctly.';
    }, 3000);
    await awaitConnect(triplit);
    spinner.stop();
    triplit.onConnectionStatusChange((status) => {});
    // @ts-expect-error
    global.triplit = triplit;
    const repl = Repl.start(`db> `);
    repl.defineCommand('fetch', {
      action: async (query) => {
        const parsed = parseQuery(query);
        if (parsed.kind !== 'OK') {
          console.error(parsed.reason);
          return;
        }
        // console.log(JSON.stringify(parseQuery(query).value));
        const [collectionName, { where }] = parsed.value;
        const results = await triplit.fetch({
          collectionName,
          // TODO: properly assign types in the parser
          where: where as any,
          limit: 20,
        });
        console.log(console.table([...results.values()]));
        // return results;
      },
    });
    repl.defineCommand('schema', {
      action: async () => {
        const schema = await triplit.getSchema();
        if (!schema) {
          console.error('No schema found');
          return;
        }
        const { collections } = schema;
        for (const [name, collection] of Object.entries(collections)) {
          console.log(name);
          console.table(collection.schema.properties);
        }
      },
    });
  },
});
