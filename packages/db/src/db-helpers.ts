import { CollectionQuery } from './collection-query';
import {
  InvalidEntityIdError,
  InvalidInternalEntityIdError,
  InvalidSchemaPathError,
  ModelNotFoundError,
  NoSchemaRegisteredError,
  SessionVariableNotFoundError,
  ValueSchemaMismatchError,
} from './errors';
import { QueryWhere, FilterStatement, SubQuery } from './query';
import {
  Model,
  Models,
  getSchemaFromPath,
  schemaToTriples,
  triplesToSchema,
} from './schema';
import { Attribute, TripleStore, TripleStoreApi, Value } from './triple-store';
import { VALUE_TYPE_KEYS } from './data-types/serialization';

const ID_SEPARATOR = '#';

export function validateExternalId(id: string): Error | undefined {
  if (String(id).includes(ID_SEPARATOR)) {
    return new InvalidEntityIdError(id, `Id cannot include ${ID_SEPARATOR}.`);
  }
  return;
}

export function appendCollectionToId(collectionName: string, id: string) {
  return `${collectionName}${ID_SEPARATOR}${id}`;
}

export function splitIdParts(id: string): [collectionName: string, id: string] {
  const parts = id.split(ID_SEPARATOR);
  if (parts.length !== 2) {
    throw new InvalidInternalEntityIdError(
      `Malformed ID: ${id} should only include one separator(${ID_SEPARATOR})`
    );
  }
  return [parts[0], parts[1]];
}

export function stripCollectionFromId(id: string): string {
  const [_collection, entityId] = splitIdParts(id);
  return entityId;
}

export function replaceVariablesInFilterStatements<
  M extends Model<any> | undefined
>(statements: QueryWhere<M>, variables: Record<string, any>): QueryWhere<M> {
  return statements.map((filter) => {
    if ('exists' in filter) return filter;
    if (!(filter instanceof Array)) {
      filter.filters = replaceVariablesInFilterStatements(
        filter.filters,
        variables
      );
      return filter;
    }
    if (typeof filter[2] !== 'string' || !filter[2].startsWith('$'))
      return filter;
    const varValue = variables[filter[2].slice(1)];
    if (!varValue) throw new SessionVariableNotFoundError(filter[2]);
    return [filter[0], filter[1], varValue] as FilterStatement<M>;
  });
}

export function replaceVariablesInQuery<
  Q extends Pick<CollectionQuery<any>, 'where' | 'vars'>
>(query: Q): Q {
  // const variables = { ...(db.variables ?? {}), ...(query.vars ?? {}) };
  const where = replaceVariablesInFilterStatements(
    query.where,
    query.vars ?? {}
  );
  return { ...query, where };
}

export function* filterStatementIterator<M extends Model<any> | undefined>(
  statements: QueryWhere<M>
): Generator<FilterStatement<M> | SubQuery> {
  for (const statement of statements) {
    if (!(statement instanceof Array) && 'filters' in statement) {
      yield* filterStatementIterator(statement.filters);
    } else {
      yield statement;
    }
  }
}

export function someFilterStatements<M extends Model<any> | undefined>(
  statements: QueryWhere<M>,
  someFunction: (statement: SubQuery | FilterStatement<M>) => boolean
): boolean {
  for (const statement of filterStatementIterator(statements)) {
    if (someFunction(statement)) return true;
  }
  return false;
}

export function mapFilterStatements<M extends Model<any> | undefined>(
  statements: QueryWhere<M>,
  mapFunction: (statement: FilterStatement<M>) => FilterStatement<M>
): QueryWhere<M> {
  return statements.map((filter) => {
    // TODO this doesn't feel right to just exclude sub-queries here
    if ('exists' in filter) return filter;
    if (!(filter instanceof Array) && 'filters' in filter) {
      filter.filters = mapFilterStatements(filter.filters, mapFunction);
      return filter;
    }
    return mapFunction(filter);
  });
}

export function everyFilterStatement(
  statements: QueryWhere<any>,
  everyFunction: (statement: FilterStatement<any>) => boolean
): boolean {
  return statements.every((filter) => {
    if (!(filter instanceof Array) && 'filters' in filter) {
      return everyFilterStatement(filter.filters, everyFunction);
    }
    // TODO should this traverse sub-queries?
    if ('exists' in filter) return true;
    return everyFunction(filter);
  });
}

export async function getSchemaTriples(tripleStore: TripleStoreApi) {
  return tripleStore.findByEntity(appendCollectionToId('_metadata', '_schema'));
}

export async function readSchemaFromTripleStore(tripleStores: TripleStoreApi) {
  const schemaTriples = await getSchemaTriples(tripleStores);
  const schema =
    schemaTriples.length > 0 ? triplesToSchema(schemaTriples) : undefined;
  return {
    schema,
    schemaTriples,
  };
}

export type StoreSchema<M extends Models<any, any> | undefined> =
  M extends Models<any, any>
    ? {
        version: number;
        collections: M;
      }
    : M extends undefined
    ? undefined
    : never;

export async function overrideStoredSchema(
  tripleStore: TripleStore,
  schema: StoreSchema<Models<any, any>>
) {
  const existingTriples = await tripleStore.findByEntity(
    appendCollectionToId('_metadata', '_schema')
  );
  await tripleStore.deleteTriples(existingTriples);

  const triples = schemaToTriples(schema);
  // TODO use tripleStore.setValues
  const ts = await tripleStore.clock.getNextTimestamp();
  const normalizedTriples = triples.map(([e, a, v]) => ({
    id: e,
    attribute: a,
    value: v,
    timestamp: ts,
    expired: false,
  }));
  await tripleStore.insertTriples(normalizedTriples);
}

export function validateTriple(
  schema: Models<any, any>,
  attribute: Attribute,
  value: Value
) {
  if (schema == undefined) {
    throw new NoSchemaRegisteredError(
      'Unable to run triple validation due to missing schema. This is unexpected and likely a bug.'
    );
  }
  const [modelName, ...path] = attribute;

  // TODO: remove this hack
  if (modelName === '_collection') return;
  if (modelName === '_metadata') return;

  const model = schema[modelName];
  if (!model) {
    throw new ModelNotFoundError(modelName as string, Object.keys(schema));
  }

  const valueSchema = getSchemaFromPath(model.attributes, path);

  // We expect you to set values at leaf nodes
  // Our leafs should be value types, so use that as check
  const isLeaf = (VALUE_TYPE_KEYS as unknown as string[]).includes(
    valueSchema.type
  );
  if (!isLeaf)
    throw new InvalidSchemaPathError(
      path as string[],
      'Cannot set the value of a non leaf node in the schema. For example, you may be attempting to set a value on a record type.'
    );
  // Leaf values are an array [value, timestamp], so check value
  if (!valueSchema.validateInput(value))
    throw new ValueSchemaMismatchError(
      modelName as string,
      attribute as string[],
      value
    );
}
