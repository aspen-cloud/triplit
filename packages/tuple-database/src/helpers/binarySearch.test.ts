/*

	Binary Search Tests.
	./node_modules/.bin/mocha -r ts-node/register ./src/helpers/binarySearch.test.ts

*/

import { describe, it, expect } from "bun:test"
import { binarySearch, binarySearchAssociativeList } from "./binarySearch"
import { compare } from "./compare"

describe("binarySearch", () => {
	const list = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
	it("find before", () => {
		const result = binarySearch(list, -1, compare)
		expect(result.found).toBeUndefined()
		expect(result.closest).toEqual(0)
	})
	it("find after", () => {
		const result = binarySearch(list, 10, compare)
		expect(result.found).toBeUndefined()
		expect(result.closest).toEqual(10)
	})
	it("find middle", () => {
		const result = binarySearch(list, 1.5, compare)
		expect(result.found).toBeUndefined()
		expect(result.closest).toEqual(2)
	})
	it("find exact", () => {
		const result = binarySearch(list, 5, compare)
		expect(result.found).toEqual(5)
		expect(result.closest).toBeUndefined()
	})
})

describe("binarySearchAssociativeList", () => {
	// An associative array.
	const list = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(
		(n) => [n, {}] as [number, any]
	)
	it("find before", () => {
		const result = binarySearchAssociativeList(list, -1, compare)
		expect(result.found).toBeUndefined()
		expect(result.closest).toEqual(0)
	})
	it("find after", () => {
		const result = binarySearchAssociativeList(list, 10, compare)
		expect(result.found).toBeUndefined()
		expect(result.closest).toEqual(10)
	})
	it("find middle", () => {
		const result = binarySearchAssociativeList(list, 1.5, compare)
		expect(result.found).toBeUndefined()
		expect(result.closest).toEqual(2)
	})
	it("find exact", () => {
		const result = binarySearchAssociativeList(list, 5, compare)
		expect(result.found).toEqual(5)
		expect(result.closest).toBeUndefined()
	})
})
