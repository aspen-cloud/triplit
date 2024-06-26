import { createRequire } from 'node:module';
import path from 'path';
import url from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export { require, __dirname };
