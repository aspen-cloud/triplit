import { Command } from '../../command.js';
import { blue, green, red, grey } from 'ansis/colors';
import * as Flag from '../../flags.js';
import prompts from 'prompts';
import {
  SEED_DIR,
  createDirIfNotExists,
  loadTsModule,
} from '../../filesystem.js';
import fs from 'fs';
import path from 'node:path';
import { BulkInsert, HttpClient } from '@triplit/client';
import { serverRequesterMiddleware } from '../../middleware/add-server-requester.js';
import { TriplitError } from '@triplit/db';
import { seedDirExists } from './create.js';
import ora from 'ora';
import { projectSchemaMiddleware } from '../../middleware/project-schema.js';

export async function loadSeedModule(seedPath: string) {
  const module = await loadTsModule(seedPath);
  return module.default as () => Promise<BulkInsert<any>>;
}

export default Command({
  description: 'Seeds a Triplit project with data',
  flags: {
    all: Flag.Boolean({
      char: 'a',
      description: 'Run all seed files in /triplit/seeds',
    }),
  },
  args: [
    {
      name: 'file',
      description: 'Run a specific seed file',
    },
  ],
  middleware: [serverRequesterMiddleware, projectSchemaMiddleware],
  async run({ flags, ctx, args }) {
    await insertSeeds(ctx.url, ctx.token, args.file, flags.all, ctx.schema);
  },
});

export async function insertSeeds(
  url: string,
  token: string,
  file: string,
  runAll: boolean = false,
  schema: any
) {
  // Check if seed directory exists, prompt user to create it
  if (!seedDirExists()) {
    console.log('/triplit/seed directory does not exist');
    const { value } = await prompts({
      message: 'Do you want to create it?',
      name: 'value',
      type: 'confirm',
      initial: true,
    });
    if (value) {
      createDirIfNotExists(SEED_DIR);
      console.log('Created /triplit/seed directory');
    } else {
      console.log('Aborting');
    }
    return;
  }
  let seeds: string[] = [];
  const allSeeds = fs
    .readdirSync(SEED_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => path.join(SEED_DIR, f));
  if (runAll) {
    seeds = allSeeds;
  } else if (file) {
    if (!file.endsWith('.ts')) {
      file += '.ts';
    }
    if (fs.existsSync(file)) {
      seeds = [file];
    } else {
      file = path.join(SEED_DIR, file);
      if (fs.existsSync(file)) {
        seeds = [file];
      } else {
        console.error(red('\nUnable to find seed file:\n\n' + file));
        allSeeds.length > 0 &&
          console.error(
            `\nAvailable seed files in /triplit/seeds:\n\n\t` +
              allSeeds.map((f) => path.basename(f)).join('\n\t')
          );
        console.error(
          `\nIf you want to create a new seed file, run\n\n\t${blue(
            '`npx triplit seed create`'
          )}\n`
        );
        process.exit(1);
      }
    }
  } else if (allSeeds.length > 0) {
    seeds = (
      await prompts([
        {
          type: 'multiselect',
          name: 'seeds',
          message: 'Which seed files do you want to run?',
          choices: allSeeds.map((seed) => ({
            title: path.basename(seed),
            value: seed,
          })),
        },
      ])
    ).seeds;
  }
  if (seeds.length === 0) {
    console.log('No seed files selected');
    return;
  }
  const client = new HttpClient({
    serverUrl: url,
    token: token,
    schema,
  });
  for (const seed of seeds) {
    const seedFn = await loadSeedModule(seed);
    if (seedFn) {
      const spinner = ora(`Uploading seed: ${path.basename(seed)}`).start();
      try {
        const response = await client.bulkInsert(await seedFn());
        const { output } = response;
        spinner.succeed(`Successfully seeded with ${path.basename(seed)}`);

        for (const collectionName in output) {
          const collection = output[collectionName];
          console.log(
            grey(
              `Inserted ${blue(
                String(collection.length)
              )} document(s) into ${blue(collectionName)}`
            )
          );
        }
      } catch (e) {
        spinner.fail(`Failed to seed with ${path.basename(seed)}`);
        console.error(e);
      }
    }
  }
}
