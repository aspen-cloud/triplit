import esbuild from 'esbuild';

esbuild.buildSync({
  entryPoints: ['./server/index.ts'],
  target: 'node20',
  platform: 'node',
  outfile: './dist/index.js',
  bundle: true,
  format: 'esm',
});
