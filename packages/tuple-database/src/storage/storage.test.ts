// import sqlite from "better-sqlite3"
import { Level } from "level"
import * as path from "path"
import { asyncDatabaseTestSuite } from "../database/async/asyncDatabaseTestSuite.js"
import { AsyncTupleDatabaseClient } from "../database/async/AsyncTupleDatabaseClient.js"
import { databaseTestSuite } from "../database/sync/databaseTestSuite.js"
import { TupleDatabase } from "../database/sync/TupleDatabase.js"
import { AsyncTupleDatabase, TupleDatabaseClient } from "../main.js"
import { FileTupleStorage } from "./FileTupleStorage.js"
import { IndexedDbTupleStorage } from "./IndexedDbTupleStorage.js"
import { InMemoryTupleStorage } from "./InMemoryTupleStorage.js"
import { LevelTupleStorage } from "./LevelTupleStorage.js"
import { CachedIndexedDbStorage } from "./IndexedDbWithMemoryCacheTupleStorage.js"
import { MemoryBTreeStorage } from "./MemoryBTreeTupleStorage.js"
import { LMDBTupleStorage } from "./LMDBTupleStorage.js"
import * as LMDB from "lmdb"
import { SQLiteTupleStorage } from "./SQLiteTupleStorage.js"
import sqlite from "better-sqlite3"

const tmpDir = path.resolve(__dirname, "./../../tmp")

// databaseTestSuite(
// 	"TupleDatabaseClient(TupleDatabase(InMemoryTupleStorage))",
// 	() => new TupleDatabaseClient(new TupleDatabase(new InMemoryTupleStorage())),
// 	false
// )

// databaseTestSuite(
// 	"TupleDatabaseClient(TupleDatabase(FileTupleStorage))",
// 	(id) =>
// 		new TupleDatabaseClient(
// 			new TupleDatabase(new FileTupleStorage(path.join(tmpDir, id)))
// 		)
// )

// databaseTestSuite(
// 	"TupleDatabaseClient(TupleDatabase(SQLiteTupleStorage))",
// 	(id) =>
// 		new TupleDatabaseClient(
// 			new TupleDatabase(new SQLiteTupleStorage(sqlite(":memory:")))
// 		)
// )

asyncDatabaseTestSuite(
	"AsyncTupleDatabaseClient(TupleDatabase(LMDBTupleStorage))",
	(id) => {
		return new AsyncTupleDatabaseClient(
			new AsyncTupleDatabase(
				new LMDBTupleStorage((options) =>
					LMDB.open(path.join(tmpDir, `test-${id}.lmdb`), {
						...options,
						// sharedStructuresKey: Symbol.for("structures"),
						// keyEncoding: "ordered-binary",
						// dupSort: true,
						// strictAsyncOrder: true,
					})
				)
			)
		)
	},

	true
)

asyncDatabaseTestSuite(
	"AsyncTupleDatabaseClient(TupleDatabase(InMemoryTupleStorage))",
	() =>
		new AsyncTupleDatabaseClient(new TupleDatabase(new InMemoryTupleStorage())),
	false
)

asyncDatabaseTestSuite(
	"AsyncTupleDatabaseClient(AsyncTupleDatabase(InMemoryTupleStorage))",
	() =>
		new AsyncTupleDatabaseClient(
			new AsyncTupleDatabase(new InMemoryTupleStorage())
		),
	false
)

asyncDatabaseTestSuite(
	"AsyncTupleDatabaseClient(AsyncTupleDatabase(MemoryBTreeTupleStorage))",
	() =>
		new AsyncTupleDatabaseClient(
			new AsyncTupleDatabase(new MemoryBTreeStorage())
		),
	false
)

asyncDatabaseTestSuite(
	"AsyncTupleDatabaseClient(AsyncTupleDatabase(LevelTupleStorage))",
	(id) =>
		new AsyncTupleDatabaseClient(
			new AsyncTupleDatabase(
				new LevelTupleStorage(new Level(path.join(tmpDir, id + ".db")))
			)
		),
	true
)

require("fake-indexeddb/auto")
asyncDatabaseTestSuite(
	"AsyncTupleDatabaseClient(AsyncTupleDatabase(IndexedDbTupleStorage))",
	(id) =>
		new AsyncTupleDatabaseClient(
			new AsyncTupleDatabase(new IndexedDbTupleStorage(id))
		),
	true
)
asyncDatabaseTestSuite(
	"AsyncTupleDatabaseClient(AsyncTupleDatabase(CachedIndexedDbTupleStorage))",
	(id) =>
		new AsyncTupleDatabaseClient(
			new AsyncTupleDatabase(new CachedIndexedDbStorage(id))
		),
	true
)

// Test that the entire test suite works within a subspace.
asyncDatabaseTestSuite(
	"Subspace: AsyncTupleDatabaseClient(AsyncTupleDatabase(InMemoryTupleStorage))",
	() => {
		const store = new AsyncTupleDatabaseClient(
			new AsyncTupleDatabase(new InMemoryTupleStorage())
		)
		return store.subspace(["myApp"]) as any
	},
	false
)

databaseTestSuite(
	"Subspace: TupleDatabaseClient(TupleDatabase(InMemoryTupleStorage))",
	() => {
		const store = new TupleDatabaseClient(
			new TupleDatabase(new InMemoryTupleStorage())
		)
		return store.subspace(["myApp"]) as any
	},
	false
)
