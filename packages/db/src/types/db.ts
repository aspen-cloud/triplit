import { DBTransaction } from '../db-transaction.js';
import { DBSchema } from '../db.js';
import { IVM, IVMOptions } from '../ivm.js';
import {
  CollectionNameFromModels,
  Decoded,
  Models,
  SchemaChange,
  WriteDecoded,
} from '../schema/index.js';
import {
  DBChanges,
  EntitySyncStore,
  FetchResult,
  KVStore,
  SchemaQuery,
} from '../types.js';
import { Unalias } from '../utils/types.js';

// === Data Models ==
export type ReadModel<
  M extends Models<M>,
  CN extends CollectionNameFromModels<M>,
> = Unalias<Decoded<M[CN]['schema']>>;

export type WriteModel<
  M extends Models<M>,
  CN extends CollectionNameFromModels<M>,
> = Unalias<WriteDecoded<M[CN]['schema']>>;

// === API Options ===
export interface DBOptions<
  M extends Models<M> = Models,
  E extends EntitySyncStore = EntitySyncStore,
> {
  kv?: KVStore;
  clientId?: string;
  entityStore?: E;
  schema?: DBSchema<M>;
  ivm?: IVM;
  variables?: Record<string, any>;
  ivmOptions?: IVMOptions;
  experimental?: {};
}
export type FetchOptions = { skipRules?: boolean };
export type UpdatePayload<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
> = Partial<ReadModel<M, CN>> | EntityUpdater<M, CN>;
export type EntityUpdater<
  M extends Models<M>,
  CN extends CollectionNameFromModels<M>,
> = (entity: ReadModel<M, CN>) => void | Promise<void>;
export type ClearOptions = {
  full?: boolean;
};
export type TransactCallback<M extends Models<M>, Output> = (
  tx: DBTransaction<M>
) => Promise<Output>;
export type TransactOptions = EntityWriteOptions;
export type EntityWriteOptions = {
  skipRules: boolean;
};
export type SubscriptionResultsCallback<
  M extends Models<M> = Models,
  Q extends SchemaQuery<M> = SchemaQuery<M>,
> = (results: FetchResult<M, Q, 'many'>, queryKey?: string) => void;
export type OnCommitCallback = (changes: DBChanges) => Promise<void>;
export type SchemaChangeListener = (
  change: SchemaChange
) => void | Promise<void>;
