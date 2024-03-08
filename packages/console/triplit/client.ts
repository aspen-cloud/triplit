import { schemaObject as DBConsoleSchemaObject } from './schema';
import { TriplitClient } from '@triplit/client';
import { IndexedDbStorage } from '@triplit/db/storage/indexed-db';

export function formConsolePrimaryKey(projectId: string, server: string) {
  return `${projectId}-${server}`;
}

export const consoleClient = new TriplitClient({
  schema: DBConsoleSchemaObject,
  storage: {
    cache: new IndexedDbStorage('console-cache-v2'),
    outbox: new IndexedDbStorage('console-outbox-v2'),
  },
});
