import { coverageConfigDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['@vitest/web-worker'],
    include: ['./test/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    coverage: {
      include: ['src/**/*.{js,ts}'],
      exclude: ['src/utils/**', ...coverageConfigDefaults.exclude],
    },
    typecheck: {
      ignoreSourceErrors: true,
      tsconfig: './tsconfig.test.json',
    },
  },
});
