import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    setupFiles: ['@vitest/web-worker'],
    coverage: {
      include: [
        '../db/src/**/*.{js,ts}',
        '../client/src/**/*.{js,ts}',
        '../server-core/src/**/*.{js,ts}',
      ],
    },
  },
});
