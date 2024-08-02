import type {
  CollectionNameFromModels,
  CollectionQuery,
  CollectionQueryDefault,
  Models,
  QueryInclusions,
  QuerySelectionValue,
  RelationSubquery,
  SchemaQueries,
} from '@triplit/db';

/**
 * Possible values for the syncStatus field in a query.
 * - pending: Items that are in the outbox
 * - confirmed: Items that have been confirmed by the server
 * - all: All items
 */
export type SyncStatus = 'pending' | 'confirmed' | 'all';

type ClientQueryExtensions = {
  syncStatus?: SyncStatus;
};

/**
 * Query that can be passed to a Triplit Client.
 */
export type ClientQuery<
  M extends ClientSchema | undefined,
  CN extends CollectionNameFromModels<M>,
  Selection extends ReadonlyArray<QuerySelectionValue<M, CN>> = ReadonlyArray<
    QuerySelectionValue<M, CN>
  >,
  Inclusions extends QueryInclusions<M, CN> = QueryInclusions<M, CN>
> = CollectionQuery<M, CN, Selection, Inclusions> & ClientQueryExtensions;

export type ClientQueryFromCollectionQuery<
  Q extends CollectionQuery<any, any, any, any>
> = Q & ClientQueryExtensions;

export type SchemaClientQueries<M extends ClientSchema | undefined> =
  ClientQueryFromCollectionQuery<SchemaQueries<M>>;

/**
 * A client query with default selection and inclusion.
 */
export type ClientQueryDefault<
  M extends ClientSchema | undefined,
  CN extends CollectionNameFromModels<M>
> = ClientQueryFromCollectionQuery<CollectionQueryDefault<M, CN>>;

/**
 * Friendly alias for Models type.
 */
export type ClientSchema = Models<any, any>;
