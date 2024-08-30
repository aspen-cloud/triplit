import {
	encodeTuple as _encodeTuple,
	decodeTuple as _decodeTuple,
} from "../helpers/codec.js"
import { TupleStorageApi } from "../database/sync/types.js"
import { AsyncTupleStorageApi } from "../database/async/asyncTypes.js"
import { KeyValuePair, ScanStorageArgs, WriteOps } from "./types.js"

const NULL_BYTE = "\x00"
const DELIMITER_BYTE = "\x01"
const ESCAPE_BYTE = "\x02"

const codecOptions = {
	delimiter: DELIMITER_BYTE,
	escape: ESCAPE_BYTE,
	disallow: [NULL_BYTE],
}

function encodeKey(tuple: any[]) {
	return _encodeTuple(tuple, codecOptions)
}

function decodeKey(encoded: string) {
	return _decodeTuple(encoded, codecOptions)
}

function encodeValue(value: any) {
	return JSON.stringify(value)
}

function decodeValue(encoded: string) {
	return JSON.parse(encoded)
}

export interface SQLiteExecutor {
	execute(sql: string, args?: any[]): any
}

export interface SQLiteAdapter extends SQLiteExecutor {
	transact(fn: (executor: SQLiteExecutor) => void): void
	close(): void
	normalizeResults(results: any): { key: string; value: string }[]
}

export interface AsyncSQLiteExecutor {
	execute(sql: string, args?: any[]): Promise<any>
}
export interface AsyncSQLiteAdapter extends AsyncSQLiteExecutor {
	transact(fn: (executor: AsyncSQLiteExecutor) => Promise<void>): Promise<void>
	close(): Promise<void>
	normalizeResults(results: any): { key: string; value: string }[]
}

export type AdapterSQLiteOptions = {
	tableName?: string
}

type RequiredAdapterSQLiteOptions = Required<AdapterSQLiteOptions>

export class AdapterSQLiteStorage implements TupleStorageApi {
	private options: RequiredAdapterSQLiteOptions

	constructor(
		private adapter: SQLiteAdapter,
		options: AdapterSQLiteOptions = {}
	) {
		this.options = optionsWithDefaults(options)
		this.adapter.execute(
			`CREATE TABLE IF NOT EXISTS ${this.options.tableName} (key text primary key, value text)`
		)
	}
	scan(args: ScanStorageArgs = {}): KeyValuePair[] {
		const { sqlQuery, sqlArgs } = scanArgsToSQLQuery(args, this.options)
		const result = this.adapter.execute(sqlQuery, sqlArgs)
		const data = this.adapter.normalizeResults(result)
		return data.map((kv) => {
			return {
				key: decodeKey(kv.key),
				value: decodeValue(kv.value),
			} as KeyValuePair
		})
	}
	commit(writes: WriteOps): void {
		this.adapter.transact((tx) => {
			for (const { key, value } of writes.set ?? []) {
				tx.execute(
					`INSERT OR REPLACE INTO ${this.options.tableName} (key, value) VALUES (?, ?)`,
					[encodeKey(key), encodeValue(value)]
				)
			}
			for (const key of writes.remove ?? []) {
				tx.execute(`DELETE FROM ${this.options.tableName} WHERE key = ?`, [
					encodeKey(key),
				])
			}
		})
	}
	close(): void {
		this.adapter.close()
	}
}

export class AsyncAdapterSQLiteStorage implements AsyncTupleStorageApi {
	private options: RequiredAdapterSQLiteOptions
	private dbReady: Promise<any>

	constructor(
		private adapter: AsyncSQLiteAdapter,
		options: AdapterSQLiteOptions = {}
	) {
		this.options = optionsWithDefaults(options)
		this.dbReady = this.adapter.execute(
			`CREATE TABLE IF NOT EXISTS ${this.options.tableName} (key text primary key, value text)`
		)
	}
	async scan(args: ScanStorageArgs = {}): Promise<KeyValuePair[]> {
		await this.dbReady
		const { sqlQuery, sqlArgs } = scanArgsToSQLQuery(args, this.options)
		const result = await this.adapter.execute(sqlQuery, sqlArgs)
		const data = this.adapter.normalizeResults(result)
		return data.map((kv) => {
			return {
				key: decodeKey(kv.key),
				value: decodeValue(kv.value),
			} as KeyValuePair
		})
	}
	async commit(writes: WriteOps): Promise<void> {
		await this.dbReady
		await this.adapter.transact(async (tx) => {
			for (const { key, value } of writes.set ?? []) {
				await tx.execute(
					`INSERT OR REPLACE INTO ${this.options.tableName} (key, value) VALUES (?, ?)`,
					[encodeKey(key), encodeValue(value)]
				)
			}
			for (const key of writes.remove ?? []) {
				await tx.execute(
					`DELETE FROM ${this.options.tableName} WHERE key = ?`,
					[encodeKey(key)]
				)
			}
		})
	}
	async close(): Promise<void> {
		await this.dbReady
		await this.adapter.close()
	}
}

function scanArgsToSQLQuery(
	args: ScanStorageArgs,
	options: RequiredAdapterSQLiteOptions
): {
	sqlQuery: string
	sqlArgs: (string | number)[]
} {
	// Bounds.
	let start = args.gte ? encodeKey(args.gte) : undefined
	let startAfter: string | undefined = args.gt ? encodeKey(args.gt) : undefined
	let end: string | undefined = args.lte ? encodeKey(args.lte) : undefined
	let endBefore: string | undefined = args.lt ? encodeKey(args.lt) : undefined

	const sqlArgs = [start, startAfter, end, endBefore, args.limit].filter(
		Boolean
	) as (string | number)[]
	const where = [
		start ? "key >= ?" : undefined,
		startAfter ? "key > ?" : undefined,
		end ? "key <= ?" : undefined,
		endBefore ? "key < ?" : undefined,
	]
		.filter(Boolean)
		.join(" and ")

	let sqlQuery = `select * from ${options.tableName}`
	if (where) {
		sqlQuery += " where "
		sqlQuery += where
	}
	sqlQuery += " order by key"
	if (args.reverse) {
		sqlQuery += " desc"
	}
	if (args.limit) {
		sqlQuery += ` limit ?`
	}
	return { sqlQuery, sqlArgs }
}

function optionsWithDefaults(
	options: AdapterSQLiteOptions
): RequiredAdapterSQLiteOptions {
	return {
		tableName: "data",
		...options,
	}
}
