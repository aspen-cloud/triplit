const { build } = require('esbuild');

const { dependencies, peerDependencies } = require('./package.json');

const externalDependencies = Object.keys(dependencies ?? {})
  .concat(Object.keys(peerDependencies ?? {}))
  .filter((dep) => dep !== '@triplit/db');

build({
  entryPoints: ['src/index.ts'],
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  minify: true,
  platform: 'browser',
  target: 'esnext',
  external: externalDependencies,
});
