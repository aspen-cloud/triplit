import { describe, it, expect } from "bun:test"
import { invertString } from "./invertString.js"

describe("invertString", () => {
	const data = [
		"aaa",
		"aab",
		"aac",
		"aba",
		"abc",
		"aca",
		"acc",
		"bbb",
		"bca",
		"bcb",
		"caa",
		"cab",
		"ccc",
	]

	it("can encode and decode properly", () => {
		for (const str of data) {
			expect(invertString(invertString(str))).toStrictEqual(str)
		}
	})

	it("inversion is reverse sorted", () => {
		const sorted = [...data].sort()
		expect(sorted).toStrictEqual(data)

		const inverseSorted = sorted.map(invertString).sort().map(invertString)
		expect(inverseSorted).toStrictEqual(sorted.reverse())
	})
})
