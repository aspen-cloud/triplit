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
import { Logger, LogHandler, LogRecord } from '@triplit/logger';

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

class CliLogHandler implements LogHandler {
  log(record: LogRecord) {
    const { level, context, message, attributes } = record;
    if (level === 'ERROR' || level === 'FATAL') {
      console.log('logging error', typeof message, typeof attributes);
      if (context === 'sync') return;
      // I think this is correct
      // @ts-expect-error
      if (message instanceof TriplitError) {
        console.error(message.message);
        return;
      }
      if (attributes instanceof TriplitError) {
        console.error(attributes.message);
        return;
      }
      console.error(message, attributes);
    } else {
      console.log(message, attributes);
    }
  }
  startSpan(name: string, context?: string, attributes?: Record<string, any>) {
    throw new Error('Method not implemented.');
  }
  endSpan(span: any): void {
    throw new Error('Method not implemented.');
  }
  recordMetric(name: string, value: number, attributes?: Record<string, any>) {
    throw new Error('Method not implemented.');
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
      logger: new Logger([new CliLogHandler()]),
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
