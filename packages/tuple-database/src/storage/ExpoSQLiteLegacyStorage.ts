// @ts-nocheck

import * as SQLite from "expo-sqlite"
import {
	AsyncSQLiteAdapter,
	AsyncSQLiteExecutor,
	AsyncAdapterSQLiteStorage,
	AdapterSQLiteOptions,
} from "./AdapterSQLiteStorage"
import { AsyncTupleStorageApi } from "../database/async/asyncTypes.js"

export class ExpoSQLiteLegacyTupleStorage implements AsyncTupleStorageApi {
	private db: SQLite.SQLiteDatabase
	private store: AsyncAdapterSQLiteStorage

	constructor(name: string, options?: AdapterSQLiteOptions)
	constructor(db: SQLite.SQLiteDatabase, options?: AdapterSQLiteOptions)
	constructor(
		arg0: string | SQLite.SQLiteDatabase,
		options: AdapterSQLiteOptions = {}
	) {
		if (typeof arg0 === "string") {
			this.db = SQLite.openDatabase(arg0)
		} else {
			this.db = arg0
		}
		this.store = new AsyncAdapterSQLiteStorage(
			new ExpoSQLiteLegacyAdapter(this.db),
			options
		)
	}

	scan: AsyncTupleStorageApi["scan"] = async (args = {}) => {
		return this.store.scan(args)
	}

	commit: AsyncTupleStorageApi["commit"] = async (ops) => {
		return this.store.commit(ops)
	}

	close: AsyncTupleStorageApi["close"] = async () => {
		return this.store.close()
	}
}

class ExpoSQLiteLegacyAdapter implements AsyncSQLiteAdapter {
	constructor(private db: SQLite.SQLiteDatabase) {}
	async execute(sql: string, args?: any[] | undefined) {
		return (await this.db.execAsync([{ sql, args: args ?? [] }], false))[0]
	}
	normalizeResults(results: any): { key: string; value: string }[] {
		if (!results.rows) return []
		return results.rows as { key: string; value: string }[]
	}
	async transact(fn: (adapter: AsyncSQLiteExecutor) => Promise<void>) {
		await this.db.transactionAsync(async (tx) => {
			await fn({
				execute: async (sql, args) => {
					return await tx.executeSqlAsync(sql, args ?? [])
				},
			})
		})
	}
	async close() {
		await this.db.closeAsync()
	}
}
