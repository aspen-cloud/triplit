import type { Database } from "bun:sqlite"
import { TupleStorageApi } from "../database/sync/types.js"
import { decodeTuple, encodeTuple } from "../helpers/codec.js"
import { KeyValuePair, ScanStorageArgs, Tuple, WriteOps } from "./types.js"

type Transaction = ReturnType<Database["transaction"]>

export class BunSQLiteTupleStorage implements TupleStorageApi {
	/**
	 * import sqlite from "better-sqlite3"
	 * new SQLiteTupleStorage(sqlite("path/to.db"))
	 */
	constructor(private db: Database) {
		const createTableQuery = db.prepare(
			`create table if not exists data ( key text primary key, value text)`
		)

		// Make sure the table exists.
		createTableQuery.run()

		const insertQuery = db.prepare(
			`insert or replace into data values ($key, $value)`
		)
		const deleteQuery = db.prepare(`delete from data where key = $key`)

		this.writeFactsQuery = this.db.transaction(
			({
				inserts,
				deletes,
			}: {
				inserts: KeyValuePair[] | undefined
				deletes: Tuple[] | undefined
			}) => {
				for (const { key, value } of inserts || []) {
					insertQuery.run({
						$key: encodeTuple(key),
						$value: JSON.stringify(value),
					})
				}
				for (const tuple of deletes || []) {
					deleteQuery.run({ $key: encodeTuple(tuple) })
				}
			}
		)
	}

	private writeFactsQuery: Transaction

	scan = (args: ScanStorageArgs = {}) => {
		// Bounds.
		let start = args.gte ? encodeTuple(args.gte) : undefined
		let startAfter: string | undefined = args.gt
			? encodeTuple(args.gt)
			: undefined
		let end: string | undefined = args.lte ? encodeTuple(args.lte) : undefined
		let endBefore: string | undefined = args.lt
			? encodeTuple(args.lt)
			: undefined

		const sqlArgs = {
			$start: start,
			$startAfter: startAfter,
			$end: end,
			$endBefore: endBefore,
			$limit: args.limit,
		}

		// filterOutUndefined

		const filtered = Object.fromEntries(
			Object.entries(sqlArgs).filter(([, value]) => Boolean(value))
		) as Record<string, string>

		const where = [
			start ? "key >= $start" : undefined,
			startAfter ? "key > $startAfter" : undefined,
			end ? "key <= $end" : undefined,
			endBefore ? "key < $endBefore" : undefined,
		]
			.filter(Boolean)
			.join(" and ")

		let sqlQuery = `select * from data`
		if (where) {
			sqlQuery += " where "
			sqlQuery += where
		}
		sqlQuery += " order by key"
		if (args.reverse) {
			sqlQuery += " desc"
		}
		if (args.limit) {
			sqlQuery += ` limit $limit`
		}

		const results = this.db.prepare(sqlQuery).all(filtered)

		return results.map<KeyValuePair>(
			// @ts-ignore
			({ key, value }) =>
				({
					key: decodeTuple(key) as Tuple,
					value: JSON.parse(value),
				} as KeyValuePair)
		)
	}

	commit = (writes: WriteOps) => {
		const { set: inserts, remove: deletes } = writes
		this.writeFactsQuery({ inserts, deletes })
	}

	clear() {
		this.db.prepare(`delete from data`).run()
	}

	close() {
		this.db.close()
	}
}
