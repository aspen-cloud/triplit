import { describe, it, expect } from "bun:test"
import { normalizeTupleBounds } from "../helpers/sortedTupleArray.js"
import { Tuple } from "../storage/types.js"
import { ConcurrencyLog } from "./ConcurrencyLog.js"

function bounds(prefix: Tuple) {
	return normalizeTupleBounds({ prefix })
}

describe("ConcurrencyLog", () => {
	it("Only records writes with conflicting reads.", () => {
		const log = new ConcurrencyLog()

		log.write("tx1", [1])
		expect(log.log).toEqual([])

		log.read("tx2", bounds([2]))

		log.write("tx3", [2])
		log.write("tx3", [3])

		expect(log.log).toEqual([
			{ type: "read", txId: "tx2", bounds: bounds([2]) },
			{ type: "write", txId: "tx3", tuple: [2] },
		])

		expect(() => log.commit("tx2")).toThrow()
		expect(log.log).toEqual([])
	})

	it.todo("Keeps writes that conflict with reads of other transactions.")

	it.todo("Can cancel a transaction to clean up the log.")
})
