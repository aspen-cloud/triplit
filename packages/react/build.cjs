const { build } = require('esbuild');

const { dependencies, peerDependencies } = require('./package.json');

const externalDependencies = Object.keys(dependencies ?? {})
  .concat(Object.keys(peerDependencies ?? {}))
  .filter((dep) => dep !== '@triplit/db');

build({
  entryPoints: ['src/index.ts'],
  outdir: 'dist',
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  target: 'esnext',
  external: externalDependencies,
});
