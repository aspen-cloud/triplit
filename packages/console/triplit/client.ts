import { schemaObject as DBConsoleSchemaObject } from './schema';
import { TriplitClient } from '@triplit/client';

export const consoleClient = new TriplitClient({
  schema: DBConsoleSchemaObject,
  storage: 'memory',
  autoConnect: false,
});
