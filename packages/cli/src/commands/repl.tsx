import Repl from 'node:repl';
// import { TriplitClient } from '@triplit/client';
import * as Triplit from '@triplit/client';
import WebSocket from 'ws';
import { Command } from '../command.js';
import { serverRequesterMiddleware } from '../middleware/add-server-requester.js';
import { readLocalSchema } from '../schema.js';
import { parseQuery } from '../parser.js';
import { schemaToJSON } from '@triplit/db';

// @ts-ignore
global.WebSocket = WebSocket;
export default Command({
  description: 'Start a REPL with the Triplit client',
  middleware: [serverRequesterMiddleware],
  run: async ({ ctx }) => {
    const triplit = new Triplit.TriplitClient({
      serverUrl: ctx.url,
      token: ctx.token,
      schema: await readLocalSchema(),
    });
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
        const schema = schemaToJSON(await triplit.db.getSchema());
        const { collections } = schema;
        for (const [name, collection] of Object.entries(collections)) {
          console.log(name);
          console.table(collection.schema.properties);
        }
      },
    });
  },
});
