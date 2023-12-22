import {
  AsyncTupleStorageApi,
  KeyValuePair,
  ScanStorageArgs,
  WriteOps,
} from '@triplit/tuple-database';
import { IndexedDbTupleStorage } from '@triplit/tuple-database/storage/IndexedDbTupleStorage.js';
import { MemoryBTreeStorage } from './memory-btree.js';

export class IndexedDbStorage implements AsyncTupleStorageApi {
  private _indexedDB: IndexedDbTupleStorage;
  private _cache: MemoryBTreeStorage;
  private _dbReady: Promise<void>;
  constructor(
    public dbName: string,
    private options: { cache: boolean } = { cache: true }
  ) {
    this._indexedDB = new IndexedDbTupleStorage(dbName);
    this._cache = new MemoryBTreeStorage();
    this._dbReady = options.cache
      ? new Promise(async (res, rej) => {
          try {
            const results = await this._indexedDB.scan();
            this._cache.commit({ set: results });
            res();
          } catch (e) {
            rej(e);
          }
        })
      : Promise.resolve();
  }
  async scan(args?: ScanStorageArgs | undefined): Promise<KeyValuePair[]> {
    await this._dbReady;
    return this.options.cache
      ? this._cache.scan(args)
      : this._indexedDB.scan(args);
  }

  async commit(writes: WriteOps<KeyValuePair>): Promise<void> {
    await this._dbReady;
    if (this.options.cache) {
      this._cache.commit(writes);
      this._indexedDB.commit(writes);
    } else {
      await this._indexedDB.commit(writes);
    }
  }
  async close(): Promise<void> {
    await this._dbReady;
    if (this._cache) this._cache.close();
    await this._indexedDB.close();
  }
}
