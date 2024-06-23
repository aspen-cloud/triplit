import { copy, remove } from 'fs-extra';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const TEMPLATE_NAMES = ['react', 'svelte'];
const SOURCE_DIR = '../../templates';
const DEST_DIR = './dist/templates';

async function copyTemplates() {
  await remove(DEST_DIR);
  const pwd = resolve(fileURLToPath(import.meta.url), '../');
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
      console.log(`Copied ${template} to ${DEST_DIR}`);
    }
    console.log('Templates copied successfully!');
  } catch (error) {
    console.error('An error occurred while copying templates:', error);
  }
}

await copyTemplates();
