import { createRequire } from 'node:module';

// WARNING: import.meta.url may be inside the current dir of this file, unsure if this is problematic for local path resolution
const require = (...args: any) => createRequire(import.meta.url)(args);

export { require };
