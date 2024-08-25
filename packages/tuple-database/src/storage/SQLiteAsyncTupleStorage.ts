import { Database } from "better-sqlite3"
import { KeyValuePair, ScanStorageArgs, WriteOps } from "./types"
import { AsyncTupleStorageApi } from "../main"
import { SQLiteTupleStorage } from "./SQLiteTupleStorage"

export class SQLiteAsyncTupleStorage implements AsyncTupleStorageApi {
	/**
	 * import sqlite from "better-sqlite3"
	 * new SQLiteTupleStorage(sqlite("path/to.db"))
	 */
	private _storage: SQLiteTupleStorage
	constructor(private db: Database) {
		this._storage = new SQLiteTupleStorage(db)
	}

	async scan(args: ScanStorageArgs = {}) {
		return new Promise<KeyValuePair[]>((res, rej) => {
			try {
				res(this._storage.scan(args))
			} catch (e) {
				rej(e)
			}
		})
	}

	async commit(writes: WriteOps) {
		return new Promise<void>((res, rej) => {
			try {
				this._storage.commit(writes)
				res()
			} catch (e) {
				rej(e)
			}
		})
	}

	async close() {
		return new Promise<void>((res, rej) => {
			try {
				this.db.close()
				res()
			} catch (e) {
				rej(e)
			}
		})
	}
}
