import { type Timestamp as HybridClockTimestamp } from '@triplit/types/sync.js';
import { Tuple } from './codec.js';
import { EntityMetadataStore } from './entity-metadata-store.js';
import { PermissionWriteOperations } from './schema/index.js';
import { TripleRow, TupleValue } from './legacy.js';

// TODO: refactor paths and organization
export type * from './query.js';
export type * from './types/index.js';
export type * from './utils/types.js';

export type EntityId = string;
export type CollectionName = string;
export type Timestamp = HybridClockTimestamp;

export type Update = { [attribute: string]: TupleValue };
type Delete = null;
export type Insert = { [attribute: string]: TupleValue; id: EntityId };
export type DBEntity = Insert;
export type EntityMetadata = { [attribute: string]: Timestamp };
export type Change = Update | Insert;
export type Deletes = Set<EntityId>;
export type CollectionChanges = {
  sets: Map<EntityId, Change>;
  deletes: Deletes;
};
export type DBChanges = Record<CollectionName, CollectionChanges>;
export type LegacyTriple = TripleRow;
export type Triple = {
  id: EntityId;
  collection: CollectionName;
  attribute: string[];
  value: TupleValue;
  timestamp: Timestamp;
};

export interface EntitySyncStore extends EntityStore {
  readonly metadataStore: EntityMetadataStore;
  readonly dataStore: EntityStore;
  applyChangesWithTimestamp(
    tx: KVStoreTransaction,
    buffer: DBChanges,
    timestamp: Timestamp,
    options: ApplyChangesOptions
  ): Promise<DBChanges>;
}

export interface EntityStore {
  applyChanges(
    tx: KVStoreTransaction,
    buffer: DBChanges,
    options: ApplyChangesOptions
  ): Promise<DBChanges>;
  getEntity(
    storage: KVStoreOrTransaction,
    collection: string,
    id: string
    // TODO: make this null
  ): Promise<DBEntity | undefined>;
  getEntitiesInCollection(
    storage: KVStoreOrTransaction,
    collection: CollectionName
  ): AsyncIterable<DBEntity>;
  getCollectionStats(
    storage: KVStoreOrTransaction,
    knownCollections?: CollectionName[]
  ): Promise<Map<string, number>>;
}

export interface WriteBuffer {
  clear(tx: KVStoreTransaction): Promise<void>;
  clearChangesForEntity(
    tx: KVStoreTransaction,
    collectionName: CollectionName,
    id: EntityId
  ): Promise<void>;
  write(tx: KVStoreTransaction, buffer: DBChanges): Promise<void>;
  getChanges(storage: KVStoreOrTransaction): Promise<DBChanges>;
  getChangesForCollection(
    storage: KVStoreOrTransaction,
    collectionName: CollectionName
  ): Promise<CollectionChanges | undefined>;
  getChangesForEntity(
    storage: KVStoreOrTransaction,
    collectionName: CollectionName,
    id: EntityId
  ): Promise<{ update: Change; delete: boolean } | undefined>;
  isEmpty(storage: KVStoreOrTransaction): Promise<boolean>;
}

// Delete this doesn't belong here
export interface DoubleBuffer extends WriteBuffer {
  lockAndSwitchBuffers(): void;
  getLockedBuffer(): WriteBuffer;
  getUnlockedBuffer(): WriteBuffer;
}

export interface KVStore extends KVStoreAPI {
  scope(prefix: Tuple): KVStore;
  transact(): KVStoreTransaction;
  /**
   * For internal use only
   */
  applyEdits(
    sets: AsyncIterable<[Tuple, any]> | Iterable<[Tuple, any]>,
    deletes: AsyncIterable<Tuple> | Iterable<Tuple>
  ): Promise<void>;
}

export type KVStoreOrTransaction = KVStore | KVStoreTransaction;

export interface KVStoreAPI {
  // scope<KV extends KVStoreAPI>(prefix: string): KV;
  get(key: Tuple, scope?: Tuple): Promise<any>;
  set(key: Tuple, value: any, scope?: Tuple): Promise<void>;
  delete(key: Tuple, scope?: Tuple): Promise<void>;
  scan(options: ScanOptions, scope?: Tuple): AsyncIterable<[Tuple, any]>;
  scanValues(options: ScanOptions, scope?: Tuple): AsyncIterable<any>;
  clear(scope?: Tuple): Promise<void>;
  count(countOptions: CountOptions, scope?: Tuple): Promise<number>;
}

export interface ScanOptions {
  prefix: Tuple;
}

export interface CountOptions {
  prefix: Tuple;
}

export type TxStatus = 'open' | 'committed' | 'cancelled';

export interface KVStoreTransaction extends KVStoreAPI {
  scope(prefix: Tuple): KVStoreTransaction;
  commit(): Promise<void>;
  cancel(): void;
  status: TxStatus;
}

export type ApplyChangesOptions = {
  checkWritePermission: WritePermissionCheck | undefined;
  entityChangeValidator: EntityChangeValidator | undefined;
};

export type WritePermissionCheck = (
  storage: KVStoreOrTransaction,
  collection: string,
  entity: any,
  operation: PermissionWriteOperations
) => Promise<void>;

export type EntityChangeValidator = (
  collection: string,
  change: Change,
  options: { ignoreRequiredProperties: boolean }
) => void;
