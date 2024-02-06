import { readFileSync, existsSync, writeFileSync } from 'fs';
import { CWD } from './filesystem.js';

const CONFIG_PATH = CWD + '/triplit.config.json';

type ProjectConfig = {
  name: string;
  id: string;
};

// reads from the fs for the project config
export function getConfig(): ProjectConfig | null {
  try {
    if (!existsSync(CONFIG_PATH)) {
      return null;
    }
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.error('Error reading project config');
    return null;
  }
}

export function createConfig(config: ProjectConfig) {
  const data = JSON.stringify(config, null, 2);
  writeFileSync(CONFIG_PATH, data);
  console.log(`Created config at ${CONFIG_PATH}`);
  return config;
}
