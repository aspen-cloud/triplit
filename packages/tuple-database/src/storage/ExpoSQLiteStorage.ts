import * as SQLite from "expo-sqlite";
import type { AsyncTupleStorageApi } from "../database/async/asyncTypes.js";
import {
	type AdapterSQLiteOptions,
	AsyncAdapterSQLiteStorage,
	type AsyncSQLiteAdapter,
	type AsyncSQLiteExecutor,
} from "./AdapterSQLiteStorage.js";

export class ExpoSQLiteTupleStorage implements AsyncTupleStorageApi {
	private storeReady: Promise<AsyncAdapterSQLiteStorage>;

	constructor(name: string, options?: AdapterSQLiteOptions);
	constructor(db: SQLite.SQLiteDatabase, options?: AdapterSQLiteOptions);
	constructor(
		arg0: string | SQLite.SQLiteDatabase,
		options: AdapterSQLiteOptions = {},
	) {
		if (typeof arg0 === "string") {
			this.storeReady = SQLite.openDatabaseAsync(arg0).then((db) => {
				return new AsyncAdapterSQLiteStorage(
					new ExpoSQLiteAdapter(db),
					options,
				);
			});
		} else {
			this.storeReady = Promise.resolve(
				new AsyncAdapterSQLiteStorage(new ExpoSQLiteAdapter(arg0), options),
			);
		}
	}

	scan: AsyncTupleStorageApi["scan"] = async (args = {}) => {
		const store = await this.storeReady;
		return store.scan(args);
	};

	commit: AsyncTupleStorageApi["commit"] = async (ops) => {
		const store = await this.storeReady;
		return store.commit(ops);
	};

	clear: AsyncTupleStorageApi["clear"] = async () => {
		const store = await this.storeReady;
		return store.clear();
	};

	close: AsyncTupleStorageApi["close"] = async () => {
		const store = await this.storeReady;
		return store.close();
	};
}
class ExpoSQLiteAdapter implements AsyncSQLiteAdapter {
	private isInTransaction = false;
	private transactionQueue: Promise<void> = Promise.resolve();

	constructor(private db: SQLite.SQLiteDatabase) {}

	async execute(sql: string, args?: any[] | undefined) {
		// Queue operations to prevent concurrent access
		return new Promise((resolve, reject) => {
			setTimeout(
				async () => {
					try {
						const result = await this.db.getAllAsync(sql, args ?? []);
						resolve(result);
					} catch (error) {
						reject(error);
					}
				},
				this.isInTransaction ? 100 : 0,
			);
		});
	}

	normalizeResults(results: any): { key: string; value: string }[] {
		if (!results) return [];
		return results as { key: string; value: string }[];
	}

	async transact(fn: (adapter: AsyncSQLiteExecutor) => Promise<void>) {
		// Queue transactions
		this.transactionQueue = this.transactionQueue.then(() =>
			this._performTransaction(fn),
		);
		await this.transactionQueue;
	}

	private async _performTransaction(
		fn: (adapter: AsyncSQLiteExecutor) => Promise<void>,
	) {
		let retries = 3;
		while (retries > 0) {
			try {
				this.isInTransaction = true;
				await this.db.withExclusiveTransactionAsync(async () => {
					await fn({
						execute: async (sql, args) => {
							return await this.db.getAllAsync(sql, args ?? []);
						},
					});
				});
				break;
			} catch (error) {
				if (error.message.includes("database is locked") && retries > 1) {
					// Wait before retrying
					await new Promise((resolve) => setTimeout(resolve, 200));
					retries--;
				} else {
					throw error;
				}
			} finally {
				this.isInTransaction = false;
			}
		}
	}

	async close() {
		// Wait for any pending transactions to complete
		await this.transactionQueue;
		try {
			await this.db.closeAsync();
		} catch (error) {
			console.error("Error closing database:", error);
			throw error;
		}
	}
}
