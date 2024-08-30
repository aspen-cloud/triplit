import { AsyncTupleStorageApi } from "../database/async/asyncTypes.js"
import { IndexedDbTupleStorage } from "./IndexedDbTupleStorage.js"
import { MemoryBTreeStorage } from "./MemoryBTreeTupleStorage.js"
import { KeyValuePair, ScanStorageArgs, WriteOps } from "./types.js"

export class CachedIndexedDbStorage implements AsyncTupleStorageApi {
	private _indexedDB: IndexedDbTupleStorage
	private _cache: MemoryBTreeStorage
	private _cacheReadyForReads = false
	constructor(
		public dbName: string,
		private options: { cache: boolean } = { cache: true }
	) {
		this._indexedDB = new IndexedDbTupleStorage(dbName)
		this._cache = new MemoryBTreeStorage()
		if (options.cache) {
			this.initializeCacheFromIndexedDB()
		}
	}

	private async initializeCacheFromIndexedDB() {
		const results = await this._indexedDB.scan()
		this._cache.commit({ set: results })
		this._cacheReadyForReads = true
	}

	async scan(args?: ScanStorageArgs | undefined): Promise<KeyValuePair[]> {
		return this.options.cache && this._cacheReadyForReads
			? this._cache.scan(args)
			: this._indexedDB.scan(args)
	}

	async commit(writes: WriteOps<KeyValuePair>): Promise<void> {
		if (this.options.cache) {
			this._cache.commit(writes)
			await this._indexedDB.commit(writes)
		} else {
			await this._indexedDB.commit(writes)
		}
	}
	async close(): Promise<void> {
		if (this._cache) this._cache.close()
		await this._indexedDB.close()
	}
}
