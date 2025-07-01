const modules: Record<string, any> = {};

export function getOptionalDep<T = any>(moduleName: string): T {
  if (!modules[moduleName]) {
    throw new Error(
      `Optional dependency ${moduleName} has not been loaded or does not exist. You may need to install it.`
    );
  }
  return modules[moduleName];
}

/**
 * Use individual loaders for optional dependencies.
 * Hard coding the dep is the way to ensure it's statically analyzable by bundlers.
 * Ensure a require and import are both attempted to support both CJS and ESM environments (browser, node, hermes, etc).
 * TODO: confirm this works in all possible cjs/esm environments
 */
export async function tryPreloadingOptionalDeps(): Promise<void> {
  modules['uuidv7'] = await load_uuidv7();
}

async function load_uuidv7() {
  if (typeof require === 'function') {
    try {
      /* webpackIgnore: true */ // keep bundlers from resolving at build
      return require('uuidv7');
    } catch {
      return undefined;
    }
  }
  try {
    /* webpackIgnore: true */
    return await import('uuidv7');
  } catch {}

  return undefined;
}
