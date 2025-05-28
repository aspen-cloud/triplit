const modules: Record<string, any> = {};

export function getOptionalDep<T = any>(moduleName: string): T {
  if (!modules[moduleName]) {
    throw new Error(
      `Optional dependency ${moduleName} has not been loaded or does not exist. You may need to install it.`
    );
  }
  return modules[moduleName];
}

export async function tryPreloadingOptionalDeps(): Promise<void> {
  // This is this way to ensure it's statically analyzable
  // which is key for some bundlers like Vite
  try {
    modules['uuidv7'] = await import('uuidv7');
  } catch (e) {}
}
