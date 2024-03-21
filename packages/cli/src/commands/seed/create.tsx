import { Command } from '../../command.js';
import { blue, red } from 'ansis/colors';
import { format } from 'prettier';
import prompts from 'prompts';
import { SEED_DIR, getSeedsDir, loadTsModule } from '../../filesystem.js';
import fs from 'fs';
import path from 'node:path';
import { readLocalSchema } from '../../schema.js';
import { BulkInsert } from '@triplit/client';
import { Models, TriplitError } from '@triplit/db';

export function seedDirExists() {
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
  console.log(`\nNew seed has been saved at \n\n${blue(fileName)}\n`);
}

export default Command({
  description: 'Seeds a Triplit project with data',
  args: [
    {
      name: 'filename',
      description: 'Name for your seed file',
    },
  ],

  async run({ args }) {
    // Check if seed directory exists, prompt user to create it
    const schema = await readLocalSchema();
    const seedTemplate = getSeedTemplate(schema);
    let filename = args.filename;
    if (!filename) {
      let { name } = await prompts({
        type: 'text',
        initial: 'seed',
        name: 'name',
        message: 'Name of the seed file',
        validate: (name) => {
          if (!name) {
            return 'Name cannot be empty';
          }
          if (name.includes(' ')) {
            return 'Name cannot contain spaces';
          }
          return true;
        },
      });
      filename = name;
    }
    if (!filename) {
      console.log('Aborting');
      return;
    }
    writeSeedFile(filename, seedTemplate);
    return;
  },
});
