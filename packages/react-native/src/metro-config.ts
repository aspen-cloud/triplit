import path from 'path';
import { fileURLToPath } from 'url';

export function triplitMetroConfig(config: any) {
  const currentResolver = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (
    context: any,
    moduleName: any,
    platform: any
  ) => {
    // Prepend triplit package resolver
    const triplitResult = triplitMetroResolveRequest(moduleName);
    if (triplitResult) return triplitResult;
    // Fallback to default resolver or any overridden resolver
    return currentResolver
      ? currentResolver(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);
  };
  return config;
}

export function triplitMetroResolveRequest(moduleName: string) {
  // Resolve exports for Triplit packages
  if (moduleName.startsWith('@triplit/')) {
    const [_scope, packageName, ...depPath] = moduleName.split('/');
    // No special path to resolve
    if (depPath.length === 0) {
      return undefined;
    }
    const dep = `@triplit/${packageName}`;
    const suffix = rewriteDepPath(dep, depPath.join('/'));
    const basePath = path.dirname(resolveDependency(dep));
    const filePath = path.join(
      basePath,
      suffix.endsWith('.js') ? suffix : `${suffix}.js`
    );
    return {
      filePath: filePath,
      type: 'sourceFile',
    };
  }
  return undefined;
}

// Rewrite dependency paths for Triplit packages
// Annoyingly, we are manually maintaining this list, it could possibly read values from package.json
// TODO: Go through all package confirm all rewrites are correct
function rewriteDepPath(dep: string, depPath: string) {
  if (dep === '@triplit/db') {
    if (depPath.startsWith('storage/')) {
      return depPath.replace('storage/', 'kv-store/storage/');
    }
    if (depPath === 'ivm') {
      return 'ivm/index.js';
    }
  }
  if (dep === '@triplit/logger') {
    return `handlers/${depPath}`;
  }
  return depPath;
}

function resolveDependency(dep: string) {
  // CommonJS
  if (typeof require !== 'undefined') {
    return require.resolve(dep);
  }
  // If unavailable use ESM apis
  if (typeof import.meta.resolve === 'function') {
    const resolvedPath = import.meta.resolve(dep);
    return fileURLToPath(resolvedPath);
  }

  throw new Error('Cannot resolve dependency: ' + dep);
}
