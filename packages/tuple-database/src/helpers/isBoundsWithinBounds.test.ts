import { describe, it, expect } from "bun:test"
// import { assert } from "../test/assertHelpers"
import { isBoundsWithinBounds } from "./isBoundsWithinBounds.js"
import { Bounds } from "./sortedTupleArray.js"

const testWithinBounds = (container: Bounds) => ({
	true: (bounds: Bounds) => {
		expect(isBoundsWithinBounds({ container, bounds })).toBeTrue()
	},
	false: (bounds: Bounds) => {
		expect(isBoundsWithinBounds({ container, bounds })).toBeFalse()
	},
})

describe("isBoundsWithinBounds", () => {
	it("() bounds", () => {
		const test = testWithinBounds({ gt: [0], lt: [10] })

		test.true({ gt: [0], lt: [10] })
		test.true({ gt: [1], lt: [9] })

		test.true({ gt: [0], lt: [9] })
		test.true({ gt: [1], lt: [10] })

		test.false({ gte: [0], lt: [10] })
		test.false({ gt: [0], lte: [10] })
		test.false({ gte: [0], lte: [10] })

		test.true({ gte: [1], lt: [9] })
		test.true({ gt: [1], lte: [9] })
		test.true({ gte: [1], lte: [9] })

		test.false({ gte: [0], lt: [9] })
		test.true({ gt: [0], lte: [9] })
		test.false({ gte: [0], lte: [9] })

		test.true({ gte: [1], lt: [10] })
		test.false({ gt: [1], lte: [10] })
		test.false({ gte: [1], lte: [10] })
	})

	it("[] bounds", () => {
		const test = testWithinBounds({ gte: [0], lte: [10] })

		test.true({ gt: [0], lt: [10] })
		test.true({ gte: [0], lt: [10] })
		test.true({ gt: [0], lte: [10] })
		test.true({ gte: [0], lte: [10] })

		test.true({ gt: [1], lt: [9] })
		test.true({ gte: [1], lt: [9] })
		test.true({ gt: [1], lte: [9] })
		test.true({ gte: [1], lte: [9] })

		test.true({ gt: [0], lt: [9] })
		test.true({ gte: [0], lt: [9] })
		test.true({ gt: [0], lte: [9] })
		test.true({ gte: [0], lte: [9] })

		test.true({ gt: [1], lt: [10] })
		test.true({ gte: [1], lt: [10] })
		test.true({ gt: [1], lte: [10] })
		test.true({ gte: [1], lte: [10] })

		test.false({ gt: [0], lt: [11] })
		test.false({ gt: [0], lte: [11] })

		test.false({ gt: [0], lt: [10, 0] })
		test.false({ gt: [0], lte: [10, 0] })

		test.false({ gt: [-1], lt: [10] })
		test.false({ gte: [-1], lt: [10] })

		test.true({ gt: [0, 0], lt: [10] })
		test.true({ gte: [0, 0], lt: [10] })
	})

	it("(] bounds", () => {
		const test = testWithinBounds({ gt: [0], lte: [10] })

		test.true({ gt: [0], lt: [10] })
		test.false({ gte: [0], lt: [10] })
		test.true({ gt: [0], lte: [10] })
		test.false({ gte: [0], lte: [10] })

		test.true({ gt: [1], lt: [9] })
		test.true({ gte: [1], lt: [9] })
		test.true({ gt: [1], lte: [9] })
		test.true({ gte: [1], lte: [9] })

		test.true({ gt: [0], lt: [9] })
		test.false({ gte: [0], lt: [9] })
		test.true({ gt: [0], lte: [9] })
		test.false({ gte: [0], lte: [9] })

		test.true({ gt: [1], lt: [10] })
		test.true({ gte: [1], lt: [10] })
		test.true({ gt: [1], lte: [10] })
		test.true({ gte: [1], lte: [10] })
	})

	it("[) bounds", () => {
		const test = testWithinBounds({ gte: [0], lt: [10] })

		test.true({ gt: [0], lt: [10] })
		test.true({ gte: [0], lt: [10] })
		test.false({ gt: [0], lte: [10] })
		test.false({ gte: [0], lte: [10] })

		test.true({ gt: [1], lt: [9] })
		test.true({ gte: [1], lt: [9] })
		test.true({ gt: [1], lte: [9] })
		test.true({ gte: [1], lte: [9] })

		test.true({ gt: [0], lt: [9] })
		test.true({ gte: [0], lt: [9] })
		test.true({ gt: [0], lte: [9] })
		test.true({ gte: [0], lte: [9] })

		test.true({ gt: [1], lt: [10] })
		test.true({ gte: [1], lt: [10] })
		test.false({ gt: [1], lte: [10] })
		test.false({ gte: [1], lte: [10] })
	})
})
