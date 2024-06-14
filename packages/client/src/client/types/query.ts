import type {
  CollectionNameFromModels,
  CollectionQuery,
  Models,
  QuerySelectionValue,
  RelationSubquery,
} from '@triplit/db';

/**
 * Possible values for the syncStatus field in a query.
 * - pending: Items that are in the outbox
 * - confirmed: Items that have been confirmed by the server
 * - all: All items
 */
export type SyncStatus = 'pending' | 'confirmed' | 'all';

/**
 * Query that can be passed to a Triplit Client.
 */
export type ClientQuery<
  M extends ClientSchema | undefined,
  CN extends CollectionNameFromModels<M>,
  Selection extends QuerySelectionValue<M, CN> = QuerySelectionValue<M, CN>,
  Inclusions extends Record<string, RelationSubquery<M, any>> = Record<
    string,
    RelationSubquery<M, any>
  >
> = {
  syncStatus?: SyncStatus;
} & CollectionQuery<M, CN, Selection, Inclusions>;

/**
 * A client query with default selection and inclusion.
 */
export type ClientQueryDefault<
  M extends ClientSchema | undefined,
  CN extends CollectionNameFromModels<M>
> = ClientQuery<M, CN, QuerySelectionValue<M, CN>, {}>;

/**
 * Friendly alias for Models type.
 */
export type ClientSchema = Models<any, any>;
