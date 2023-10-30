import { format } from 'prettier';
import { Command } from '../command.js';
import { TRIPLIT_DIR, createDirIfNotExists } from '../filesystem.js';
import * as Flag from '../flags.js';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { blue, green, red, yellow } from 'ansis/colors';

function isProjectSetup() {
  return fs.existsSync(TRIPLIT_DIR);
}

function inferPackageManager() {
  if (fs.existsSync('package-lock.json')) {
    return 'npm';
  } else if (fs.existsSync('yarn.lock')) {
    return 'yarn';
  } else if (fs.existsSync('pnpm-lock.yaml')) {
    return 'pnpm';
  }
  return undefined;
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
  },
  async run({ flags }) {
    console.log('Creating Triplit project...');
    // check if project is setup
    if (isProjectSetup()) {
      console.log('Project already initialized');
      return;
    }

    if (flags.framework) {
      switch (flags.framework) {
        case 'react':
          packageToInstall.push('@triplit/react');
          break;
      }
    }

    // Get package manager
    let packageManager = flags.packageManager?.toLowerCase();
    if (!packageManager) {
      console.log('No package manager specified, inferring...');
      packageManager = inferPackageManager();
      if (packageManager) {
        console.log(`Inferred package manager: ${packageManager}`);
      }
    }

    let installCommand: string;
    let args: string[] = [];
    switch (packageManager) {
      case 'npm':
        installCommand = `npm`;
        args = ['install', ...packageToInstall];
        break;
      case 'yarn':
        installCommand = `yarn`;
        args = ['add', ...packageToInstall];
        break;
      case 'pnpm':
        installCommand = `pnpm`;
        args = ['add', ...packageToInstall];
        break;
      default:
        console.log(
          yellow(
            `Could not determine a package manager to use. Please install dependencies manually: ${packageToInstall.join(
              ' '
            )}`
          )
        );
        break;
    }
    console.log();

    // install dependencies
    const installPromise = new Promise<void>((resolve, reject) => {
      if (installCommand) {
        console.log('Installing dependencies...');
        const child = spawn(installCommand, args);
        child.stdout.pipe(process.stdout);
        child.stderr.pipe(process.stderr);
        child.on('error', (err) => {
          console.error(err);
          reject();
        });
        child.on('close', (code) => {
          if (code !== 0) {
            console.error(red(`Install process exited with code ${code}`));
            reject();
          } else {
            // Run your subsequent code here
            console.log(green('Package installation completed successfully.'));
            resolve();
          }
        });
      } else {
        console.log('Skipping package installation...');
        resolve();
      }
    });

    await installPromise;
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
  `
// import { Schema as S } from '@triplit/db';

/**
 * Define your schema here. To use your schema, you can either:
 * - Directly import your schema into your app
 * - Run 'triplit migrate create' to generate migrations (recommended for production apps)
 *
 * For more information on schemas, see the docs: https://www.triplit.dev/docs/schemas
 */
export const schema = {
    // todos: {
    //   schema: S.Schema({
    //     id: S.Id(),
    //     title: S.String(),
    //     description: S.String(),
    //   }),
    // },
};`.trim() + '\n';
