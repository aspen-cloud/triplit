import { format } from 'prettier';
import { Command } from '../command.js';
import { CWD, TRIPLIT_DIR, createDirIfNotExists } from '../filesystem.js';
import * as Flag from '../flags.js';
import fs from 'fs';
import path from 'path';
import { blue, green, red, yellow } from 'ansis/colors';
import degit from 'degit';
import { addDependency } from 'nypm';

function isProjectSetup() {
  return fs.existsSync(TRIPLIT_DIR);
}

function hasPackageJson() {
  return fs.existsSync('package.json');
}

const packageToInstall = ['@triplit/client'];

export default Command({
  description: 'Initialize a Triplit project',
  flags: {
    packageManager: Flag.Enum({
      options: ['npm', 'pnpm', 'yarn'] as const,
      char: 'm',
      description: 'Package manager to use',
    }),
    framework: Flag.Enum({
      options: ['react'] as const,
      char: 'f',
      description: 'Frontend framework helpers to install',
    }),
    template: Flag.Enum({
      options: ['chat'] as const,
      char: 't',
      description: 'Project template to use',
    }),
  },
  async run({ flags }) {
    // check if project is setup
    if (isProjectSetup()) {
      console.log('Project already initialized');
      return;
    }

    if (flags.template) {
      if (hasPackageJson()) {
        console.log(
          'Cannot create template in existing project. Please run this command in an empty directory.'
        );
        return;
      }
      if (flags.template === 'chat') {
        await degit('aspen-cloud/triplit/templates/chat-template').clone(
          path.join(CWD, 'chat-template')
        );
        console.log('Created project with chat template');
        return;
      } else {
        console.log('Invalid template specified. Available templates: chat');
        return;
      }
    }

    if (flags.framework) {
      switch (flags.framework) {
        case 'react':
          packageToInstall.push('@triplit/react');
          break;
      }
    }
    console.log(`Installing packages: ${packageToInstall.join(', ')}`);
    await addDependency(packageToInstall);
    console.log();

    // create directories and files
    console.log('Creating directories and files...');
    createDirIfNotExists(TRIPLIT_DIR);
    const formattedContent = await format(SchemaFileContent, {
      parser: 'typescript',
    });
    fs.writeFileSync(
      path.join(TRIPLIT_DIR, 'schema.ts'),
      formattedContent,
      'utf8'
    );
    console.log(blue('Created files:'));
    console.log(blue('  - triplit/schema.ts'));
  },
});

const SchemaFileContent =
  `import { ClientSchema } from "@triplit/client";
// import { Schema as S } from '@triplit/db';

/**
 * Define your schema here. After:
 * - Pass your schema to your Triplit client
 * - Push your schema to your Triplit server with 'triplit schema push'
 *
 * For more information about schemas, see the docs: https://www.triplit.dev/docs/database/schemas
 */
export const schema = {
    // todos: {
    //   schema: S.Schema({
    //     id: S.Id(),
    //     title: S.String(),
    //     description: S.String(),
    //   }),
    // },
} satisfies ClientSchema;

`.trim() + '\n';
