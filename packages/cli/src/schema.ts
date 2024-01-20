import path from 'node:path';
import { getTriplitDir, loadTsModule } from './filesystem.js';

export async function readLocalSchema() {
  const triplitDir = getTriplitDir();
  const schemaPath = path.join(triplitDir, 'schema.ts');
  const { schema } = await loadTsModule(schemaPath);
  return schema;
}
