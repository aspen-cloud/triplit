import { copy, remove, move } from 'fs-extra';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const TEMPLATE_NAMES = ['react', 'svelte', 'vue'];
const SOURCE_DIR = '../../templates';
const DEST_DIR = './dist/templates';

const pwd = resolve(fileURLToPath(import.meta.url), '../');

async function copyTemplates() {
  await remove(DEST_DIR);
  try {
    for (const template of TEMPLATE_NAMES) {
      const srcPath = resolve(pwd, SOURCE_DIR, template);
      const destPath = resolve(pwd, DEST_DIR, template);
      await copy(srcPath, destPath, {
        filter: (src, _dest) => {
          return !src.includes('node_modules') && !src.endsWith('.env');
        },
      });
      console.log(`Copied ${template} to ${DEST_DIR}`);
      await move(destPath + '/.gitignore', destPath + '/.gitignore.example', {
        overwrite: true,
      });
    }
    // rename the .gitignore files in the destination directory to .gitignore.template

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
