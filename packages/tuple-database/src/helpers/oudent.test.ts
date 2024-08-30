import { describe, test, expect } from "bun:test"
import { outdent } from "./outdent.js"

describe("outdent", () => {
	test("works", () => {
		const actual = outdent(`
      ReadWriteConflictError
      Write to tuple
      conflicted with a read at the bounds
    `)

		const expected = `ReadWriteConflictError
Write to tuple
conflicted with a read at the bounds`

		expect(actual).toStrictEqual(expected)
	})

	test("only trims the minimum indent across all the lines", () => {
		// First line is indented only one tab
		const actual = outdent(`
  ReadWriteConflictError
      Write to tuple
      conflicted with a read at the bounds
    `)

		const expected = `ReadWriteConflictError
    Write to tuple
    conflicted with a read at the bounds`

		expect(actual).toStrictEqual(expected)
	})
})
