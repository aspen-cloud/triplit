import { describe, it, expect } from "bun:test"
import { TupleDatabase } from "../database/sync/TupleDatabase.js"
import { TupleDatabaseClient } from "../database/sync/TupleDatabaseClient.js"
import { InMemoryTupleStorage } from "../storage/InMemoryTupleStorage.js"
import {
	$,
	evaluateQuery,
	Fact,
	TriplestoreSchema,
	writeFact,
} from "./triplestore.js"

// Read triplestore.ts first to understand this this test.

describe("Triplestore", () => {
	it("works", () => {
		const db = new TupleDatabaseClient<TriplestoreSchema>(
			new TupleDatabase(new InMemoryTupleStorage())
		)

		const facts: Fact[] = [
			["1", "name", "chet"],
			["2", "name", "tk"],
			["3", "name", "joe"],
			["2", "worksFor", "1"],
			["3", "worksFor", "1"],
		]

		for (const fact of facts) {
			writeFact(db, fact)
		}

		expect(
			evaluateQuery(db, [
				[$("chetId"), "name", "chet"],
				[$("id"), "worksFor", $("chetId")],
				[$("id"), "name", $("name")],
			])
		).toEqual([
			{ name: "tk", id: "2", chetId: "1" },
			{ name: "joe", id: "3", chetId: "1" },
		])
	})

	it("family example", () => {
		const db = new TupleDatabaseClient<TriplestoreSchema>(
			new TupleDatabase(new InMemoryTupleStorage())
		)

		const facts: Fact[] = [
			["Chet", "parent", "Deborah"],
			["Deborah", "sibling", "Melanie"],
			["Tim", "parent", "Melanie"],
			["Becca", "parent", "Melanie"],
			["Roni", "parent", "Melanie"],
			["Deborah", "sibling", "Ruth"],
			["Izzy", "parent", "Ruth"],
			["Ali", "parent", "Ruth"],
			["Deborah", "sibling", "Sue"],
			["Ray", "parent", "Sue"],
			["Michelle", "parent", "Sue"],
			["Tyler", "parent", "Sue"],
			["Chet", "parent", "Leon"],
			["Leon", "sibling", "Stephanie"],
			["Matt", "parent", "Stephanie"],
			["Tom", "parent", "Stephanie"],
		]

		for (const fact of facts) {
			writeFact(db, fact)
		}

		const result = evaluateQuery(db, [
			["Chet", "parent", $("parent")],
			[$("parent"), "sibling", $("auntOrUncle")],
			[$("cousin"), "parent", $("auntOrUncle")],
		])

		expect(result).toEqual([
			{ cousin: "Becca", auntOrUncle: "Melanie", parent: "Deborah" },
			{ cousin: "Roni", auntOrUncle: "Melanie", parent: "Deborah" },
			{ cousin: "Tim", auntOrUncle: "Melanie", parent: "Deborah" },
			{ cousin: "Ali", auntOrUncle: "Ruth", parent: "Deborah" },
			{ cousin: "Izzy", auntOrUncle: "Ruth", parent: "Deborah" },
			{ cousin: "Michelle", auntOrUncle: "Sue", parent: "Deborah" },
			{ cousin: "Ray", auntOrUncle: "Sue", parent: "Deborah" },
			{ cousin: "Tyler", auntOrUncle: "Sue", parent: "Deborah" },
			{ cousin: "Matt", auntOrUncle: "Stephanie", parent: "Leon" },
			{ cousin: "Tom", auntOrUncle: "Stephanie", parent: "Leon" },
		])
	})
})
