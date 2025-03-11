import {
  CollectionName,
  DBChanges,
  DBEntity,
  KVStore,
  KVStoreTransaction,
  EntitySyncStore,
  KVStoreOrTransaction,
  DoubleBuffer,
  ApplyChangesOptions,
} from './types.js';
import { EntityStoreKV } from './entity-store.js';
import { Timestamp } from './types.js';
import { KVDoubleBuffer } from './double-buffer.js';
import { DurableWriteBuffer } from './durable-write-buffer.js';
import {
  applyOverlay,
  overlayChangesOnCollection,
} from './overlay-change-buffer.js';

export class EntityStoreWithOutbox implements EntitySyncStore {
  doubleBuffer: DoubleBuffer;
  private store: EntitySyncStore;
  constructor(readonly storage: KVStore) {
    this.doubleBuffer = new KVDoubleBuffer(
      new DurableWriteBuffer(['buf0']),
      new DurableWriteBuffer(['buf1'])
    );
    this.store = new EntityStoreKV();
  }

  get metadataStore() {
    return this.store.metadataStore;
  }

  get dataStore() {
    return this.store.dataStore;
  }

  async applyChanges(
    tx: KVStoreTransaction,
    changes: DBChanges
  ): Promise<DBChanges> {
    await this.doubleBuffer.write(tx, changes);
    return changes;
  }

  applyChangesWithTimestamp(
    tx: KVStoreTransaction,
    buffer: DBChanges,
    timestamp: Timestamp,
    options: ApplyChangesOptions
  ): Promise<DBChanges> {
    return this.store.applyChangesWithTimestamp(tx, buffer, timestamp, options);
  }

  async getEntity(
    storage: KVStoreOrTransaction,
    collection: string,
    id: string
  ): Promise<DBEntity | undefined> {
    const primary = await this.store.getEntity(storage, collection, id);
    const outbox = await this.doubleBuffer.getChangesForEntity(
      storage,
      collection,
      id
    );
    return applyOverlay(primary, !!outbox?.delete, outbox?.update);
  }

  async getCollectionStats(
    storage: KVStoreOrTransaction
  ): Promise<Map<string, number>> {
    throw new Error('Method not implemented.');
  }

  async *getEntitiesInCollection(
    storage: KVStoreOrTransaction,
    collection: CollectionName
  ): AsyncIterable<DBEntity> {
    yield* overlayChangesOnCollection(
      this.store.getEntitiesInCollection(storage, collection),
      await this.doubleBuffer.getChangesForCollection(storage, collection)
    );
  }
}
