// Place in separate file so config is run before other imports
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'url';

const envPath = path.join(fileURLToPath(import.meta.url), '/../../.env');
config({ path: envPath });
