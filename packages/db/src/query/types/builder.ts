import { CollectionNameFromModels, ModelFromModels } from '../../db.js';
import {
  Models,
  Path,
  RelationAttributes,
  SchemaPaths,
} from '../../schema/types';
import {
  CollectionQuery,
  CollectionQueryDefault,
  FilterStatement,
  OrderStatement,
  QueryOrder,
  QueryWhere,
  RelationSubquery,
  ValueCursor,
  WhereFilter,
} from './collection-query.js';
import { FetchResultEntity } from './results.js';

/**
 * Basic interface for a functional builder
 */
export type BuilderBase<
  T,
  Ignore extends string = never,
  Extend extends string = never
> = {
  [K in keyof Omit<T, Ignore> | Extend]-?: (...args: any) => any;
} & { build: () => T };

/**
 * Input for builder where() clauses
 */
export type FilterInput<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>,
  P extends M extends Models<any, any>
    ? SchemaPaths<M, CN>
    : Path = M extends Models<any, any> ? SchemaPaths<M, CN> : Path
> =
  | [typeof undefined]
  | FilterStatement<M, CN, P>
  | [FilterStatement<M, CN, P>]
  | WhereFilter<M, CN>[]
  | [QueryWhere<M, CN>];

/**
 * Input for builder order() clauses
 */
export type OrderInput<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = OrderStatement<M, CN> | [OrderStatement<M, CN>] | [QueryOrder<M, CN>];

/**
 * Input for builder after() clauses
 */
export type AfterInput<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> =
  | ValueCursor
  | (M extends Models<any, any>
      ? FetchResultEntity<CollectionQueryDefault<M, CN>>
      : undefined)
  | undefined;

/**
 * Helper type to extract the subquery information from a relation name based on include() inputs
 */
export type InclusionFromArgs<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>,
  RName extends string,
  Inclusion extends RelationSubquery<M, any> | null
> = M extends Models<any, any>
  ? Inclusion extends null
    ? // Look up in Models
      RName extends RelationAttributes<ModelFromModels<M, CN>>
      ? {
          // Colleciton query with params based on the relation
          subquery: CollectionQuery<
            M,
            ModelFromModels<
              M,
              CN
            >['properties'][RName]['query']['collectionName']
          >;
          cardinality: ModelFromModels<
            M,
            CN
          >['properties'][RName]['cardinality'];
        }
      : never
    : Inclusion
  : Inclusion;

/**
 * A collection query with just allowed params for a subquery in an include() clause
 */
export type IncludeSubquery<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = Pick<
  CollectionQueryDefault<M, CN>,
  'select' | 'order' | 'where' | 'limit' | 'include'
>;
