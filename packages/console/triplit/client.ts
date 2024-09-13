import { schema } from './schema.js';
import { TriplitClient } from '@triplit/client';

const inBrowser = typeof window !== 'undefined';

export const consoleClient = new TriplitClient({
  schema,
  autoConnect: false,
  storage: inBrowser ? 'indexeddb' : 'memory',
});
