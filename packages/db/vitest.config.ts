import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    typecheck: {
      ignoreSourceErrors: false,
      tsconfig: './tsconfig.test.json',
    },
  },
});
