import { CollectionNameFromModels } from '../../db.js';
import {
  Models,
  RelationAttributes,
  SchemaPaths,
} from '../../schema/types/index.js';
import {
  CollectionQueryDefault,
  FilterStatement,
  OrderStatement,
  QueryOrder,
  QueryWhere,
  RelationSubquery,
  ValueCursor,
  WhereFilter,
  RefQuery,
  Ref,
  ToQuery,
} from './collection-query.js';

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
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  P extends SchemaPaths<M, CN> = SchemaPaths<M, CN>
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
  M extends Models,
  CN extends CollectionNameFromModels<M>
> = OrderStatement<M, CN> | [OrderStatement<M, CN>] | [QueryOrder<M, CN>];

/**
 * Input for builder after() clauses
 */
export type AfterInput<
  M extends Models,
  CN extends CollectionNameFromModels<M>
> = ValueCursor | undefined; // FetchResultEntity<CollectionQueryDefault<M, CN>>

/**
 * Helper type to extract the subquery information from a relation name based on include() inputs
 */
export type InclusionByRName<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  RName extends RelationAttributes<M, CN>
> = RelationSubquery<
  M,
  ToQuery<M, RefQuery<M, CN, RName>>,
  Ref<M, CN, RName>['cardinality']
>;

/**
 * A collection query with just allowed params for a subquery in an include() clause
 */
export type IncludeSubquery<
  M extends Models,
  CN extends CollectionNameFromModels<M>
> = Pick<
  CollectionQueryDefault<M, CN>,
  'select' | 'order' | 'where' | 'limit' | 'include'
>;
