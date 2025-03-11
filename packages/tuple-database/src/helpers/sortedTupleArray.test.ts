import { shuffle } from "../helpers/remeda.js"
import { describe, it, expect } from "bun:test"
import { MAX, MIN, Tuple } from "../storage/types.js"
import {
	getPrefixContainingBounds,
	isTupleWithinBounds,
	MaxTuple,
	normalizeTupleBounds,
	scan,
	set,
} from "./sortedTupleArray.js"

describe("sortedTupleArray", () => {
	describe("prefix basics", () => {
		const items: Tuple[] = [
			[],
			["a"],
			["a", "a"],
			["a", "b"],
			["b"],
			["b", "a"],
			["b", "b"],
		]

		it("sorts prefixes in the correct order", () => {
			const data: Tuple[] = []
			for (const item of shuffle(items)) {
				set(data, item)
			}
			expect(data).toEqual(items)
		})

		it("prefix", () => {
			const result = scan(items, { prefix: ["a"] })
			expect(result).toEqual([["a"], ["a", "a"], ["a", "b"]])
		})

		it("prefix limit", () => {
			const result = scan(items, { prefix: ["a"], limit: 2 })
			expect(result).toEqual([["a"], ["a", "a"]])
		})

		it("prefix limit truncated", () => {
			const result = scan(items, { prefix: ["a"], limit: 10 })
			expect(result).toEqual([["a"], ["a", "a"], ["a", "b"]])
		})

		it("prefix reverse", () => {
			const result = scan(items, { prefix: ["a"], reverse: true })
			expect(result).toEqual([["a", "b"], ["a", "a"], ["a"]])
		})

		it("prefix reverse limit", () => {
			const result = scan(items, { prefix: ["a"], limit: 2, reverse: true })
			expect(result).toEqual([
				["a", "b"],
				["a", "a"],
			])
		})

		it("prefix reverse limit truncated", () => {
			const result = scan(items, { prefix: ["a"], limit: 10, reverse: true })
			expect(result).toEqual([["a", "b"], ["a", "a"], ["a"]])
		})
	})

	describe("prefix composition", () => {
		const items: Tuple[] = [
			["a", "a", "a"],
			["a", "a", "b"],
			["a", "a", "c"],
			["a", "b", "a"],
			["a", "b", "b"],
			["a", "b", "c"],
			["a", "c", "a"],
			["a", "c", "b"],
			["a", "c", "c"],
			["b", "a", "a"],
			["b", "a", "b"],
			["b", "a", "c"],
			["b", "b", "a"],
			["b", "b", "b"],
			["b", "b", "c"],
			["b", "c", "a"],
			["b", "c", "b"],
			["b", "c", "c"],
		]

		it("prefix gt", () => {
			const result = scan(items, { prefix: ["a"], gt: ["a", MAX] })
			expect(result).toEqual([
				["a", "b", "a"],
				["a", "b", "b"],
				["a", "b", "c"],
				["a", "c", "a"],
				["a", "c", "b"],
				["a", "c", "c"],
			])
		})

		it("prefix gt reverse", () => {
			const result = scan(items, {
				prefix: ["a"],
				gt: ["a", MAX],
				reverse: true,
			})
			expect(result).toEqual(
				[
					["a", "b", "a"],
					["a", "b", "b"],
					["a", "b", "c"],
					["a", "c", "a"],
					["a", "c", "b"],
					["a", "c", "c"],
				].reverse()
			)
		})

		it("prefix lt", () => {
			const result = scan(items, { prefix: ["a"], lt: ["b"] })
			expect(result).toEqual([
				["a", "a", "a"],
				["a", "a", "b"],
				["a", "a", "c"],
			])
		})

		it("prefix lt reverse", () => {
			const result = scan(items, { prefix: ["a"], lt: ["b"], reverse: true })
			expect(result).toEqual(
				[
					["a", "a", "a"],
					["a", "a", "b"],
					["a", "a", "c"],
				].reverse()
			)
		})

		it("prefix gt/lt", () => {
			const result = scan(items, { prefix: ["a"], gt: ["a", MAX], lt: ["c"] })
			expect(result).toEqual([
				["a", "b", "a"],
				["a", "b", "b"],
				["a", "b", "c"],
			])
		})

		it("prefix gt/lt reverse", () => {
			const result = scan(items, {
				prefix: ["a"],
				gt: ["a", MAX],
				lt: ["c"],
				reverse: true,
			})
			expect(result).toEqual(
				[
					["a", "b", "a"],
					["a", "b", "b"],
					["a", "b", "c"],
				].reverse()
			)
		})

		it("prefix gte", () => {
			const result = scan(items, { prefix: ["a"], gte: ["b"] })
			expect(result).toEqual([
				["a", "b", "a"],
				["a", "b", "b"],
				["a", "b", "c"],
				["a", "c", "a"],
				["a", "c", "b"],
				["a", "c", "c"],
			])
		})

		it("prefix gte reverse", () => {
			const result = scan(items, { prefix: ["a"], gte: ["b"], reverse: true })
			expect(result).toEqual(
				[
					["a", "b", "a"],
					["a", "b", "b"],
					["a", "b", "c"],
					["a", "c", "a"],
					["a", "c", "b"],
					["a", "c", "c"],
				].reverse()
			)
		})

		it("prefix lte", () => {
			const result = scan(items, { prefix: ["a"], lte: ["a", MAX] })
			expect(result).toEqual([
				["a", "a", "a"],
				["a", "a", "b"],
				["a", "a", "c"],
			])
		})

		it("prefix lte reverse", () => {
			const result = scan(items, {
				prefix: ["a"],
				lte: ["a", MAX],
				reverse: true,
			})
			expect(result).toEqual(
				[
					["a", "a", "a"],
					["a", "a", "b"],
					["a", "a", "c"],
				].reverse()
			)
		})

		it("prefix gte/lte", () => {
			const result = scan(items, { prefix: ["a"], gte: ["b"], lte: ["c", MAX] })
			expect(result).toEqual([
				["a", "b", "a"],
				["a", "b", "b"],
				["a", "b", "c"],
				["a", "c", "a"],
				["a", "c", "b"],
				["a", "c", "c"],
			])
		})

		it("prefix gte/lte reverse", () => {
			const result = scan(items, {
				prefix: ["a"],
				gte: ["b"],
				lte: ["c", MAX],
				reverse: true,
			})
			expect(result).toEqual(
				[
					["a", "b", "a"],
					["a", "b", "b"],
					["a", "b", "c"],
					["a", "c", "a"],
					["a", "c", "b"],
					["a", "c", "c"],
				].reverse()
			)
		})
	})

	describe("bounds", () => {
		const items: Tuple[] = [
			[],
			["a"],
			["a", "a"],
			["a", "b"],
			["a", "c"],
			["b"],
			["b", "a"],
			["b", "b"],
			["b", "c"],
		]

		it("prefix gt MIN", () => {
			const result = scan(items, { prefix: ["a"], gt: [MIN] })
			expect(result).toEqual([
				["a", "a"],
				["a", "b"],
				["a", "c"],
			])
		})

		it("prefix gt MIN reverse", () => {
			const result = scan(items, { prefix: ["a"], gt: [MIN], reverse: true })
			expect(result).toEqual([
				["a", "c"],
				["a", "b"],
				["a", "a"],
			])
		})

		it("prefix gt", () => {
			const result = scan(items, { prefix: ["a"], gt: ["a"] })
			expect(result).toEqual([
				["a", "b"],
				["a", "c"],
			])
		})

		it("prefix gt reverse", () => {
			const result = scan(items, { prefix: ["a"], gt: ["a"], reverse: true })
			expect(result).toEqual([
				["a", "c"],
				["a", "b"],
			])
		})

		it("prefix lt MAX", () => {
			const result = scan(items, { prefix: ["a"], lt: [MAX] })
			expect(result).toEqual([["a"], ["a", "a"], ["a", "b"], ["a", "c"]])
		})

		it("prefix lt MAX reverse", () => {
			const result = scan(items, { prefix: ["a"], lt: [MAX], reverse: true })
			expect(result).toEqual([["a", "c"], ["a", "b"], ["a", "a"], ["a"]])
		})

		it("prefix lt", () => {
			const result = scan(items, { prefix: ["a"], lt: ["c"] })
			expect(result).toEqual([["a"], ["a", "a"], ["a", "b"]])
		})

		it("prefix lt reverse", () => {
			const result = scan(items, { prefix: ["a"], lt: ["c"], reverse: true })
			expect(result).toEqual([["a", "b"], ["a", "a"], ["a"]])
		})
	})

	describe("normalizeTupleBounds", () => {
		it("normalized prefix", () => {
			expect(normalizeTupleBounds({ prefix: ["a"] })).toEqual({
				gte: ["a"], // NOTE: this is not ["a", MIN]
				lte: ["a", ...MaxTuple],
			})
		})

		it("prepends prefix to constraints", () => {
			expect(normalizeTupleBounds({ prefix: ["a"], gte: ["b"] })).toEqual({
				gte: ["a", "b"],
				lte: ["a", ...MaxTuple],
			})
		})
	})

	describe("prefixTupleBounds", () => {
		it("Computes trivial bounds prefix", () => {
			expect(
				getPrefixContainingBounds({ gte: ["a", 1], lte: ["a", 10] })
			).toEqual(["a"])
		})

		it("Handles entirely disjoint tuples", () => {
			expect(
				getPrefixContainingBounds({ gte: ["a", 1], lte: ["b", 10] })
			).toEqual([])
		})
	})

	describe("isTupleWithinBounds", () => {
		it("Works for exact equality range", () => {
			expect(isTupleWithinBounds(["a"], { gte: ["a"], lte: ["a"] })).toEqual(
				true
			)
			expect(isTupleWithinBounds(["a", 1], { gte: ["a"], lte: ["a"] })).toEqual(
				false
			)
		})

		it("Works for non-trivial range", () => {
			expect(isTupleWithinBounds(["a"], { gt: ["a"], lte: ["b"] })).toEqual(
				false
			)
			expect(isTupleWithinBounds(["a", 1], { gt: ["a"], lte: ["b"] })).toEqual(
				true
			)
			expect(isTupleWithinBounds(["b"], { gt: ["a"], lte: ["b"] })).toEqual(
				true
			)
			expect(isTupleWithinBounds(["b", 1], { gt: ["a"], lte: ["b"] })).toEqual(
				false
			)
		})
	})
})
