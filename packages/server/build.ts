import esbuild from 'esbuild';

esbuild.buildSync({
  entryPoints: ['./src/index.ts'],
  target: 'node20',
  platform: 'node',
  outfile: './dist/index.js',
  bundle: true,
  format: 'esm',
  external: ['better-sqlite3'],
});
