import { build } from 'esbuild';
import { readdirSync, statSync, readFileSync, copyFileSync } from 'fs';
import { join, resolve } from 'path';

const SRC_DIR = 'src';
const OUT_DIR = 'dist';

// Recursively get all files in a directory
function getCmdFilePaths() {
  const files = [];

  function traverse(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        traverse(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }

  traverse(join(SRC_DIR, 'commands'));
  return files;
}

// Reads package.json for dependencies
function getDeps() {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  return Object.keys(pkg.dependencies || {});
}

const nativeNodeModulesPlugin = {
  name: 'native-node-modules',
  setup(build) {
    // If a ".node" file is imported within a module in the "file" namespace, resolve
    // it to an absolute path and put it into the "node-file" virtual namespace.
    build.onResolve({ filter: /\.node$/, namespace: 'file' }, (args) => {
      const path = new URL(args.path, `file://${args.resolveDir}/`).pathname;
      //   const path = resolve(args.path, { paths: [args.resolveDir] });
      console.log('.node file', args, path);

      return {
        path,
        namespace: 'node-file',
      };
    });

    // Files in the "node-file" virtual namespace call "import()" on the
    // path from esbuild of the ".node" file in the output directory.
    build.onLoad({ filter: /.*/, namespace: 'node-file' }, async (args) => ({
      contents: `
                try { module.exports = require(path) }
                catch {}
            `,
    }));

    // If a ".node" file is imported within a module in the "node-file" namespace, put
    // it in the "file" namespace where esbuild's default loading behavior will handle
    // it. It is already an absolute path since we resolved it to one above.
    build.onResolve({ filter: /\.node$/, namespace: 'node-file' }, (args) => ({
      path: args.path,
      namespace: 'file',
    }));

    // Tell esbuild's default loading behavior to use the "file" loader for
    // these ".node" files.
    let opts = build.initialOptions;
    opts.loader = opts.loader || {};
    opts.loader['.node'] = 'file';
  },
};

// Build each file
async function buildFiles() {
  const cmdFiles = getCmdFilePaths();
  const entryFilePath = join(SRC_DIR, 'index.ts');
  const files = [entryFilePath, ...cmdFiles];
  const deps = getDeps();
  await build({
    inject: ['./cjs-shim.js'],
    entryPoints: files,
    //   outfile: outFile,
    splitting: true,
    outdir: OUT_DIR,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node16',
    // All deps are assumed to be external unless in dev dependencies
    external: deps,
    // plugins: [nativeNodeModulesPlugin],
  });

  // copy yoga.wasm file over to dist
  copyFileSync('./yoga.wasm', join(OUT_DIR, 'yoga.wasm'));
}

// Run the build
await buildFiles().catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
