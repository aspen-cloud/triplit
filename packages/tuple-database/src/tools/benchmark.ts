/*

	./node_modules/.bin/ts-node src/tools/benchmark.ts

*/

import sqlite from "better-sqlite3"
import { Database as BunSqlite } from "bun:sqlite"
import * as fs from "fs-extra"
import { Level } from "level"
import { range } from "remeda"
import * as path from "path"
import { AsyncTupleDatabase } from "../database/async/AsyncTupleDatabase.js"
import { AsyncTupleDatabaseClientApi } from "../database/async/asyncTypes.js"
import { transactionalReadWriteAsync } from "../database/async/transactionalReadWriteAsync.js"
import { AsyncTupleDatabaseClient, InMemoryTupleStorage } from "../main.js"
import { LevelTupleStorage } from "../storage/LevelTupleStorage.js"
import { SQLiteTupleStorage } from "../storage/SQLiteTupleStorage.js"
import * as LMDB from "lmdb"
import { LMDBTupleStorage } from "../storage/LMDBTupleStorage.js"
import { MemoryBTreeStorage } from "../storage/MemoryBTreeTupleStorage.js"
import { BunSQLiteTupleStorage } from "../storage/BunSQLiteTupleStorage.js"

import { dirname } from "path"
import { fileURLToPath } from "node:url"
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const iterations = 1000
const writeIters = 100
const readSize = 10
const readIters = writeIters / readSize
const tupleSize = 4

function randomTuple() {
	return range(0, tupleSize).map(() => Math.random())
}

function randomObjectTuple() {
	return range(0, tupleSize).map(() => ({ value: Math.random() }))
}

function randomArrayTuple() {
	return range(0, tupleSize).map(() => [Math.random(), Math.random()])
}

const NUM_TUPLES = 10000

const seedReadRemoveWriteBench = transactionalReadWriteAsync()(async (tx) => {
	for (const i of range(0, NUM_TUPLES)) {
		tx.set(randomTuple(), null)
	}
})

const readRemoveWrite = transactionalReadWriteAsync()(async (tx) => {
	for (const i of range(0, readIters)) {
		const results = await tx.scan({ gt: randomTuple(), limit: 10 })
		for (const { key } of results) {
			tx.remove(key)
		}
	}
	for (const i of range(0, writeIters)) {
		tx.set(randomTuple(), null)
	}
})

const seedReadPerformanceBench = transactionalReadWriteAsync()(async (tx) => {
	// seed simple tuples
	for (const i of range(0, NUM_TUPLES)) {
		tx.set(["simpleTuple", ...randomTuple()], null)
	}
	// seed complex tuples
	for (const i of range(0, NUM_TUPLES)) {
		tx.set(["objectTuple", ...randomObjectTuple()], null)
	}

	// seed complex tuples
	for (const i of range(0, NUM_TUPLES)) {
		tx.set(["arrayTuple", ...randomArrayTuple()], null)
	}
})

const readSimpleTuples = transactionalReadWriteAsync()(async (tx) => {
	await tx.scan({ prefix: ["simpleTuple"], gte: [0], lt: [1] })
})

const readObjectTuples = transactionalReadWriteAsync()(async (tx) => {
	await tx.scan({
		prefix: ["objectTuple"],
		gte: [{ value: 0 }],
		lt: [{ value: 1 }],
	})
})

const readArrayTuples = transactionalReadWriteAsync()(async (tx) => {
	await tx.scan({
		prefix: ["arrayTuple"],
		gte: [[0, 0]],
		lt: [[1, 1]],
	})
})

async function timeIt(label: string, fn: () => Promise<void>) {
	const start = performance.now()
	await fn()
	const end = performance.now()
	console.log(label, end - start)
}

async function asyncReadRemoveWriteBenchmark(
	label: string,
	db: AsyncTupleDatabaseClientApi
) {
	await timeIt(label + ":seedReadRemoveWriteBench", () =>
		seedReadRemoveWriteBench(db)
	)

	await timeIt(label + ":readRemoveWrite", async () => {
		for (const i of range(0, iterations)) {
			await readRemoveWrite(db)
		}
	})
}

export function asyncWriteOnlyBenchmark(
	label: string,
	db: AsyncTupleDatabaseClientApi
) {
	return timeIt(label + ":writeOnly", async () => {
		const tx = db.transact()
		for (const i of range(0, iterations)) {
			tx.set(randomTuple(), null)
		}
		await tx.commit()
	})
}

async function asyncReadPerformanceBenchmark(
	label: string,
	db: AsyncTupleDatabaseClientApi
) {
	await timeIt(label + ":seedReadPerformanceBench", () =>
		seedReadPerformanceBench(db)
	)

	await timeIt(label + ":readSimpleTuples", async () => {
		for (const i of range(0, iterations)) {
			await readSimpleTuples(db)
		}
	})

	await timeIt(label + ":readObjectTuples", async () => {
		for (const i of range(0, iterations)) {
			await readObjectTuples(db)
		}
	})

	await timeIt(label + ":readArrayTuples", async () => {
		for (const i of range(0, iterations)) {
			await readArrayTuples(db)
		}
	})
}

const tmpDir = path.resolve(__dirname, "../../tmp")

async function main() {
	await fs.mkdirp(tmpDir)

	// Memory
	await asyncWriteOnlyBenchmark(
		"Memory",
		new AsyncTupleDatabaseClient(
			new AsyncTupleDatabase(new InMemoryTupleStorage())
		)
	)
	await asyncReadPerformanceBenchmark(
		"Memory",
		new AsyncTupleDatabaseClient(
			new AsyncTupleDatabase(new InMemoryTupleStorage())
		)
	)
	await asyncReadRemoveWriteBenchmark(
		"Memory",
		new AsyncTupleDatabaseClient(
			new AsyncTupleDatabase(new InMemoryTupleStorage())
		)
	)

	// Memory BTree
	await asyncWriteOnlyBenchmark(
		"Memory BTree",
		new AsyncTupleDatabaseClient(
			new AsyncTupleDatabase(new MemoryBTreeStorage())
		)
	)
	await asyncReadPerformanceBenchmark(
		"Memory BTree",
		new AsyncTupleDatabaseClient(
			new AsyncTupleDatabase(new MemoryBTreeStorage())
		)
	)
	await asyncReadRemoveWriteBenchmark(
		"Memory BTree",
		new AsyncTupleDatabaseClient(
			new AsyncTupleDatabase(new MemoryBTreeStorage())
		)
	)

	// LevelDB
	// await asyncWriteOnlyBenchmark(
	// 	"Level",
	// 	new AsyncTupleDatabaseClient(
	// 		new AsyncTupleDatabase(
	// 			new LevelTupleStorage(
	// 				new Level(path.join(tmpDir, "benchmark-level.db"))
	// 			)
	// 		)
	// 	)
	// )
	// await asyncReadPerformanceBenchmark(
	// 	"Level",
	// 	new AsyncTupleDatabaseClient(
	// 		new AsyncTupleDatabase(
	// 			new LevelTupleStorage(
	// 				new Level(path.join(tmpDir, "benchmark-level.db"))
	// 			)
	// 		)
	// 	)
	// )
	// await asyncReadRemoveWriteBenchmark(
	// 	"Level",
	// 	new AsyncTupleDatabaseClient(
	// 		new AsyncTupleDatabase(
	// 			new LevelTupleStorage(
	// 				new Level(path.join(tmpDir, "benchmark-level.db"))
	// 			)
	// 		)
	// 	)
	// )

	// Bun SQLITE
	// await asyncWriteOnlyBenchmark(
	// 	"bun-sqlite",
	// 	new AsyncTupleDatabaseClient(
	// 		new AsyncTupleDatabase(
	// 			new BunSQLiteTupleStorage(
	// 				new BunSqlite(path.join(tmpDir, "benchmark-sqlite.db"))
	// 			)
	// 		)
	// 	)
	// )
	// await asyncReadPerformanceBenchmark(
	// 	"bun-sqlite",
	// 	new AsyncTupleDatabaseClient(
	// 		new AsyncTupleDatabase(
	// 			new BunSQLiteTupleStorage(
	// 				new BunSqlite(path.join(tmpDir, "benchmark-sqlite.db"))
	// 			)
	// 		)
	// 	)
	// )
	// await asyncReadRemoveWriteBenchmark(
	// 	"bun-sqlite",
	// 	new AsyncTupleDatabaseClient(
	// 		new AsyncTupleDatabase(
	// 			new BunSQLiteTupleStorage(
	// 				new BunSqlite(path.join(tmpDir, "benchmark-sqlite.db"))
	// 			)
	// 		)
	// 	)
	// )

	// SQLite
	await asyncWriteOnlyBenchmark(
		"SQLite",
		new AsyncTupleDatabaseClient(
			new AsyncTupleDatabase(
				new SQLiteTupleStorage(sqlite(path.join(tmpDir, "benchmark-sqlite.db")))
			)
		)
	)
	await asyncReadPerformanceBenchmark(
		"SQLite",
		new AsyncTupleDatabaseClient(
			new AsyncTupleDatabase(
				new SQLiteTupleStorage(sqlite(path.join(tmpDir, "benchmark-sqlite.db")))
			)
		)
	)
	await asyncReadRemoveWriteBenchmark(
		"SQLite",
		new AsyncTupleDatabaseClient(
			new AsyncTupleDatabase(
				new SQLiteTupleStorage(sqlite(path.join(tmpDir, "benchmark-sqlite.db")))
			)
		)
	)

	// LMDB
	await asyncWriteOnlyBenchmark(
		"LMDB",
		new AsyncTupleDatabaseClient(
			new AsyncTupleDatabase(
				new LMDBTupleStorage((options) =>
					LMDB.open(path.join(tmpDir, "benchmark-lmdb-write.db"), {
						...options,
					})
				)
			)
		)
	)
	await asyncReadPerformanceBenchmark(
		"LMDB",
		new AsyncTupleDatabaseClient(
			new AsyncTupleDatabase(
				new LMDBTupleStorage((options) =>
					LMDB.open(path.join(tmpDir, "benchmark-lmdb.db"), { ...options })
				)
			)
		)
	)
	await asyncReadRemoveWriteBenchmark(
		"LMDB",
		new AsyncTupleDatabaseClient(
			new AsyncTupleDatabase(
				new LMDBTupleStorage((options) =>
					LMDB.open(path.join(tmpDir, "benchmark-lmdb.db"), { ...options })
				)
			)
		)
	)
}

main()
