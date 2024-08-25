import { describe, it, expect } from "bun:test"
import { transactionalReadWrite } from "../database/sync/transactionalReadWrite"
import { TupleDatabase } from "../database/sync/TupleDatabase"
import { TupleDatabaseClient } from "../database/sync/TupleDatabaseClient"
import { namedTupleToObject } from "../helpers/namedTupleToObject"
import { ReadOnlyTupleDatabaseClientApi } from "../main"
import { InMemoryTupleStorage } from "../storage/InMemoryTupleStorage"

type User = { username: string; bio: string }

type Post = {
	id: string
	username: string
	timestamp: number
	text: string
}

type Schema =
	| { key: ["user", { username: string }]; value: User }
	| { key: ["post", { id: string }]; value: Post }
	| {
			key: ["follows", { from: string }, { to: string }]
			value: null
	  }
	| {
			key: ["following", { to: string }, { from: string }]
			value: null
	  }
	| {
			key: [
				"profile",
				{ username: string },
				{ timestamp: number },
				{ postId: string }
			]
			value: null
	  }
	| {
			key: [
				"feed",
				{ username: string },
				{ timestamp: number },
				{ postId: string }
			]
			value: null
	  }

const addFollow = transactionalReadWrite<Schema>()(
	(tx, from: string, to: string) => {
		// Setup the follow relationships.
		tx.set(["follows", { from }, { to }], null)
		tx.set(["following", { to }, { from }], null)

		// Get the followed user's posts.
		tx.scan({ prefix: ["profile", { username: to }] })
			.map(({ key }) => namedTupleToObject(key))
			.forEach(({ timestamp, postId }) => {
				// Write those posts to the user's feed.
				tx.set(["feed", { username: from }, { timestamp }, { postId }], null)
			})
	}
)

const createPost = transactionalReadWrite<Schema>()((tx, post: Post) => {
	tx.set(["post", { id: post.id }], post)

	// Add to the user's profile
	const { username, timestamp } = post
	tx.set(["profile", { username }, { timestamp }, { postId: post.id }], null)

	// Find everyone who follows this username.
	const followers = tx
		.scan({ prefix: ["following", { to: username }] })
		.map(({ key }) => namedTupleToObject(key))
		.map(({ from }) => from)

	// Write to their feed.
	followers.forEach((username) => {
		tx.set(["feed", { username }, { timestamp }, { postId: post.id }], null)
	})
})

const createUser = transactionalReadWrite<Schema>()((tx, user: User) => {
	tx.set(["user", { username: user.username }], user)
})

function getFeed(db: ReadOnlyTupleDatabaseClientApi<Schema>, username: string) {
	return db
		.scan({ prefix: ["feed", { username }] })
		.map(({ key }) => namedTupleToObject(key))
		.map(({ postId }) => postId)
}

function getProfile(
	db: ReadOnlyTupleDatabaseClientApi<Schema>,
	username: string
) {
	return db
		.scan({ prefix: ["profile", { username }] })
		.map(({ key }) => namedTupleToObject(key))
		.map(({ postId }) => postId)
}

describe("Social App", () => {
	it("works", () => {
		// Lets try it out.
		const db = new TupleDatabaseClient<Schema>(
			new TupleDatabase(new InMemoryTupleStorage())
		)

		createUser(db, { username: "chet", bio: "I like to build things." })
		createUser(db, { username: "elon", bio: "Let's go to mars." })
		createUser(db, { username: "meghan", bio: "" })

		// Chet makes a post.
		createPost(db, {
			id: "post1",
			username: "chet",
			timestamp: 1,
			text: "post1",
		})
		createPost(db, {
			id: "post2",
			username: "meghan",
			timestamp: 2,
			text: "post2",
		})

		expect(getProfile(db, "chet")).toEqual(["post1"])
		expect(getProfile(db, "meghan")).toEqual(["post2"])

		expect(getFeed(db, "chet")).toEqual([])
		expect(getFeed(db, "meghan")).toEqual([])

		// When meghan follows chet, the post should appear in her feed.
		addFollow(db, "meghan", "chet")

		expect(getFeed(db, "chet")).toEqual([])
		expect(getFeed(db, "meghan")).toEqual(["post1"])

		// When chet makes another post, it should show up in meghan's feed.
		createPost(db, {
			id: "post3",
			username: "chet",
			timestamp: 3,
			text: "post3",
		})

		expect(getProfile(db, "chet")).toEqual(["post1", "post3"])
		expect(getFeed(db, "meghan")).toEqual(["post1", "post3"])
	})
})
