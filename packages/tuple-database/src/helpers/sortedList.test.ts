import { shuffle } from "../helpers/remeda.js"
import { describe, it, expect } from "bun:test"
import { compare } from "./compare.js"
import { remove, scan, set } from "./sortedList.js"

describe("sortedList", () => {
	it("inserts in correct order", () => {
		for (let i = 0; i < 10; i++) {
			const items = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
			const list: number[] = []
			for (const item of shuffle(items)) {
				set(list, item, compare)
			}
			expect(list).toEqual(items)
		}
	})

	it("removes items correctly", () => {
		const list = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

		remove(list, 2, compare)
		remove(list, 4, compare)
		remove(list, 4, compare)
		set(list, 4, compare)
		remove(list, 5, compare)
		remove(list, 5, compare)
		remove(list, 15, compare)

		expect(list).toEqual([0, 1, 3, 4, 6, 7, 8, 9])
	})

	describe("no bounds", () => {
		it("scan", () => {
			const list = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
			const result = scan(list, {}, compare)
			expect(result).toEqual(list)
		})

		it("scan limit", () => {
			const list = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
			const result = scan(list, { limit: 2 }, compare)
			expect(result).toEqual(list.slice(0, 2))
		})

		it("scan limit truncated", () => {
			const list = [0, 1, 2, 3, 4]
			const result = scan(list, { limit: 10 }, compare)
			expect(result).toEqual(list)
		})

		it("scan reverse", () => {
			const list = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
			const result = scan(list, { reverse: true }, compare)
			expect(result).toEqual([...list].reverse())
		})

		it("scan reverse limit", () => {
			const list = [0, 1, 2, 3, 4]
			const result = scan(list, { reverse: true, limit: 3 }, compare)
			expect(result).toEqual([4, 3, 2])
		})

		it("scan reverse limit truncated", () => {
			const list = [0, 1, 2, 3, 4]
			const result = scan(list, { reverse: true, limit: 10 }, compare)
			expect(result).toEqual([4, 3, 2, 1, 0])
		})
	})

	describe("gt", () => {
		it("scan gt", () => {
			const list = [0, 1, 2, 3, 4]
			const result = scan(list, { gt: 1 }, compare)
			expect(result).toEqual([2, 3, 4])
		})

		it("scan gt limit", () => {
			const list = [0, 1, 2, 3, 4]
			const result = scan(list, { gt: 1, limit: 2 }, compare)
			expect(result).toEqual([2, 3])
		})

		it("scan gt limit truncated", () => {
			const list = [0, 1, 2, 3, 4]
			const result = scan(list, { gt: 1, limit: 10 }, compare)
			expect(result).toEqual([2, 3, 4])
		})

		it("scan gt reverse", () => {
			const list = [0, 1, 2, 3, 4]
			const result = scan(list, { gt: 1, reverse: true }, compare)
			expect(result).toEqual([4, 3, 2])
		})

		it("scan gt reverse limit", () => {
			const list = [0, 1, 2, 3, 4]
			const result = scan(list, { gt: 1, limit: 2, reverse: true }, compare)
			expect(result).toEqual([4, 3])
		})

		it("scan gt reverse limit truncated", () => {
			const list = [0, 1, 2, 3, 4]
			const result = scan(list, { gt: 1, limit: 10, reverse: true }, compare)
			expect(result).toEqual([4, 3, 2])
		})
	})

	describe("lt", () => {
		it("scan lt", () => {
			const list = [0, 1, 2, 3, 4]
			const result = scan(list, { lt: 3 }, compare)
			expect(result).toEqual([0, 1, 2])
		})

		it("scan lt limit", () => {
			const list = [0, 1, 2, 3, 4]
			const result = scan(list, { lt: 3, limit: 2 }, compare)
			expect(result).toEqual([0, 1])
		})

		it("scan lt limit truncated", () => {
			const list = [0, 1, 2, 3, 4]
			const result = scan(list, { lt: 3, limit: 10 }, compare)
			expect(result).toEqual([0, 1, 2])
		})

		it("scan lt reverse", () => {
			const list = [0, 1, 2, 3, 4]
			const result = scan(list, { lt: 3, reverse: true }, compare)
			expect(result).toEqual([2, 1, 0])
		})

		it("scan lt reverse limit", () => {
			const list = [0, 1, 2, 3, 4]
			const result = scan(list, { lt: 3, limit: 2, reverse: true }, compare)
			expect(result).toEqual([2, 1])
		})

		it("scan lt reverse limit truncated", () => {
			const list = [0, 1, 2, 3, 4]
			const result = scan(list, { lt: 3, limit: 10, reverse: true }, compare)
			expect(result).toEqual([2, 1, 0])
		})
	})

	describe("gte", () => {
		it("scan gte", () => {
			const list = [0, 1, 2, 3, 4]
			const result = scan(list, { gte: 2 }, compare)
			expect(result).toEqual([2, 3, 4])
		})

		it("scan gte limit", () => {
			const list = [0, 1, 2, 3, 4]
			const result = scan(list, { gte: 2, limit: 2 }, compare)
			expect(result).toEqual([2, 3])
		})

		it("scan gte limit truncated", () => {
			const list = [0, 1, 2, 3, 4]
			const result = scan(list, { gte: 2, limit: 10 }, compare)
			expect(result).toEqual([2, 3, 4])
		})

		it("scan gte reverse", () => {
			const list = [0, 1, 2, 3, 4]
			const result = scan(list, { gte: 2, reverse: true }, compare)
			expect(result).toEqual([4, 3, 2])
		})

		it("scan gte reverse limit", () => {
			const list = [0, 1, 2, 3, 4]
			const result = scan(list, { gte: 2, limit: 2, reverse: true }, compare)
			expect(result).toEqual([4, 3])
		})

		it("scan gte reverse limit truncated", () => {
			const list = [0, 1, 2, 3, 4]
			const result = scan(list, { gte: 2, limit: 10, reverse: true }, compare)
			expect(result).toEqual([4, 3, 2])
		})
	})

	describe("lte", () => {
		it("scan lte", () => {
			const list = [0, 1, 2, 3, 4]
			const result = scan(list, { lte: 2 }, compare)
			expect(result).toEqual([0, 1, 2])
		})

		it("scan lte limit", () => {
			const list = [0, 1, 2, 3, 4]
			const result = scan(list, { lte: 2, limit: 2 }, compare)
			expect(result).toEqual([0, 1])
		})

		it("scan lte limit truncated", () => {
			const list = [0, 1, 2, 3, 4]
			const result = scan(list, { lte: 2, limit: 10 }, compare)
			expect(result).toEqual([0, 1, 2])
		})

		it("scan lte reverse", () => {
			const list = [0, 1, 2, 3, 4]
			const result = scan(list, { lte: 2, reverse: true }, compare)
			expect(result).toEqual([2, 1, 0])
		})

		it("scan lte reverse limit", () => {
			const list = [0, 1, 2, 3, 4]
			const result = scan(list, { lte: 2, limit: 2, reverse: true }, compare)
			expect(result).toEqual([2, 1])
		})

		it("scan lte reverse limit truncated", () => {
			const list = [0, 1, 2, 3, 4]
			const result = scan(list, { lte: 2, limit: 10, reverse: true }, compare)
			expect(result).toEqual([2, 1, 0])
		})
	})

	describe("gt/lt", () => {
		it("scan gt/lt", () => {
			const list = [0, 1, 2, 3, 4, 5, 6, 7, 8]
			const result = scan(list, { gt: 2, lt: 6 }, compare)
			expect(result).toEqual([3, 4, 5])
		})

		it("scan gt/lt limit", () => {
			const list = [0, 1, 2, 3, 4, 5, 6, 7, 8]
			const result = scan(list, { gt: 2, lt: 6, limit: 2 }, compare)
			expect(result).toEqual([3, 4])
		})

		it("scan gt/lt truncated", () => {
			const list = [0, 1, 2, 3, 4, 5, 6, 7, 8]
			const result = scan(list, { gt: 2, lt: 6, limit: 10 }, compare)
			expect(result).toEqual([3, 4, 5])
		})

		it("scan gt/lt reverse", () => {
			const list = [0, 1, 2, 3, 4, 5, 6, 7, 8]
			const result = scan(list, { gt: 2, lt: 6, reverse: true }, compare)
			expect(result).toEqual([5, 4, 3])
		})

		it("scan gt/lt reverse limit", () => {
			const list = [0, 1, 2, 3, 4, 5, 6, 7, 8]
			const result = scan(
				list,
				{ gt: 2, lt: 6, limit: 2, reverse: true },
				compare
			)
			expect(result).toEqual([5, 4])
		})

		it("scan gt/lt reverse limit truncated", () => {
			const list = [0, 1, 2, 3, 4, 5, 6, 7, 8]
			const result = scan(
				list,
				{ gt: 2, lt: 6, limit: 10, reverse: true },
				compare
			)
			expect(result).toEqual([5, 4, 3])
		})
	})

	describe("gte/lt", () => {
		it("scan gte/lt", () => {
			const list = [0, 1, 2, 3, 4, 5, 6, 7, 8]
			const result = scan(list, { gte: 3, lt: 6 }, compare)
			expect(result).toEqual([3, 4, 5])
		})

		it("scan gte/lt limit", () => {
			const list = [0, 1, 2, 3, 4, 5, 6, 7, 8]
			const result = scan(list, { gte: 3, lt: 6, limit: 2 }, compare)
			expect(result).toEqual([3, 4])
		})

		it("scan gte/lt truncated", () => {
			const list = [0, 1, 2, 3, 4, 5, 6, 7, 8]
			const result = scan(list, { gte: 3, lt: 6, limit: 10 }, compare)
			expect(result).toEqual([3, 4, 5])
		})

		it("scan gte/lt reverse", () => {
			const list = [0, 1, 2, 3, 4, 5, 6, 7, 8]
			const result = scan(list, { gte: 3, lt: 6, reverse: true }, compare)
			expect(result).toEqual([5, 4, 3])
		})

		it("scan gte/lt reverse limit", () => {
			const list = [0, 1, 2, 3, 4, 5, 6, 7, 8]
			const result = scan(
				list,
				{ gte: 3, lt: 6, limit: 2, reverse: true },
				compare
			)
			expect(result).toEqual([5, 4])
		})

		it("scan gte/lt reverse limit truncated", () => {
			const list = [0, 1, 2, 3, 4, 5, 6, 7, 8]
			const result = scan(
				list,
				{ gte: 3, lt: 6, limit: 10, reverse: true },
				compare
			)
			expect(result).toEqual([5, 4, 3])
		})
	})

	describe("gt/lte", () => {
		it("scan gt/lte", () => {
			const list = [0, 1, 2, 3, 4, 5, 6, 7, 8]
			const result = scan(list, { gt: 2, lte: 5 }, compare)
			expect(result).toEqual([3, 4, 5])
		})

		it("scan gt/lte limit", () => {
			const list = [0, 1, 2, 3, 4, 5, 6, 7, 8]
			const result = scan(list, { gt: 2, lte: 5, limit: 2 }, compare)
			expect(result).toEqual([3, 4])
		})

		it("scan gt/lte truncated", () => {
			const list = [0, 1, 2, 3, 4, 5, 6, 7, 8]
			const result = scan(list, { gt: 2, lte: 5, limit: 10 }, compare)
			expect(result).toEqual([3, 4, 5])
		})

		it("scan gt/lte reverse", () => {
			const list = [0, 1, 2, 3, 4, 5, 6, 7, 8]
			const result = scan(list, { gt: 2, lte: 5, reverse: true }, compare)
			expect(result).toEqual([5, 4, 3])
		})

		it("scan gt/lte reverse limit", () => {
			const list = [0, 1, 2, 3, 4, 5, 6, 7, 8]
			const result = scan(
				list,
				{ gt: 2, lte: 5, limit: 2, reverse: true },
				compare
			)
			expect(result).toEqual([5, 4])
		})

		it("scan gt/lte reverse limit truncated", () => {
			const list = [0, 1, 2, 3, 4, 5, 6, 7, 8]
			const result = scan(
				list,
				{ gt: 2, lte: 5, limit: 10, reverse: true },
				compare
			)
			expect(result).toEqual([5, 4, 3])
		})
	})

	describe("gte/lte", () => {
		it("scan gte/lte", () => {
			const list = [0, 1, 2, 3, 4, 5, 6, 7, 8]
			const result = scan(list, { gte: 3, lte: 5 }, compare)
			expect(result).toEqual([3, 4, 5])
		})

		it("scan gte/lte limit", () => {
			const list = [0, 1, 2, 3, 4, 5, 6, 7, 8]
			const result = scan(list, { gte: 3, lte: 5, limit: 2 }, compare)
			expect(result).toEqual([3, 4])
		})

		it("scan gte/lte truncated", () => {
			const list = [0, 1, 2, 3, 4, 5, 6, 7, 8]
			const result = scan(list, { gte: 3, lte: 5, limit: 10 }, compare)
			expect(result).toEqual([3, 4, 5])
		})

		it("scan gte/lte reverse", () => {
			const list = [0, 1, 2, 3, 4, 5, 6, 7, 8]
			const result = scan(list, { gte: 3, lte: 5, reverse: true }, compare)
			expect(result).toEqual([5, 4, 3])
		})

		it("scan gte/lte reverse limit", () => {
			const list = [0, 1, 2, 3, 4, 5, 6, 7, 8]
			const result = scan(
				list,
				{ gte: 3, lte: 5, limit: 2, reverse: true },
				compare
			)
			expect(result).toEqual([5, 4])
		})

		it("scan gte/lte reverse limit truncated", () => {
			const list = [0, 1, 2, 3, 4, 5, 6, 7, 8]
			const result = scan(
				list,
				{ gte: 3, lte: 5, limit: 10, reverse: true },
				compare
			)
			expect(result).toEqual([5, 4, 3])
		})
	})

	it("scan invalid bounds", () => {
		const list = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
		expect(() => scan(list, { gte: 10, lte: 1 }, compare)).toThrow()
	})
})
