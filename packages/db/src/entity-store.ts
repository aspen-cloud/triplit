import {
  DBChanges,
  DBEntity,
  CollectionName,
  KVStoreOrTransaction,
  KVStoreTransaction,
  EntitySyncStore,
  ApplyChangesOptions,
} from './types.js';
import { Timestamp } from './types.js';
import { EntityMetadataStore } from './entity-metadata-store.js';
import { EntityDataStore } from './entity-data-store.js';

export class EntityStoreKV implements EntitySyncStore {
  readonly metadataStore: EntityMetadataStore;
  readonly dataStore: EntityDataStore;

  constructor(public storagePrefix: string[] = []) {
    this.metadataStore = new EntityMetadataStore([
      ...this.storagePrefix,
      'metadata',
    ]);
    this.dataStore = new EntityDataStore([...this.storagePrefix, 'data']); // storage.scope(['data'])
  }

  async applyChanges(
    tx: KVStoreTransaction,
    buffer: DBChanges,
    options: ApplyChangesOptions
  ) {
    return this.dataStore.applyChanges(tx, buffer, options);
  }

  async applyChangesWithTimestamp(
    tx: KVStoreTransaction,
    buffer: DBChanges,
    timestamp: Timestamp,
    options: ApplyChangesOptions
  ) {
    // This implicitly updates metadata
    const prunedChanges: DBChanges = await this.metadataStore.applyChanges(
      tx,
      buffer,
      timestamp
    );
    return this.dataStore.applyChanges(tx, prunedChanges, options);
  }

  // We make no guarantees that the entity is full (Insert type) or partial (Update type)
  // Because null may represent an update (ie delete), this should return undefined to indicate no changes
  async getEntity(
    storage: KVStoreOrTransaction,
    collection: string,
    id: string
  ): Promise<DBEntity | undefined> {
    return this.dataStore.getEntity(storage, collection, id);
  }

  getEntitiesInCollection(
    storage: KVStoreOrTransaction,
    collection: CollectionName
  ): AsyncIterable<DBEntity> {
    return this.dataStore.getEntitiesInCollection(storage, collection);
  }

  getCollectionStats(
    storage: KVStoreOrTransaction,
    knownCollections: CollectionName[] | undefined
  ): Promise<Map<string, number>> {
    return this.dataStore.getCollectionStats(storage, knownCollections);
  }
}
