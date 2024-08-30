import { describe, it, expect } from "bun:test"
import { mutableFilter } from "./mutableFilter.js"

describe("mutableFilter", () => {
	it("works", () => {
		const immutable = [1, 2, 3, 4, 5]
		const mutable = [1, 2, 3, 4, 5]

		const fn = (n: number) => n % 2 === 0

		const immutableResult = immutable.filter(fn)
		mutableFilter(mutable, fn)

		expect(immutableResult).toEqual(mutable)
	})
})
