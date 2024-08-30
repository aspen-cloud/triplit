import { describe, it, expect } from "bun:test"
import { InMemoryTupleStorage } from "../../main.js"
import { TupleDatabase } from "./TupleDatabase.js"
import { TupleDatabaseClient } from "./TupleDatabaseClient.js"

type TestSchema =
	| {
			key: [0]
			value: true
	  }
	| {
			key: [1, string]
			value: true
	  }

describe("Type tests", () => {
	const db = new TupleDatabaseClient<TestSchema>(
		new TupleDatabase(new InMemoryTupleStorage())
	)

	it("Root transaction `set` correctly types values", () => {
		const tx = db.transact()

		// @ts-expect-error
		tx.set([0], false)

		tx.set([0], true)

		tx.cancel()
	})

	it("Subspace transaction `set` correctly types values", () => {
		const tx = db.subspace([1]).transact()

		// @ts-expect-error
		tx.set(["hello"], false)

		tx.set(["hello"], true)

		tx.cancel()
	})
})
