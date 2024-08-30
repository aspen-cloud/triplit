import { describe, it, expect } from "bun:test"
import { Assert } from "../database/typeHelpers.js"
import { namedTupleToObject } from "./namedTupleToObject.js"

describe("namedTupleToObject", () => {
	it("works", () => {
		const tuple = ["hello", { a: 1 }, { b: ["c"] }] as [
			"hello",
			{ a: 1 },
			{ b: string[] }
		]
		const obj = namedTupleToObject(tuple)
		type X = Assert<typeof obj, { a: 1; b: string[] }>
		expect(obj).toEqual({ a: 1, b: ["c"] })
	})
})
