import { CollectionQuery, doesEntityObjMatchWhere } from './collection-query';
import {
  InvalidEntityIdError,
  InvalidInternalEntityIdError,
  SessionVariableNotFoundError,
} from './errors';
import { QueryWhere, FilterStatement } from './query';
import { Model, Models, schemaToTriples, tuplesToSchema } from './schema';
import type DB from './db';
import type { DBTransaction } from './db-transaction';
import { CollectionNameFromModels } from './db';
import { TripleStore } from './triple-store';

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
>(db: DB<any> | DBTransaction<any>, query: Q): Q {
  const variables = { ...(db.variables ?? {}), ...(query.vars ?? {}) };
  const where = replaceVariablesInFilterStatements(query.where, variables);
  return { ...query, where };
}

export function mapFilterStatements<M extends Model<any> | undefined>(
  statements: QueryWhere<M>,
  mapFunction: (statement: FilterStatement<M>) => FilterStatement<M>
): QueryWhere<M> {
  return statements.map((filter) => {
    if (!(filter instanceof Array)) {
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
    if (!(filter instanceof Array)) {
      return everyFilterStatement(filter.filters, everyFunction);
    }
    return everyFunction(filter);
  });
}

export async function applyRulesToEntity<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(db: DB<M> | DBTransaction<M>, collectionName: CN, entity: any) {
  if (!entity) return entity;
  const collection = await db.getCollectionSchema(collectionName);
  const readRules = collection?.rules?.read;
  if (readRules) {
    const whereFilter = readRules.flatMap((rule) => rule.filter);
    let query = { where: whereFilter };
    /**
     * TODO we should just make this operate directly on where filters
     * e.g.
     * query.where = this.replaceVariablesInWhere(query.where)
     */
    query = replaceVariablesInQuery(db, query);
    const collectionSchema = collection.attributes;
    if (doesEntityObjMatchWhere(entity, query.where, collectionSchema)) {
      return entity;
    }
    return null;
  }
  return entity;
}

export async function getSchemaTriples(tripleStore: TripleStore) {
  return tripleStore.findByEntity(appendCollectionToId('_metadata', '_schema'));
}

export async function readSchemaFromTripleStore(tripleSTores: TripleStore) {
  const schemaTriples = await getSchemaTriples(tripleSTores);
  const schema =
    schemaTriples.length > 0 ? tuplesToSchema(schemaTriples) : undefined;
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
  await tripleStore.insertTriples(normalizedTriples, false);
}
