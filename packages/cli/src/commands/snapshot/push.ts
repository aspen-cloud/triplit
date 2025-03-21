import { Command } from '../../command.js';
import * as Flag from '../../flags.js';
import { createServerRequesterMiddleware } from '../../middleware/add-server-requester.js';
import fs from 'fs';
import { Readable } from 'stream';
import path from 'path';
import FormData from 'form-data';

export default Command({
  description: 'Pushes a snapshot to the server.',
  experimental: true,
  flags: {
    snapshot: Flag.String({
      description: 'The directory containing the source snapshot.',
      required: true,
    }),
  },
  middleware: [
    createServerRequesterMiddleware({
      destructive: true,
    }),
  ],
  run: async ({ flags, ctx }) => {
    const snapshotDir = flags.snapshot;
    if (!fs.existsSync(snapshotDir)) {
      console.log(`Snapshot directory ${snapshotDir} does not exist.`);
      process.exit(1);
    }

    const collectionsDir = `${snapshotDir}/collections`;
    if (!fs.existsSync(collectionsDir)) {
      console.log(`Collections directory ${collectionsDir} does not exist.`);
      process.exit(1);
    }
    const files = fs
      .readdirSync(collectionsDir)
      .map((file) => `${collectionsDir}/${file}`);
    await sendFilesAsMultipart(files);
    async function sendFilesAsMultipart(filePaths: string[]) {
      const form = new FormData();
      const jsonStream = createCombinedJsonStream(filePaths);

      // /bulk-insert-file format is {data: {collection: [values]}}
      form.append('data', jsonStream, {
        filename: 'data.json',
        contentType: 'application/json',
      });

      const res = await ctx.remote.request_NodeFetch(
        'POST',
        '/bulk-insert-file',
        {
          headers: form.getHeaders(),
          query: {
            'no-return': 'true',
          },
          body: form,
        }
      );

      if (!res.ok) {
        throw new Error(`Upload failed: ${res.statusText}`);
      }
      console.log('Upload successful');
    }
  },
});

/**
 * Unify multiple JSON files into a single JSON object stream, keyed by the filename
 */
function createCombinedJsonStream(filePaths: string[]) {
  const entries = filePaths.map((filePath) => ({
    key: path.basename(filePath, '.json'),
    stream: fs.createReadStream(filePath, { encoding: 'utf-8' }),
  }));

  async function* jsonObjectStream() {
    yield '{\n';
    for (let i = 0; i < entries.length; i++) {
      const { key, stream } = entries[i];
      const prefix = i === 0 ? '' : ',\n';
      yield `${prefix}"${key}":`;

      for await (const chunk of stream) {
        yield chunk;
      }
    }
    yield '\n}';
  }

  return Readable.from(jsonObjectStream());
}
