import {
  AsyncTupleStorageApi,
  KeyValuePair,
  ScanStorageArgs,
  WriteOps,
} from 'tuple-database';
import { IndexedDbTupleStorage } from 'tuple-database/storage/IndexedDbTupleStorage';
import MemoryBTree from './memory-btree';
export default class CachedIndexedDbStorage implements AsyncTupleStorageApi {
  private _indexedDB: IndexedDbTupleStorage;
  private _cache: MemoryBTree;
  private _dbReady: Promise<void>;
  constructor(public dbName: string) {
    this._indexedDB = new IndexedDbTupleStorage(dbName);
    this._cache = new MemoryBTree();
    this._dbReady = new Promise(async (res, rej) => {
      try {
        const results = await this._indexedDB.scan();
        this._cache.commit({ set: results });
        res();
      } catch (e) {
        rej(e);
      }
    });
  }
  async scan(args?: ScanStorageArgs | undefined): Promise<KeyValuePair[]> {
    await this._dbReady;
    return this._cache.scan(args);
  }

  async commit(writes: WriteOps<KeyValuePair>): Promise<void> {
    await this._dbReady;
    this._cache.commit(writes);
    this._indexedDB.commit(writes);
  }
  async close(): Promise<void> {
    await this._dbReady;
    this._cache.close();
    await this._indexedDB.close();
  }
}
