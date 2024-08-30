import { describe, it, expect } from "bun:test"
import { MaxTuple } from "./sortedTupleArray.js"
import {
	normalizeSubspaceScanArgs,
	prependPrefixToWriteOps,
	removePrefixFromWriteOps,
} from "./subspaceHelpers.js"

describe("subspaceHelpers", () => {
	describe("prependPrefixToWrites", () => {
		it("works", () => {
			expect(
				prependPrefixToWriteOps(["x"], {
					set: [
						{ key: ["a"], value: 1 },
						{ key: ["b"], value: 2 },
					],
					remove: [["c"]],
				})
			).toEqual({
				set: [
					{ key: ["x", "a"], value: 1 },
					{ key: ["x", "b"], value: 2 },
				],
				remove: [["x", "c"]],
			})
		})
	})

	describe("removePrefixFromWrites", () => {
		it("works", () => {
			expect(
				removePrefixFromWriteOps(["x"], {
					set: [
						{ key: ["x", "a"], value: 1 },
						{ key: ["x", "b"], value: 2 },
					],
					remove: [["x", "c"]],
				})
			).toEqual({
				set: [
					{ key: ["a"], value: 1 },
					{ key: ["b"], value: 2 },
				],
				remove: [["c"]],
			})
		})
		it("throws if its the wrong prefix", () => {
			expect(() => {
				removePrefixFromWriteOps(["y"], {
					set: [
						{ key: ["x", "a"], value: 1 },
						{ key: ["x", "b"], value: 2 },
					],
					remove: [["x", "c"]],
				})
			}).toThrow()
		})
	})

	describe("normalizeSubspaceScanArgs", () => {
		it("works", () => {
			expect(normalizeSubspaceScanArgs([1], { prefix: [2], gt: [3] })).toEqual({
				gt: [1, 2, 3],
				lte: [1, 2, ...MaxTuple],
			})
		})
	})
})
