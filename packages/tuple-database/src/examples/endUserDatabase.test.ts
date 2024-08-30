import { describe, it, expect } from "bun:test"
import { transactionalReadWrite } from "../database/sync/transactionalReadWrite.js"
import { TupleDatabase } from "../database/sync/TupleDatabase.js"
import { TupleDatabaseClient } from "../database/sync/TupleDatabaseClient.js"
import { compareTuple } from "../helpers/compareTuple.js"
import { ReadOnlyTupleDatabaseClientApi, SchemaSubspace } from "../main.js"
import { InMemoryTupleStorage } from "../storage/InMemoryTupleStorage.js"
import {
	$,
	evaluateQuery,
	Fact,
	Query,
	substituteBinding,
	TriplestoreSchema,
	Value,
	writeFact,
} from "./triplestore.js"

// We're going to build off of the triplestore example.
// So read triplestore.ts and triplestore.test.ts first.

type Obj = { id: string; [key: string]: Value | Value[] }

// Represent objects that we're typically used to as triples.
function objectToFacts(obj: Obj) {
	const facts: Fact[] = []
	const { id, ...rest } = obj
	for (const [key, value] of Object.entries(rest)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				facts.push([id, key, item])
			}
		} else {
			facts.push([id, key, value])
		}
	}
	facts.sort(compareTuple)
	return facts
}

describe("objectToFacts", () => {
	it("works", () => {
		expect(
			objectToFacts({
				id: "1",
				name: "Chet",
				age: 31,
				tags: ["engineer", "musician"],
			})
		).toEqual([
			["1", "age", 31],
			["1", "name", "Chet"],
			["1", "tags", "engineer"],
			["1", "tags", "musician"],
		])
	})
})

// A user-defined query filters objects based on 1 or more properties.
type UserFilter = { id: string; [prop: string]: Value }

function userFilterToQuery(filter: UserFilter): Query {
	const { id, ...props } = filter
	return Object.entries(props).map(([a, v]) => [$("id"), a, v])
}

type Schema =
	| SchemaSubspace<["data"], TriplestoreSchema>
	// A list of user-defined filters.
	| { key: ["filter", string]; value: UserFilter }
	// And index for all objects ids that pass the filter.
	| { key: ["index", string, string]; value: null }

const reindexFact = transactionalReadWrite<Schema>()((tx, fact: Fact) => {
	const [e, a, v] = fact

	// Get all the user-defined filters.
	const filters = tx.scan({ prefix: ["filter"] }).map(({ value }) => value)

	// Add this object id to the index if it passes the filter.
	filters.forEach((filter) => {
		// For performance, let's check some trivial cases:

		// This fact is irrelevant to the filter.
		if (!(a in filter)) {
			return
		}

		// This fact directly breaks the filter.
		if (v !== filter[a]) {
			tx.remove(["index", filter.id, e])
			return
		}

		// Evaluate if this object passes the whole filter:
		const query = userFilterToQuery(filter)
		const testQuery = substituteBinding(query, { id: e })
		const result = evaluateQuery(tx.subspace(["data"]), testQuery)
		if (result.length === 0) {
			tx.remove(["index", filter.id, e])
		} else {
			tx.set(["index", filter.id, e], null)
		}
	})
})

const writeObjectFact = transactionalReadWrite<Schema>()((tx, fact: Fact) => {
	writeFact(tx.subspace(["data"]), fact)
	reindexFact(tx, fact)
})

const writeObject = transactionalReadWrite<Schema>()((tx, obj: Obj) => {
	for (const fact of objectToFacts(obj)) {
		writeObjectFact(tx, fact)
	}
})

const createFilter = transactionalReadWrite<Schema>()(
	(tx, filter: UserFilter) => {
		tx.set(["filter", filter.id], filter)

		// Evaluate the filter.
		const query = userFilterToQuery(filter)
		const ids = evaluateQuery(tx.subspace(["data"]), query).map(
			({ id }) => id as string
		)

		// Write those ids to the index.
		ids.forEach((id) => {
			tx.set(["index", filter.id, id], null)
		})
	}
)

function readFilterIndex(
	db: ReadOnlyTupleDatabaseClientApi<Schema>,
	filterId: string
) {
	return db.scan({ prefix: ["index", filterId] }).map(({ key }) => key[2])
}

describe("End-user Database", () => {
	it("works", () => {
		// Lets try it out.
		const db = new TupleDatabaseClient<Schema>(
			new TupleDatabase(new InMemoryTupleStorage())
		)

		writeObject(db, {
			id: "person1",
			name: "Chet",
			age: 31,
			tags: ["engineer", "musician"],
		})

		writeObject(db, {
			id: "person2",
			name: "Meghan",
			age: 30,
			tags: ["engineer", "botanist"],
		})

		writeObject(db, {
			id: "person3",
			name: "Saul",
			age: 31,
			tags: ["musician"],
		})

		writeObject(db, {
			id: "person4",
			name: "Tanishq",
			age: 22,
			tags: [],
		})

		// Create a filter with only one property.
		createFilter(db, { id: "filter1", tags: "engineer" })
		expect(readFilterIndex(db, "filter1")).toEqual(["person1", "person2"])

		// Test that this filter gets maintained.
		writeObjectFact(db, ["person4", "tags", "engineer"])
		expect(readFilterIndex(db, "filter1")).toEqual([
			"person1",
			"person2",
			"person4",
		])

		// Lets create a filter with two properties.
		createFilter(db, {
			id: "filter2",
			tags: "musician",
			age: 31,
		})
		expect(readFilterIndex(db, "filter2")).toEqual(["person1", "person3"])

		// Test that this filter gets maintained.
		writeObject(db, {
			id: "person5",
			name: "Sean",
			age: 31,
			tags: ["musician", "botanist"],
		})

		expect(readFilterIndex(db, "filter2")).toEqual([
			"person1",
			"person3",
			"person5",
		])
	})
})
