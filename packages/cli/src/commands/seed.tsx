import { Command } from '../command.js';
import { blue, green, red, grey } from 'ansis/colors';
import { format } from 'prettier';
import * as Flag from '../flags.js';
import prompts from 'prompts';
import {
  SEED_DIR,
  createDirIfNotExists,
  getSeedsDir,
  loadTsModule,
} from '../filesystem.js';
import fs from 'fs';
import path from 'node:path';
import { readLocalSchema } from '../schema.js';
import { BulkInsert, RemoteClient } from '@triplit/client';
import { serverRequesterMiddleware } from '../middleware/add-server-requester.js';
import { Models, TriplitError } from '@triplit/db';

function seedDirExists() {
  return fs.existsSync(SEED_DIR);
}

function getSeedTemplate(schema: Models<any, any> | undefined) {
  return `import { BulkInsert } from \"@triplit/client\"
${schema ? 'import { schema } from "../schema.js"' : ''}
export default function seed(): BulkInsert<${
    schema ? 'typeof schema' : 'any'
  }> {
  return {${
    schema
      ? Object.keys(schema).reduce((prev, collectionName) => {
          return prev + `${collectionName}: [],\n`;
        }, '')
      : ''
  }};
}
`;
}

async function writeSeedFile(
  seedName: string,
  fileContent: string,
  options: { path?: string } = {}
) {
  const fileName = path.join(options?.path || getSeedsDir(), `${seedName}.ts`);
  fs.mkdirSync(path.dirname(fileName), { recursive: true });
  const formatted = await format(fileContent, { parser: 'typescript' });
  fs.writeFileSync(fileName, formatted, 'utf8');
  console.log(blue(`New seed has been saved at ${fileName}`));
}

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
    create: Flag.Boolean({
      char: 'c',
      description: 'Create a new seed file',
      default: false,
    }),
    file: Flag.String({
      char: 'f',
      description: 'Specify a seed file to run',
    }),
  },
  middleware: [serverRequesterMiddleware],
  async run({ flags, ctx, args }) {
    // Check if seed directory exists, prompt user to create it
    if (flags.create) {
      const schema = await readLocalSchema();
      const seedTemplate = getSeedTemplate(schema);
      const { fileName } = await prompts({
        type: 'text',
        initial: 'seed',
        name: 'fileName',
        message: 'Name of the seed file',
      });
      if (!fileName) {
        console.log('Aborting');
        return;
      }
      writeSeedFile(fileName, seedTemplate);
      return;
    }

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
    if (flags.all) {
      seeds = allSeeds;
    } else if (flags.file) {
      seeds = [flags.file];
    } else if (process.argv.length > 3) {
      seeds = process.argv
        .slice(3)
        .filter((arg) =>
          allSeeds
            .map((seedPath) => path.basename(seedPath, '.ts'))
            .includes(arg)
        )
        .map((arg) => path.join(SEED_DIR, arg + '.ts'));
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
    const { url, token } = ctx;
    const schema = await readLocalSchema();
    const client = new RemoteClient({
      server: url,
      token: token,
      schema,
    });
    for (const seed of seeds) {
      const seedFn = await loadSeedModule(seed);
      if (seedFn) {
        console.log(grey(`Running seed file: ${path.basename(seed)}`));
        try {
          const response = await client.bulkInsert(await seedFn());
          const { output } = response;
          console.log(green(`Successfully seeded with ${path.basename(seed)}`));

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
          console.error(red(`Failed to seed with ${path.basename(seed)}`));
          logError(e);
        }
      }
    }
  },
});

function logError(e: Error | TriplitError) {
  if (e instanceof TriplitError) {
    console.error(red(e.baseMessage));
    e.contextMessage && console.error(red(e.contextMessage));
  } else {
    console.error(red(e.message));
  }
}
