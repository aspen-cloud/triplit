import {
  Change,
  CollectionChanges,
  CollectionName,
  EntityId,
  KVStoreOrTransaction,
  KVStoreTransaction,
  WriteBuffer,
  type DBChanges,
  type DoubleBuffer,
} from './types.js';
import { mergeDBChanges } from './memory-write-buffer.js';
import { deepObjectAssign } from './utils/deep-merge.js';

export class KVDoubleBuffer implements DoubleBuffer, WriteBuffer {
  private _buffers: [WriteBuffer, WriteBuffer];
  private activeBufferIndex: 0 | 1 = 0;
  constructor(buffer0: WriteBuffer, buffer1: WriteBuffer) {
    this._buffers = [buffer0, buffer1];
  }

  get activeBuffer(): WriteBuffer {
    return this._buffers[this.activeBufferIndex];
  }

  get inactiveBuffer(): WriteBuffer {
    return this._buffers[1 - this.activeBufferIndex];
  }

  async getChangesForCollection(
    storage: KVStoreOrTransaction,
    collectionName: CollectionName
  ): Promise<CollectionChanges | undefined> {
    const [inactiveBufferChanges, activeBufferChanges] = await Promise.all([
      this.inactiveBuffer.getChangesForCollection(storage, collectionName),
      this.activeBuffer.getChangesForCollection(storage, collectionName),
    ]);
    if (!inactiveBufferChanges && !activeBufferChanges) {
      return undefined;
    }
    if (!inactiveBufferChanges) {
      return activeBufferChanges;
    }
    if (!activeBufferChanges) {
      return inactiveBufferChanges;
    }
    return mergeDBChanges(
      {},
      { [collectionName]: inactiveBufferChanges },
      { [collectionName]: activeBufferChanges }
    )[collectionName];
  }

  async getChangesForEntity(
    storage: KVStoreOrTransaction,
    collection: string,
    id: string
  ): Promise<{ update: Change; delete: boolean } | undefined> {
    const inactiveBufferEntityChanges =
      await this.inactiveBuffer.getChangesForEntity(storage, collection, id);
    const activeBufferEntityChanges =
      await this.activeBuffer.getChangesForEntity(storage, collection, id);
    if (!inactiveBufferEntityChanges && !activeBufferEntityChanges) {
      return undefined;
    }
    // TODO: is this correct?
    const _delete = !!(
      inactiveBufferEntityChanges?.delete || activeBufferEntityChanges?.delete
    );
    const update = deepObjectAssign(
      {},
      inactiveBufferEntityChanges?.update,
      activeBufferEntityChanges?.update
    );
    return { update, delete: _delete };
  }

  async clear(tx: KVStoreTransaction): Promise<void> {
    await Promise.all(this._buffers.map((buffer) => buffer.clear(tx)));
  }

  // TODO: determine the semantics of clearing entity changes
  // on a double buffer. should it just affect the unlocked buffer?
  async clearChangesForEntity(
    tx: KVStoreTransaction,
    collectionName: CollectionName,
    id: EntityId
  ): Promise<void> {
    await Promise.all(
      this._buffers.map((buffer) =>
        buffer.clearChangesForEntity(tx, collectionName, id)
      )
    );
  }

  async write(tx: KVStoreTransaction, changes: DBChanges): Promise<void> {
    await this.activeBuffer.write(tx, changes);
  }

  async isEmpty(storage: KVStoreOrTransaction): Promise<boolean> {
    return (
      await Promise.all([
        this.activeBuffer.isEmpty(storage),
        this.inactiveBuffer.isEmpty(storage),
      ])
    ).every((isEmpty) => isEmpty);
  }

  async getChanges(storage: KVStoreOrTransaction): Promise<DBChanges> {
    const changes = await Promise.all([
      this.getLockedBuffer().getChanges(storage),
      this.getUnlockedBuffer().getChanges(storage),
    ]);
    return mergeDBChanges({}, changes[0], changes[1]);
  }

  lockAndSwitchBuffers(): void {
    this.activeBufferIndex = this.activeBufferIndex === 0 ? 1 : 0;
  }

  getLockedBuffer(): WriteBuffer {
    return this.inactiveBuffer;
  }

  getUnlockedBuffer(): WriteBuffer {
    return this.activeBuffer;
  }
}
