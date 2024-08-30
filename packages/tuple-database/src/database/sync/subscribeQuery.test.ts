import { describe, it, expect } from "bun:test"
import { InMemoryTupleStorage } from "../../main.js"
import { subscribeQuery } from "./subscribeQuery.js"
import { TupleDatabase } from "./TupleDatabase.js"
import { TupleDatabaseClient } from "./TupleDatabaseClient.js"

describe("subscribeQuery", () => {
	it("works", async () => {
		const db = new TupleDatabaseClient(
			new TupleDatabase(new InMemoryTupleStorage())
		)

		function setA(a: number) {
			const tx = db.transact()
			tx.set(["a"], a)
			tx.commit()
		}

		setA(0)

		let aResult: number | undefined = undefined

		const { result, destroy } = subscribeQuery(
			db,
			(db) => db.get(["a"]),
			(result: number) => {
				aResult = result
			}
		)

		expect(aResult).toEqual(undefined)
		expect(result).toEqual(0)

		setA(1)

		expect(aResult as unknown).toEqual(1)

		destroy()
	})

	it("doesn't run second callback if it is destroyed in first", async () => {
		type Schema =
			| {
					key: ["filesById", number]
					value: string
			  }
			| {
					key: ["focusedFileId"]
					value: number
			  }

		const db = new TupleDatabaseClient<Schema>(
			new TupleDatabase(new InMemoryTupleStorage())
		)

		const initTx = db.transact()
		initTx.set(["filesById", 1], "file 1 value")
		initTx.set(["focusedFileId"], 1)
		initTx.commit()

		let focusedFile: number | undefined = undefined
		let focusedFileValue: string | undefined = undefined
		let subscription:
			| { result: string | undefined; destroy: () => void }
			| undefined = undefined

		function subscribeToFocusedFile(focusedFile: number) {
			subscription = subscribeQuery(
				db,
				(db) => db.get(["filesById", focusedFile]),
				(value) => {
					focusedFileValue = value
				}
			)

			focusedFileValue = subscription.result
		}

		const focusedFileQuery = subscribeQuery(
			db,
			(db) => db.get(["focusedFileId"])!,
			(result) => {
				focusedFile = result
				subscription?.destroy()
				subscribeToFocusedFile(focusedFile)
			}
		)

		focusedFile = focusedFileQuery.result
		subscribeToFocusedFile(focusedFile)

		expect(focusedFile).toEqual(1)
		expect(focusedFileValue as unknown).toEqual("file 1 value")

		const tx = db.transact()
		tx.remove(["filesById", 1])
		tx.set(["filesById", 2], "file 2 value")
		tx.set(["focusedFileId"], 2)
		tx.commit()

		expect(focusedFile).toEqual(2)
		expect(focusedFileValue as unknown).toEqual("file 2 value")
	})
})
