import { copy, remove } from 'fs-extra';
import { readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const TEMPLATE_NAMES = ['react', 'svelte'];
const SOURCE_DIR = '../../templates';
const DEST_DIR = './dist/templates';

const pwd = resolve(fileURLToPath(import.meta.url), '../');

async function copyTemplates() {
  await remove(DEST_DIR);
  try {
    for (const template of TEMPLATE_NAMES) {
      await copy(
        resolve(pwd, SOURCE_DIR, template),
        resolve(pwd, DEST_DIR, template),
        {
          filter: (src, _dest) => {
            return !src.includes('node_modules') && !src.endsWith('.env');
          },
        }
      );
      await writeNpmIgnoreFile(template);
      console.log(`Copied ${template} to ${DEST_DIR}`);
    }
    console.log('Templates copied successfully!');
  } catch (error) {
    console.error('An error occurred while copying templates:', error);
  }
}

async function writeNpmIgnoreFile(template) {
  const gitIgnorePath = resolve(pwd, DEST_DIR, template, '.gitignore');
  const gitIgnoreContent = readFileSync(gitIgnorePath, 'utf8');
  const npmIgnorePath = resolve(pwd, DEST_DIR, template, '.npmignore');
  const npmIgnoreContent = '!.gitignore' + '\n' + gitIgnoreContent;
  writeFileSync(npmIgnorePath, npmIgnoreContent);
}

await copyTemplates();
