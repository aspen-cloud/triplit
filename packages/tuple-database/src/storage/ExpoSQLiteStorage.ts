import * as SQLite from "expo-sqlite"
import {
	AsyncSQLiteAdapter,
	AsyncSQLiteExecutor,
	AsyncAdapterSQLiteStorage,
	AdapterSQLiteOptions,
} from "./AdapterSQLiteStorage"
import { AsyncTupleStorageApi } from "../database/async/asyncTypes"

export class ExpoSQLiteTupleStorage implements AsyncTupleStorageApi {
	private storeReady: Promise<AsyncAdapterSQLiteStorage>

	constructor(name: string, options?: AdapterSQLiteOptions)
	constructor(db: SQLite.SQLiteDatabase, options?: AdapterSQLiteOptions)
	constructor(
		arg0: string | SQLite.SQLiteDatabase,
		options: AdapterSQLiteOptions = {}
	) {
		if (typeof arg0 === "string") {
			this.storeReady = SQLite.openDatabaseAsync(arg0).then((db) => {
				return new AsyncAdapterSQLiteStorage(new ExpoSQLiteAdapter(db), options)
			})
		} else {
			this.storeReady = Promise.resolve(
				new AsyncAdapterSQLiteStorage(new ExpoSQLiteAdapter(arg0), options)
			)
		}
	}

	scan: AsyncTupleStorageApi["scan"] = async (args = {}) => {
		const store = await this.storeReady
		return store.scan(args)
	}

	commit: AsyncTupleStorageApi["commit"] = async (ops) => {
		const store = await this.storeReady
		return store.commit(ops)
	}

	close: AsyncTupleStorageApi["close"] = async () => {
		const store = await this.storeReady
		return store.close()
	}
}

class ExpoSQLiteAdapter implements AsyncSQLiteAdapter {
	constructor(private db: SQLite.SQLiteDatabase) {}
	async execute(sql: string, args?: any[] | undefined) {
		return await this.db.getAllAsync(sql, args ?? [])
	}
	normalizeResults(results: any): { key: string; value: string }[] {
		if (!results) return []
		return results as { key: string; value: string }[]
	}
	async transact(fn: (adapter: AsyncSQLiteExecutor) => Promise<void>) {
		await this.db.withTransactionAsync(async () => {
			await fn({
				execute: async (sql, args) => {
					return await this.db.getAllAsync(sql, args ?? [])
				},
			})
		})
	}
	async close() {
		await this.db.closeAsync()
	}
}
