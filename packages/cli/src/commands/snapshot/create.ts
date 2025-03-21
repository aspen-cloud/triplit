import { Command } from '../../command.js';
import * as Flag from '../../flags.js';
import { createServerRequesterMiddleware } from '../../middleware/add-server-requester.js';
import fs from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick.js';
import { streamArray } from 'stream-json/streamers/StreamArray.js';

const streamPipeline = promisify(pipeline);

export default Command({
  description: 'Exports all database information to files.',
  experimental: true,
  flags: {
    outDir: Flag.String({
      description: 'The directory to save the snapshot to.',
    }),
  },
  middleware: [
    createServerRequesterMiddleware({
      destructive: false,
    }),
  ],
  run: async ({ flags, ctx }) => {
    const outDir = flags.outDir ?? `./snapshot-${Date.now()}`;
    const dbVersion = await getDBVersion();
    fs.mkdirSync(outDir, { recursive: true });
    try {
      if (dbVersion === '0.0.0') {
        await snapshotV0(outDir);
      } else if (dbVersion === '1.0.0') {
        await snapshotV1(outDir);
      } else {
        throw new Error(`Unsupported database version: ${dbVersion}`);
      }
    } catch (e) {
      fs.rmSync(outDir, { recursive: true });
      throw e;
    }

    async function snapshotV0(outDir: string) {
      const schemaRes = await ctx.remote.request_NodeFetch('POST', '/schema', {
        body: JSON.stringify({
          format: 'json',
        }),
      });
      if (!schemaRes.ok) {
        throw new Error(await schemaRes.text());
      }
      const payload: any = await schemaRes.json();
      const schema = payload.schema;
      if (!schema) {
        console.log(
          'No schema found on server. Snapshot logic not implemented.'
        );
        process.exit(1);
      }

      // Save schema to file
      fs.writeFileSync(
        `${outDir}/schema.json`,
        JSON.stringify(schema, null, 2)
      );
      console.log(`Saved schema to ${outDir}/schema.json`);

      // Save collections to files
      const collectionsDir = `${outDir}/collections`;
      fs.mkdirSync(collectionsDir, { recursive: true });
      const collections = Object.keys(schema.collections);
      for (const collectionName of collections) {
        const res = await ctx.remote.request_NodeFetch('POST', '/fetch', {
          body: JSON.stringify({
            query: { collectionName },
          }),
        });
        const filePath = `${collectionsDir}/${collectionName}.json`;
        await streamV0Result(res, filePath);
        console.log(`Saved collection to ${filePath}`);
      }
    }

    async function snapshotV1(outDir: string) {
      const schemaRes = await ctx.remote.request_NodeFetch('POST', '/schema', {
        body: JSON.stringify({
          format: 'json',
        }),
      });
      if (!schemaRes.ok) {
        throw new Error(await schemaRes.text());
      }
      const payload: any = await schemaRes.json();
      const schema = payload.schema;
      if (!schema) {
        console.log(
          'No schema found on server. Snapshot logic not implemented.'
        );
        process.exit(1);
      }

      // Save schema to file
      fs.writeFileSync(
        `${outDir}/schema.json`,
        JSON.stringify(schema, null, 2)
      );
      console.log(`Saved schema to ${outDir}/schema.json`);

      // Save collections to files
      const collectionsDir = `${outDir}/collections`;
      fs.mkdirSync(collectionsDir, { recursive: true });
      const collections = Object.keys(schema.collections);
      for (const collectionName of collections) {
        const res = await ctx.remote.request_NodeFetch('POST', '/fetch', {
          body: JSON.stringify({
            query: { collectionName },
          }),
        });
        // stream result to file
        const filePath = `${collectionsDir}/${collectionName}.json`;
        const writeStream = fs.createWriteStream(filePath);
        await streamPipeline(
          // @ts-expect-error
          res.body,
          writeStream
        );
        console.log(`Saved collection to ${filePath}`);
      }
    }

    async function getDBVersion() {
      const res = await ctx.remote.request_NodeFetch('GET', '/version');
      if (res.status === 404) {
        return '0.0.0';
      }
      if (!res.ok) {
        throw new Error(await res.text());
      }
      return res.text();
    }
  },
});

/**
 * V0 results are nested under the 'result' key and are in an entry format to support Maps
 * This function extracts the result and writes it to a file using streams
 */
async function streamV0Result(res: Response, filePath: string) {
  const fileStream = fs.createWriteStream(filePath);
  fileStream.write('[');
  let first = true;

  await streamPipeline(
    // @ts-expect-error
    res.body,
    parser(),
    pick({ filter: 'result' }),
    streamArray(),
    async function* (source) {
      for await (const { value } of source) {
        const extracted = value[1];
        const json = JSON.stringify(extracted);
        if (!first) {
          yield ',' + json;
        } else {
          first = false;
          yield json;
        }
      }
    },
    fileStream
  );

  fs.appendFileSync(filePath, ']');
}
