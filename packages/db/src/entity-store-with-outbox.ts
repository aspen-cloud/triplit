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

  async applyChangesWithTimestamp(
    tx: KVStoreTransaction,
    buffer: DBChanges,
    timestamp: Timestamp,
    options: ApplyChangesOptions
  ): Promise<DBChanges> {
    const changesToCache = await this.store.applyChangesWithTimestamp(
      tx,
      buffer,
      timestamp,
      options
    );
    const outboxChanges = await this.doubleBuffer.getChanges(tx);
    // Basically we'll make sure that the pruned changes returned respect the changes in the outbox
    // So if something was deleted in the outbox, we'll remove any sets or deletes for that entity
    // if it was updated in the outbox, we'll remove any deletes for that entity but if there is a
    // set, we'll merge them together with the outbox changes applied on top.
    // if there is an insert in the outbox, we'll remove both sets and deletes for that entity
    for (const collection in outboxChanges) {
      const outboxCollectionChanges = outboxChanges[collection];
      const changesToPrune = changesToCache[collection];
      if (!changesToPrune) continue;
      for (const id of outboxCollectionChanges.deletes) {
        changesToPrune.deletes.delete(id);
        changesToPrune.sets.delete(id);
      }
      for (const [id, change] of outboxCollectionChanges.sets) {
        changesToPrune.deletes.delete(id);
        const newChangeForEntity = changesToPrune.sets.get(id);
        if (newChangeForEntity) {
          changesToPrune.sets.set(id, {
            ...newChangeForEntity,
            ...change,
          });
        }
      }
    }
    return changesToCache;
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
