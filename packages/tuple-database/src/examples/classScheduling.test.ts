// Based on the FoundationDb tutorial:
// https://apple.github.io/foundationdb/class-scheduling.html

import { flatten, range } from "remeda"
import { describe, it, expect } from "bun:test"
import { transactionalReadWrite } from "../database/sync/transactionalReadWrite"
import { ReadOnlyTupleDatabaseClientApi } from "../database/sync/types"
import { SchemaSubspace } from "../database/typeHelpers"
import {
	InMemoryTupleStorage,
	TupleDatabase,
	TupleDatabaseClient,
} from "../main"

// Generate 1,620 classes like '9:00 chem for dummies'
const levels = [
	"intro",
	"for dummies",
	"remedial",
	"101",
	"201",
	"301",
	"mastery",
	"lab",
	"seminar",
]

const types = [
	"chem",
	"bio",
	"cs",
	"geometry",
	"calc",
	"alg",
	"film",
	"music",
	"art",
	"dance",
]

const times = range(2, 20).map((t) => `${t}:00`)

const classNames = flatten(
	flatten(
		levels.map((level) =>
			types.map((type) => times.map((time) => [level, type, time].join(" ")))
		)
	)
)

type SchoolSchema =
	| { key: ["class", string]; value: number }
	| { key: ["attends", string, string]; value: null }

const addClass = transactionalReadWrite<SchoolSchema>()(
	(tr, className: string, remainingSeats: number) => {
		const course = tr.subspace(["class"])
		course.set([className], remainingSeats)
	}
)

const init = transactionalReadWrite<SchoolSchema>()((tr) => {
	// Clear the directory.
	for (const { key } of tr.scan()) {
		tr.remove(key)
	}

	for (const className of classNames) {
		addClass(tr, className, 4)
	}
})

function availableClasses(db: ReadOnlyTupleDatabaseClientApi<SchoolSchema>) {
	return db
		.subspace(["class"])
		.scan()
		.filter(({ value }) => value > 0)
		.map(({ key }) => {
			const className = key[0]
			return className
		})
}

const signup = transactionalReadWrite<SchoolSchema>()(
	(tr, student: string, className: string) => {
		const attends = tr.subspace(["attends"])
		const course = tr.subspace(["class"])

		if (attends.exists([student, className])) return // Already signed up.

		const remainingSeats = course.get([className])!
		if (remainingSeats <= 0) throw new Error("No remaining seats.")

		const classes = attends.scan({ prefix: [student] })
		if (classes.length >= 5) throw new Error("Too many classes.")

		course.set([className], remainingSeats - 1)
		attends.set([student, className], null)
	}
)

const drop = transactionalReadWrite<SchoolSchema>()(
	(tr, student: string, className: string) => {
		const attends = tr.subspace(["attends"])
		const course = tr.subspace(["class"])

		if (!attends.exists([student, className])) return // Not taking this class.

		const remainingSeats = course.get([className])!
		course.set([className], remainingSeats + 1)
		attends.remove([student, className])
	}
)

const switchClasses = transactionalReadWrite<SchoolSchema>()(
	(tr, student: string, classes: { old: string; new: string }) => {
		drop(tr, student, classes.old)
		signup(tr, student, classes.new)
	}
)

function getClasses(
	db: ReadOnlyTupleDatabaseClientApi<SchoolSchema>,
	student: string
) {
	const attends = db.subspace(["attends"])
	const classes = attends.scan({ prefix: [student] }).map(({ key }) => key[1])
	return classes
}

describe("Class Scheduling Example", () => {
	const [class1, class2, class3, class4, class5, class6] = classNames
	const [student1, student2, student3, student4, student5] = range(0, 5).map(
		(i) => `student${i}`
	)

	function createStorage() {
		// The class scheduling application is just a subspace!
		type Schema = SchemaSubspace<["scheduling"], SchoolSchema>
		const db = new TupleDatabaseClient<Schema>(
			new TupleDatabase(new InMemoryTupleStorage())
		)
		const scheduling = db.subspace(["scheduling"])
		return scheduling
	}

	it("signup", () => {
		const db = createStorage()
		init(db)

		expect(getClasses(db, student1).length).toBe(0)
		signup(db, student1, class1)
		expect(getClasses(db, student1).length).toBe(1)
	})

	it("signup - already signed up", () => {
		const db = createStorage()
		init(db)

		expect(getClasses(db, student1).length).toBe(0)
		signup(db, student1, class1)
		expect(getClasses(db, student1).length).toBe(1)
		signup(db, student1, class1)
		expect(getClasses(db, student1).length).toBe(1)
	})

	it("signup more than one", () => {
		const db = createStorage()
		init(db)

		expect(getClasses(db, student1).length).toBe(0)
		expect(getClasses(db, student2).length).toBe(0)

		const course = db.subspace(["class"])

		expect(course.get([class1])).toBe(4)
		expect(course.get([class2])).toBe(4)

		signup(db, student1, class1)
		expect(getClasses(db, student1).length).toBe(1)
		expect(course.get([class1])).toBe(3)

		signup(db, student1, class2)
		expect(getClasses(db, student1).length).toBe(2)
		expect(course.get([class2])).toBe(3)

		signup(db, student2, class2)

		expect(getClasses(db, student1).length).toBe(2)
		expect(getClasses(db, student2).length).toBe(1)

		expect(course.get([class2])).toBe(2)
	})

	it("drop", () => {
		const db = createStorage()
		init(db)

		expect(getClasses(db, student1).length).toBe(0)
		signup(db, student1, class1)
		expect(getClasses(db, student1).length).toBe(1)
		drop(db, student1, class1)
		expect(getClasses(db, student1).length).toBe(0)
	})

	it("drop - not taking this class", () => {
		const db = createStorage()
		init(db)

		expect(getClasses(db, student1).length).toBe(0)
		signup(db, student1, class1)
		expect(getClasses(db, student1).length).toBe(1)
		drop(db, student1, class2)
		expect(getClasses(db, student1).length).toBe(1)
	})

	it("signup - max attendance", () => {
		const db = createStorage()
		init(db)

		signup(db, student1, class1)
		signup(db, student2, class1)
		signup(db, student3, class1)
		signup(db, student4, class1)

		const course = db.subspace(["class"])

		expect(course.get([class1])).toBe(0)
		expect(() => signup(db, student5, class1)).toThrow()
	})

	it("signup - too many classes", () => {
		const db = createStorage()
		init(db)

		signup(db, student1, class1)
		signup(db, student1, class2)
		signup(db, student1, class3)
		signup(db, student1, class4)
		signup(db, student1, class5)

		expect(getClasses(db, student1).length).toBe(5)

		expect(() => signup(db, student1, class6)).toThrow()
	})

	it("switchClasses", () => {
		const db = createStorage()
		init(db)

		signup(db, student1, class1)
		signup(db, student1, class2)
		signup(db, student1, class3)
		signup(db, student1, class4)
		signup(db, student1, class5)

		expect(getClasses(db, student1).length).toBe(5)

		switchClasses(db, student1, { old: class5, new: class6 })
		const classes = getClasses(db, student1)
		expect(classes.length).toBe(5)
		expect(classes.includes(class6)).toBeTruthy()
		expect(!classes.includes(class5)).toBeTruthy()
	})

	it("availableClasses", () => {
		const db = createStorage()
		init(db)

		expect(availableClasses(db).includes(class1)).toBeTruthy()

		signup(db, student1, class1)
		signup(db, student2, class1)
		signup(db, student3, class1)
		signup(db, student4, class1)

		expect(!availableClasses(db).includes(class1)).toBeTruthy()
	})
})
