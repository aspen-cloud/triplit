import { CollectionNameFromModels } from '../../db.js';
import {
  CollectionNotFoundError,
  InvalidQueryCardinalityError,
  TriplitError,
} from '../../errors.js';
import { Models } from '../../schema/types/index.js';
import { TypeInterface } from './type.js';
import {
  CollectionQuery,
  FetchResult,
  QueryResultCardinality,
} from '../../query/types/index.js';

export type SubQuery<
  M extends Models,
  CN extends CollectionNameFromModels<M>
> = Pick<
  CollectionQuery<M, CN, any, any>,
  'collectionName' | 'where' | 'limit' | 'order'
>;

// In practice, we are able to infer the collection name from the query Q['collectionName'] (not CN)
export type QueryType<
  CN extends CollectionNameFromModels,
  Q extends SubQuery<Models, CN>,
  C extends QueryResultCardinality = 'many'
> = TypeInterface<
  'query',
  FetchResult<Models, Q>,
  any, //TODO: is this even applicable? ... might need to break it out into its own concepts we slowly add to
  readonly []
> & {
  query: Q;
  cardinality: C;
};

export function QueryType<
  CN extends CollectionNameFromModels,
  Q extends SubQuery<Models, CN>,
  C extends QueryResultCardinality = 'many'
>(query: Q, cardinality: C = 'many' as C): QueryType<CN, Q, C> {
  return {
    type: 'query' as const,
    supportedOperations: [] as const, // 'hasKey', etc
    context: {},
    cardinality,
    query,
    toJSON() {
      // TODO verify this works with non-memory storage providers
      return { type: this.type, query, cardinality };
    },
    convertInputToDBValue(val: any) {
      // TODO: this is a placeholder, this could be a place where we could support insertions with relationships
      throw new TriplitError(
        'Invalid Operation - Inserting relational data is not supported'
      );
    },
    // There isnt exactly a "DB value" for queries, but this makes sense to use with the fetch method
    convertDBValueToJS(val, schema) {
      if (!schema)
        throw new TriplitError(
          'A schema is required to convert DB value to JS'
        );
      const relationSchema = schema?.[query.collectionName]?.schema;
      if (!relationSchema)
        throw new CollectionNotFoundError(query.collectionName, schema);

      // TODO: determine when we would see this
      if (!val) return val;

      if (cardinality === 'one') {
        return relationSchema.convertDBValueToJS(val, schema);
      } else if (cardinality === 'many') {
        // TODO: confirm map
        // if (val === undefined) return undefined;
        // const entries = JSON.parse(val);
        return Array.from(val.entries()).map(([, v]: any) =>
          relationSchema.convertDBValueToJS(v, schema)
        );
      } else {
        throw new InvalidQueryCardinalityError(cardinality);
      }
    },
    convertJSONToJS(val, schema) {
      if (!schema)
        throw new TriplitError(
          'A schema is required to convert JSON value to JS'
        );
      const relationSchema = schema?.[query.collectionName]?.schema;
      if (!relationSchema)
        throw new CollectionNotFoundError(query.collectionName, schema);

      if (!val) return val;
      if (cardinality === 'one') {
        return relationSchema.convertJSONToJS(val, schema);
      } else if (cardinality === 'many') {
        return val.map((v: any) => relationSchema.convertJSONToJS(v, schema));
      } else {
        throw new InvalidQueryCardinalityError(cardinality);
      }
    },
    convertJSToJSON(val, schema) {
      if (!schema)
        throw new TriplitError(
          'A schema is required to convert JSON value to JS'
        );
      const relationSchema = schema?.[query.collectionName]?.schema;
      if (!relationSchema)
        throw new CollectionNotFoundError(query.collectionName, schema);

      if (!val) return val;

      if (cardinality === 'one') {
        return relationSchema.convertJSToJSON(
          // @ts-expect-error Need to fixup type to understand that this is a single value
          val,
          schema
        );
      } else if (cardinality === 'many') {
        return val.map((v: any) => relationSchema.convertJSToJSON(v, schema));
      } else {
        throw new InvalidQueryCardinalityError(cardinality);
      }
    },
    defaultInput() {
      return undefined;
    },
    validateInput(_val: any) {
      return undefined; // TODO
    },
    validateTripleValue(_val: any) {
      return false;
    },
  };
}
