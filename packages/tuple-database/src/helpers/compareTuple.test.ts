import { shuffle } from "remeda"
import { describe, it, expect } from "bun:test"
import { Tuple } from "../storage/types"
import { sortedValues } from "../test/fixtures"
import {
	compareTuple,
	compareValue,
	TupleToString,
	ValueToString,
} from "./compareTuple"
import { randomInt } from "./random"

describe("compareValue", () => {
	it("sorting is correct", () => {
		for (let i = 0; i < sortedValues.length; i++) {
			for (let j = 0; j < sortedValues.length; j++) {
				expect(compareValue(sortedValues[i], sortedValues[j])).toBe(
					compareValue(i, j)
				)
			}
		}
	})

	it("sorts class objects properly", () => {
		class A {}

		const values = shuffle([
			{ a: 1 },
			{ a: 2 },
			{ b: -1 },
			new A(),
			new A(),
		]).sort(compareValue)

		expect(values[0]).toEqual({ a: 1 })
		expect(values[1]).toEqual({ a: 2 })
		expect(values[2]).toEqual({ b: -1 })
		expect(values[3] instanceof A).toBeTruthy()
		expect(values[4] instanceof A).toBeTruthy()
	})

	it("Compares object equality", () => {
		class A {}
		const a = new A()
		expect(compareValue(a, a)).toBe(0)
	})
})

describe("compareTuple", () => {
	it("Sorting works for pairs in-order.", () => {
		const test = (a: Tuple, b: Tuple, value: number) => {
			expect(compareTuple(a, b)).toBe(value)
		}

		// Ensure it works for all pairwise tuples.
		for (let i = 0; i < sortedValues.length - 1; i++) {
			const a = sortedValues[i]
			const b = sortedValues[i + 1]
			test([a, a], [a, b], -1)
			test([a, b], [b, a], -1)
			test([b, a], [b, b], -1)
			test([a, a], [a, a], 0)
			test([b, b], [b, b], 0)
		}
	})

	it("Sorting does a true deep-compare", () => {
		const test = (a: Tuple, b: Tuple, value: number) => {
			expect(compareTuple(a, b)).toBe(value)
		}

		test(["a", { a: { b: "c" } }], ["a", { a: { b: "c" } }], 0)
	})

	it("3-length tuple sorting is correct (sampled)", () => {
		const sample = () => {
			const x = sortedValues.length
			const i = randomInt(x - 1)
			const j = randomInt(x - 1)
			const k = randomInt(x - 1)
			const tuple: Tuple = [sortedValues[i], sortedValues[j], sortedValues[k]]
			const rank = i * x * x + j * x + k
			return { tuple, rank }
		}

		// (40*40*40)^2 = 4 billion variations for these sorted 3-length tuples.
		for (let iter = 0; iter < 100_000; iter++) {
			const a = sample()
			const b = sample()
			expect(compareTuple(a.tuple, b.tuple)).toBe(compareValue(a.rank, b.rank))
		}
	})
})
