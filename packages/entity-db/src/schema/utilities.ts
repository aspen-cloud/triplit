import type { DataType, Models, Relationship } from '../schema/types/index.js';

/**
 * Gets the attribute from a schema based on a path
 */
export function getAttributeFromSchema(
  attribute: string[],
  schema: Models,
  collectionName: string
) {
  let iter = createSchemaValuesIterator(attribute, schema, collectionName);
  let result = iter.next();
  while (!result.done) {
    result = iter.next();
  }
  return result.value;
}

/**
 * Validates an identifier path based on a validator function. The validator function is called for each part of the path.
 */
export function validateIdentifier(
  identifier: string,
  schema: Models,
  collectionName: string,
  validator: (
    dataType: DataType | Relationship | undefined,
    i: number,
    path: string[]
  ) => {
    valid: boolean;
    reason?: string;
  }
): { valid: boolean; path?: string; reason?: string } {
  let schemaTraverser = createSchemaTraverser(schema, collectionName);
  const attrPath = identifier.split('.');
  let traversedPath: string[] = [];
  for (let i = 0; i < attrPath.length; i++) {
    const attr = attrPath[i];
    schemaTraverser = schemaTraverser.get(attr);
    traversedPath.push(attr);
    const { valid, reason } = validator(schemaTraverser.current, i, attrPath);
    if (!valid) {
      return { valid, path: traversedPath.join('.'), reason };
    }
  }
  return { valid: true };
}

/**
 * Creates an iterator that traverses a path in a schema
 */
export function createSchemaValuesIterator(
  path: Iterable<string>,
  schema: Models,
  collectionName: string
) {
  let schemaTraverser = createSchemaTraverser(schema, collectionName);
  const iter = path[Symbol.iterator]();
  return {
    next() {
      const { value, done } = iter.next();
      if (done) {
        return { done, value: schemaTraverser.current };
      }
      schemaTraverser = schemaTraverser.get(value);
      return { done: false, value: schemaTraverser.current };
    },
    [Symbol.iterator]() {
      return this;
    },
  };
}

/**
 * Creates an iterator that traverses a path in a schema and returns the path and value
 */
export function createSchemaEntriesIterator(
  path: Iterable<string>,
  schema: Models,
  collectionName: string
) {
  let schemaTraverser = createSchemaTraverser(schema, collectionName);
  let iteratedPath: string[] = [];
  const iter = path[Symbol.iterator]();
  return {
    next() {
      const { value, done } = iter.next();
      if (done) {
        return {
          done,
          value: [iteratedPath, schemaTraverser.current] as const,
        };
      }
      schemaTraverser = schemaTraverser.get(value);
      iteratedPath.push(value);
      return {
        done: false,
        value: [iteratedPath, schemaTraverser.current] as const,
      };
    },
    [Symbol.iterator]() {
      return this;
    },
  };
}

export type SchemaTraversalData = DataType | Relationship | undefined;
type Traverser<T> = {
  get(attribute: string): Traverser<T>;
  current: T;
};

/**
 * Creates an object that can easily traverse a schema via a path / relationships
 */
export function createSchemaTraverser(
  schema: Models,
  collectionName: string
): Traverser<SchemaTraversalData> {
  let atRoot = true;
  let current: SchemaTraversalData = schema[collectionName]?.schema;
  const getter = (attribute: string): Traverser<SchemaTraversalData> => {
    if (current === undefined) {
      return { get: getter, current };
    }
    if (isTraversalRelationship(current)) {
      return createSchemaTraverser(schema, current.query.collectionName).get(
        attribute
      );
    }
    let next: SchemaTraversalData = current;
    if (atRoot && attribute in (schema[collectionName].relationships ?? {})) {
      const rel = schema[collectionName].relationships![attribute];
      next = rel;
    } else if (current.type === 'record') {
      next = current.properties[attribute];
      atRoot = false;
    } else {
      next = undefined;
    }
    current = next;
    return { get: getter, current };
  };
  return {
    get: getter,
    current: schema[collectionName]?.schema as DataType | undefined,
  };
}

export function isTraversalRelationship(
  dataType: SchemaTraversalData
): dataType is Relationship {
  return dataType !== undefined && 'query' in dataType;
}

// export function createSchemaTraverser(
//   schema: Models,
//   collectionName: string
// ): Traverser {
//   let atRoot = true;
//   let current: DataType | undefined = schema[collectionName]?.schema;
//   const getter = (attribute: string): Traverser => {
//     let next: DataType | undefined = current;
//     if (atRoot && attribute in (schema[collectionName].relationships ?? {})) {
//       const rel = schema[collectionName].relationships![attribute];
//       return createSchemaTraverser(schema, rel.query.collectionName);
//       // .get(
//       //   attribute
//       // );
//     }
//     if (current?.type === 'record') {
//       next = current.properties[attribute];
//       atRoot = false;
//     } else {
//       next = undefined;
//     }

//     current = next;
//     return { get: getter, current };
//   };
//   return {
//     get: getter,
//     current: schema[collectionName]?.schema as DataType | undefined,
//   };
// }
