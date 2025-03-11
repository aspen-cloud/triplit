import * as Bun from 'bun';
import * as Path from 'path';
import esbuild from 'esbuild';

const packageJson = await Bun.file('./package.json').json();

// TODO add glob support
const exportPaths = Object.values(packageJson.exports).map(
  (exp) => exp['import']
);
// console.log(exportPaths.map((file) => Path.relative('./dist', file)));
const entryFileScans = exportPaths.map((file) =>
  Array.fromAsync(
    new Bun.Glob(Path.relative('./dist', file).replace('.js', '.ts')).scan({
      cwd: './src',
      absolute: true,
    })
  )
);
const entryFiles = (await Promise.all(entryFileScans)).flat();
// console.log(entryFiles);

await esbuild.build({
  //   entryPoints: entryFiles,
  entryPoints: ['./src/**/*ts'],
  bundle: false,
  format: 'esm',
  sourcemap: 'inline',
  outdir: './dist',
  target: 'esnext',
  platform: 'node',
  define: {
    'process.env.NODE_ENV': process.env['RELEASE']
      ? "'production'"
      : "'development'",
  },
});

// This currently segfaults and also doesn't support "no bundle"
// await Bun.build({
//   entrypoints: entryFiles,
//   outdir: './dist',
//   sourcemap: 'inline',
//   format: 'esm',
//   minify: false,
//   noBundle: true,
// });
