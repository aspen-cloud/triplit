import { TriplitError } from './errors.js';
import { Collection, Model, Models, Type } from './schema/index.js';
import {
  isQueryInclusionReference,
  isQueryInclusionShorthand,
  isQueryInclusionSubquery,
} from './subquery.js';
import { CollectionQuery, QueryInclusion, RelationSubquery } from './types.js';

export function serializeFetchResult<
  D extends (Record<string, any> | null) | Record<string, any>[],
>(query: CollectionQuery, schema: Models | undefined, results: D): D {
  const collection = schema?.[query.collectionName];
  const collectionSchema = collection?.schema;
  const inclusionKeys = query.include ? Object.keys(query.include) : [];

  function parseResult(result: Record<string, any> | null) {
    if (!result) return null;
    const relatedData: any = {};
    for (const key of inclusionKeys) {
      relatedData[key] = serializeFetchResult(
        getIncludedQuery(collection, key, query.include![key], 'serialize'),
        schema,
        result[key]
      );
      delete result[key];
    }
    result = serializeEntity(collectionSchema, result);
    for (const key of inclusionKeys) {
      // @ts-expect-error
      result[key] = relatedData[key];
    }
    return result;
  }

  if (Array.isArray(results)) {
    for (let i = 0; i < results.length; i++) {
      results[i] = parseResult(results[i]);
    }
  } else {
    // @ts-expect-error
    results = parseResult(results);
  }
  return results;
}

export function serializeEntity(
  collectionSchema: Model | undefined,
  entity: any
) {
  if (!collectionSchema) return entity;
  return Type.serialize(collectionSchema, entity, 'decoded');
}

export function deserializeFetchResult<
  D extends (Record<string, any> | null) | Record<string, any>[],
>(query: CollectionQuery, schema: Models | undefined, results: D): D {
  const collection = schema?.[query.collectionName];
  const collectionSchema = collection?.schema;
  const inclusionKeys = query.include ? Object.keys(query.include) : [];

  function parseResult(result: Record<string, any> | null) {
    if (!result) return null;
    const relatedData: any = {};
    for (const key of inclusionKeys) {
      relatedData[key] = deserializeFetchResult(
        getIncludedQuery(collection, key, query.include![key], 'deserialize'),
        schema,
        result[key]
      );
      delete result[key];
    }
    result = deserializeEntity(collectionSchema, result);
    for (const key of inclusionKeys) {
      // @ts-expect-error
      result[key] = relatedData[key];
    }
    return result;
  }

  if (Array.isArray(results)) {
    for (let i = 0; i < results.length; i++) {
      results[i] = parseResult(results[i]);
    }
  } else {
    // @ts-expect-error
    results = parseResult(results);
  }
  return results;
}

export function deserializeEntity(
  collectionSchema: Model | undefined,
  entity: any
) {
  if (!collectionSchema) return entity;
  return Type.deserialize(collectionSchema, entity, 'decoded');
}

// TODO: bad verbage in errors "deserialzie"
function getIncludedQuery(
  collection: Collection | undefined,
  key: string,
  inclusion: QueryInclusion,
  operation: 'serialize' | 'deserialize'
): CollectionQuery {
  if (isQueryInclusionShorthand(inclusion)) {
    if (!collection)
      throw new TriplitError(
        `Cannot ${operation} inclusion '${key}' without schema`
      );
    const relation = collection.relationships?.[key];
    if (!relation)
      throw new TriplitError(
        `Cannot ${operation} inclusion '${key}', no relation found for '${key}'`
      );
    return relation.query;
  }
  if (isQueryInclusionReference(inclusion)) {
    if (!collection)
      throw new TriplitError(
        `Cannot ${operation} inclusion '${key}' without schema`
      );
    const { _extends, ...queryExt } = inclusion;
    const relation = collection.relationships?.[_extends];
    if (!relation)
      throw new TriplitError(
        `Cannot ${operation} inclusion '${key}', no relation found for '${_extends}'`
      );
    return { ...relation.query, ...queryExt };
  }
  if (isQueryInclusionSubquery(inclusion)) {
    return inclusion.subquery;
  }
  throw new TriplitError(
    `Failed to ${operation} inclusion '${key}': invalid format`
  );
}
