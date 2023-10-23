import tailwind from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import * as Path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/** @type {import('postcss-load-config').Config} */
export default {
  plugins: [
    autoprefixer,
    tailwind({ config: Path.resolve(__dirname, './tailwind.config.js') }),
  ],
};
