const config = {
  packageManager: 'yarn',
  reporters: ['clear-text', 'progress', 'html'],
  testRunner: 'vitest',
  coverageAnalysis: 'all',
  tsconfigFile: 'tsconfig.json',
  mutate: ['src/**/*.ts'],
  logLevel: 'info',
  plugins: ['@stryker-mutator/vitest-runner'],
};

export default config;
