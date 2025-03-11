import { Command } from '../../command.js';
import { blue } from 'ansis/colors';
import { format } from 'prettier';
import prompts from 'prompts';
import { SEED_DIR, getSeedsDir } from '../../filesystem.js';
import fs from 'fs';
import path from 'node:path';
import { Models } from '@triplit/db';
import { projectSchemaMiddleware } from '../../middleware/project-schema.js';

export function seedDirExists() {
  return fs.existsSync(SEED_DIR);
}

function getSeedTemplate(schema: Models | undefined) {
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
  description: 'Creates a new seed file',
  args: [
    {
      name: 'filename',
      description: 'Name for your seed file',
    },
  ],
  middleware: [projectSchemaMiddleware],
  async run({ args, ctx }) {
    // Check if seed directory exists, prompt user to create it
    const localSchema = await ctx.projectSchema.getSchema();
    const seedTemplate = getSeedTemplate(localSchema?.collections);
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
