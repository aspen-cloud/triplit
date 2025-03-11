import { RecordType, Type } from './schema/index.js';

/**
 * TODO: Unify this with type converters and selections
 * If we want to eek out performance, we can pre-compile a function for the schema that does the checks below
 */

export function parseInsert(type: RecordType | undefined, input: any) {
  if (!type) return input;
  const struct = Type.struct(type);
  const assigned = Type.assign(type, struct, input);
  // Helps for merging to remove undefined keys
  // TODO: see if we can avoid doing this when we merge undefined / null
  recursivelyDeleteUndefinedKeys(assigned);
  const encoded = Type.encode(type, assigned);
  return encoded;
}

function recursivelyDeleteUndefinedKeys(obj: any) {
  for (const key in obj) {
    if (obj[key] === undefined) {
      delete obj[key];
    } else if (typeof obj[key] !== 'object') {
      continue;
    } else if (
      obj[key] !== null &&
      !Array.isArray(obj[key]) &&
      !(obj[key] instanceof Date) &&
      !(obj[key] instanceof Set)
    ) {
      recursivelyDeleteUndefinedKeys(obj[key]);
    }
  }
}
