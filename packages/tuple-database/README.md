# Tuple Database

> The local-first, "*end-user database*" database.

> The embedded FoundationDb.

> The reactive indexable graph database.

**Features**

- Embedded, designed for [Local-First Software](https://www.inkandswitch.com/local-first/).
- All queries are reactive.
- Schemaless — schemas are enforced by the application, not the database.
- Transactional read/writes written in TypeScript.
- Directly read/write indexes with the ability to index graph/relational queries.
- Works with synchronous and asynchronous storage including SQLite or LevelDb.
- Suitable for frontend state management.

**Table of Contents**
- [Quick Start](#Quick-Start)
- [Motivation](#Motivation)
- [Background](#Background)
- [Documentation](#Documentation)
- [Examples](#Examples)

# Quick Start

1. Install from NPM:

	```sh
	npm install @triplit/tuple-database
	```

2. Define your schema.

	For example a contacts app in SQL might be defined as:

	```sql
	CREATE TABLE user (
		id UUID PRIMARY KEY,
		first_name TEXT,
		last_name TEXT,
		age INT
	)

	CREATE INDEX age ON user (age);
	CREATE INDEX name ON user (last_name, first_name);
	```

	But for this database, you would write:

	```ts
	type User = {
		id: string,
		first_name: string,
		last_name: string,
		age: number
	}

	type UserIndex = {
		key: ["user", {id: string}],
		value: User
	}

	type AgeIndex = {
		key: ["userByAge", {age: number}, {id: string}],
		value: null
	}

	type NameIndex = {
		key: ["userByName", {last_name: string}, {first_name: string}, {id: string}],
		value: null
	}

	type Schema = UserIndex | AgeIndex | NameIndex
	```

3. Construct your database (see [Documentation](#Documentation) for more storage options).

	```ts
	import {
		TupleDatabaseClient,
		TupleDatabase,
		InMemoryTupleStorage
	} from "tuple-database"
	const db = new TupleDatabaseClient<Schema>(new TupleDatabase(new InMemoryTupleStorage()))
	```

4. Define read and write queries:

	```ts
	import { transactionalReadWrite } from "tuple-database"

	const removeUser = transactionalReadWrite<Schema>()((tx, id: string) => {
		const existing = tx.get(["user", {id}])
		if (!existing) return

		const {first_name, last_name, age} = existing
		tx.remove(["user", {id}])
		tx.remove(["userByAge", {age}, {id}])
		tx.remove(["userByName", {last_name}, {first_name}, {id}])
		return existing
	})

	const insertUser = transactionalReadWrite<Schema>()((tx, user: User) => {
		const {id, first_name, last_name, age} = user
		tx.set(["user", {id}], user)
		tx.set(["userByAge", {age}, {id}], null)
		tx.set(["userByName", {last_name}, {first_name}, {id}], null)
	})

	const upsertUser = transactionalReadWrite<Schema>()((tx, user: User) {
		removeUser(tx, user.id)
		insertUser(tx, user)
	})

	function getOldestUser(db: ReadOnlyTupleDatabaseClientApi<Schema>) {
			return db.scan({prefix: ["userByAge"], reverse: true, limit: 1})
				.map(({key, value}) => key)
				.map(namedTupleToObject)[0]
	}
	```

5. Use this database, for example, in your React application:

	```tsx
	import { useTupleDatabase } from "tuple-database/useTupleDatabase"

	function init({db}) {
		upsertUser(db, {id: "1", first_name: "Chet", last_name: "Corcos", age: 31})
		upsertUser(db, {id: "2", first_name: "Tanishq", last_name: "Kancharla", age: 22})
	}

	function App({db}) {
		const oldestUser = useTupleDatabase(db, getOldestUser, [])
		return <div>The oldest user is age: {oldestUser.age}</div>
	}
	```


# Motivation

I designed this database with lots of fairly niche constraints in mind.

1. Local-First

	I endorse to all of the motivations listed in the [Local-First Software](https://www.inkandswitch.com/local-first/) article. But the more acute reason for me is that it **frees developers from the endless maintenance** of a gigantic multi-tenant system. When users own all of their data on their devices, it's a natural way of sharding a database and scaling up a platform.

	As a constraint, this means that I'm interested in building an embedded database, like SQLite or LevelDb, that runs in process and is intended to be single tenant. That means we don't need to worry about certain kinds of scale or clustering / replicas.

2. Reactive Queries

	Polished applications these days require realtime reactivity. And it's not just for collaboration — reactivity necessary when a user has multiple windows or tabs showing the same data.

	Many systems have record-level or table-level reactivity, but I want **all queries to be reactive**. I'm tired of having to engineer custom solutions on top of databases with brittle logic where a developer might forget to emit an update event.

3. Schemaless

	It took me some time to realize the the value of maintaining schemas in the application rather than the database. This was motivated by two use-cases I had in mind:

	- It's incredibly difficult to **sync data peer-to-peer** when clients may have different versions of a schema that are strictly enforced by the database. Instead, a schemaless database should be flexible enough to accept incoming data and allow the application to resolve conflicts or schema issues.

	- I want to build apps like Notion and Airtable where **end-users define their own schemas**. I call this an "end-user database". Granted, you can use SQLite and run `ALTER TABLE` commands, but this becomes pretty difficult to keep track of, especially once we start to consider indexing and many-to-many relationships. A schemaless database provides the flexibility necessary to create an object with a dynamic property that can also get indexed.

4. Directly Manipulate Indexes

	I've spent way to much time in Postgres manually denormalizing data and constructing elaborate indexes that perfectly complement a complex query with the goal of `EXPLAIN` outputting `INDEX ONLY SCAN` for optimal performance. This dance is a tiresome incidental complexity for application development.

	The query optimizer is the most valuable part about SQL, leveraging a variety of indexes to answer a wide variety of queries as efficiently as possible. This makes sense for business intelligence where you run a wide variety of different queries. But typical applications tend to ask a few unchanging queries many times. Thus the query optimizer is a useless indirection for a developer trying to design for a specific set of queries. I want to bypass the query optimizer altogether to **read and write directly to/from indexes**.

	So long as we can **transactionally read and write indexes** using arbitrary logic ([like you can with FoundationDb](https://apple.github.io/foundationdb/developer-guide.html#transaction-basics)), then we can drop down to a lower level of abstraction and deal with indexes directly instead of using DDL.

	- Many-to-many relationships are incredibly common in applications today. Many users can belong to many group chats; many pages and have many tags; many users can follow many users.

		Yet SQL does not provide a way of indexing queries that involve a `JOIN`. Social apps that want to query "what are all the posts of all the people I follow ordered in time" must design their own systems because SQL cannot index that query (SQL will need to load all of the posts of all the people you follow over all time, and sort them in memory!).

		**Indexing any-to-many relationships** is a use-case we get for free as a consequence of being able to directly manipulate indexes.

5. Asynchonous or Synchronous, Persisted or In-Memory Storage

	Obviously, I want to be able to persist data. And most persistence layers are asynchronous: LevelDb or even a cloud database. But even when persistence is synchronous, like SQLite, you might have to asynchronously cross a process boundary, such as an Electron window interacting with a database on the main process.

	But a non-trivial use-case is that I want to use a **synchronous in-memory database for frontend state management** in my application. I'm building apps using React.js and web technologies these days, so synchronous updates are necessary for certain kinds of interactions. For example, effects like opening a link must occur in the same event loop as the user interaction, otherwise the browser won't respond.


# Background

The architecture of this database draws inspiration from a bunch of different places (although, primarily from FoundationDb). And it took a lot of reading only to find out that pretty much every database has similar abstractions under the hood — an ordered list (or tree) of tuples and binary search. This is why DynamoDb and FoundationDb can have [frontend abstractions](https://apple.github.io/foundationdb/layer-concept.html) that are compatible with Postgres or [MongoDb](https://github.com/FoundationDB/fdb-document-layer).

Suppose we have the following SQL schema.

```sql
CREATE TABLE user (
	id UUID PRIMARY KEY,
	first_name TEXT,
	last_name TEXT,
	age INT
)

CREATE INDEX age ON user (age);
CREATE INDEX name ON user (last_name, first_name);
```

We've defined three different indexes here (including the primary key index). The name index has what is called a "composite key" — that's a tuple right there!

With `tuple-database`, we'd represent this schema as follows (using TypeScript):

```ts
type User = {id: string, first_name: string, last_name: string, age: number}

type UserIndex = {
	key: ["user", {id: string}],
	value: User
}

type AgeIndex = {
	key: ["userByAge", {age: number}, {id: string}],
	value: null
}

type NameIndex = {
	key: ["userByName", {last_name: string}, {first_name string}, {id: string}],
	value: null
}

type Schema = UserIndex | AgeIndex | NameIndex
```

I said this database is *schemaless* and *it is schemaless* because the database does not enforce any kind of schema. But it's still useful to use types to define the kinds of things we *expect* in the database.

To create some users and write to the database, we simply create a transaction and manipulate the indexes ourselves.

```ts
import {
	TupleDatabaseClient,
	TupleDatabase,
	InMemoryTupleStorage
} from "tuple-database"

const db = new TupleDatabaseClient<Schema>(new TupleDatabase(new InMemoryTupleStorage()))

function upsertUser(db: TupleDatabaseClient<Schema>, user: User) {
	const tx = db.transact()

	const existing = tx.get(["user", {id: user.id}])
	if (existing) {
		const {id, first_name, last_name, age} = existing
		tx.remove(["user", {id}])
		tx.remove(["userByAge", {age}, {id}])
		tx.remove(["userByName", {last_name}, {first_name}, {id}])
	}

	const {id, first_name, last_name, age} = user
	tx.set(["user", {id}], user)
	tx.set(["userByAge", {age}, {id}], null)
	tx.set(["userByName", {last_name}, {first_name}, {id}], null)

	tx.commit()
}

upsertUser(db, {id: "1", first_name: "Chet", last_name: "Corcos", age: 31})
upsertUser(db, {id: "2", first_name: "Tanishq", last_name: "Kancharla", age: 22})
```

Notice that we're transactionally reading and writing to the the database. And we can execute whatever kinds of code we want in this transaction — we're not limited to some esoteric query syntax. And so while it might seem painful to manually write all of this code, you have the full expressive capabilities of TypeScript to compose functions together to make it all happen.

For example, here's a fairly straightforward refactor:

```ts
function removeUser(tx: TupleDatabaseTransaction<Schema>, id: string) {
	const existing = tx.get(["user", {id}])
	if (!existing) return

	const {id, first_name, last_name, age} = existing
	tx.remove(["user", {id}])
	tx.remove(["userByAge", {age}, {id}])
	tx.remove(["userByName", {last_name}, {first_name}, {id}])
	return existing
}

function insertUser(tx: TupleDatabaseTransaction<Schema>, user: User) {
	const {id, first_name, last_name, age} = user
	tx.set(["user", {id}], user)
	tx.set(["userByAge", {age}, {id}], null)
	tx.set(["userByName", {last_name}, {first_name}, {id}], null)
}

// Very expressive composition :)
function upsertUser(tx: TupleDatabaseTransaction<Schema>, user: User) {
	removeUser(tx, user.id)
	insertUser(tx, user)
}

// All in one transaction :)
const tx = db.transact()
upsertUser(tx, {id: "1", first_name: "Chet", last_name: "Corcos", age: 31})
upsertUser(tx, {id: "2", first_name: "Tanishq", last_name: "Kancharla", age: 22})
tx.commit()
```

So that's how you write to the database.

Now, how about querying the database? Suppose you want to lookup a user by last name:

```sql
SELECT id, first_name FROM user
WHERE last_name = $lastName
```

The query planner under the hood will use the name index and use binary search to jump to that last name and read out all the users with that given last name off of the index.

With `tuple-database` you do something very similar, except by directly reading the index:

```ts
function getUsersWithLastName(db: TupleDatabaseClient<Schema>, lastName: string) {
	return db.scan({prefix: ["userByName", {last_name: lastName}]})
		// => Array<{key: ["userByName", {last_name: string}, {first_name: string}, {id: string}], value: null}>
		.map(({key, value}) => key)
		// => Array<["userByName", {last_name: string}, {first_name: string}, {id: string}]>
		.map(namedTupleToObject)
		// => Array<{last_name: string, first_name: string, id: string}>
}
```

The important thing to realize here is that all we've done is dropped down to a lower level of abstraction. The logic we've written here for the `tuple-database` code is *exactly* what any SQL database is doing under the hood.

And now that you understand how databases fundamentally uses tuples under the hood, you can discover how this database can do much more than SQL by reading through the [examples](#Examples).

# Documentation

There are **three layers** to this database that you need to compose together. But first, we need to cover some terminology.

## Terminology / Types

- A `Value` is any valid JSON.
- A `Tuple` is an array of `Value`s.
- A `key` is a `Tuple`.
- A `KeyValuePair` is `{key: Tuple, value: any}`. And `value` is `any` because in-memory storage doesn't have to serialize the value.

## TupleStorage

`TupleStorage` is the lowest level abstraction.

There's one method for reading and one method for writing.

- `write` for batch adding / removing key-value pairs:
	```ts
	write({
		set?: KeyValuePair[],
		remove?: Tuple[]
	}):  void
	```

- `scan` for reading a range of key-value pairs:
	```ts
	scan({
		gt?: Tuple, gte?: Tuple,
		lt?: Tuple, lte?: Tuple,
		reverse?: boolean,
		limit?: number
	}): KeyValuePair[]
	```

Here's a simple example of how the storage API works:

```ts
const storage = new InMemoryTupleStorage()

storage.commit({
	set: [
		{ key: ["chet", "corcos"], value: 0 },
		{ key: ["jon", "smith"], value: 2 },
		{ key: ["jonathan", "smith"], value: 1 },
	],
})

const result = storage.scan({ gte: ["j"], lt: ["k"] })

assert.deepEqual(result, [
	{ key: ["jon", "smith"], value: 2 },
	{ key: ["jonathan", "smith"], value: 1 },
])
```

There are several different options for the storage layer.

1. InMemoryTupleStorage
	```ts
	import { InMemoryTupleStorage } from "tuple-database"
	const storage = new InMemoryTupleStorage()
	```
	I'd highly recommend [reading the code](./src/storage/InMemoryTupleStorage.ts) to understand how `InMemoryTupleStorage` works. It's really quite simple and just uses binary search to maintain an ordered associative array.

2. FileTupleStorage
	```ts
	import { FileTupleStorage } from "tuple-database/storage/FileTupleStorage"
	const storage = new FileTupleStorage(__dirname + "/app.db")
	```

3. LevelTupleStorage
	```ts
	import level from "level"
	import { LevelTupleStorage } from "tuple-database/storage/LevelTupleStorage"
	const storage = new LevelTupleStorage(level(__dirname + "/app.db"))
	```

4. SQLiteTupleStorage
	```ts
	import sqlite from "better-sqlite3"
	import { SQLiteTupleStorage } from "tuple-database/storage/SQLiteTupleStorage"
	const storage = new SQLiteTupleStorage(sqlite(__dirname + "/app.db"))
	```

5. BrowserTupleStorage

	This holds the whole database in-memory and persists it to localStorage.

	```ts
	import { BrowserTupleStorage } from "tuple-database/storage/BrowserTupleStorage"
	const storage = new BrowserTupleStorage("localStorageKey")
	```

6. IndexedDbTupleStorage

	```ts
	import { IndexedDbTupleStorage } from "tuple-database/storage/IndexedDbTupleStorage"
	const storage = new IndexedDbTupleStorage("objectStoreName")
	```


You can also create your own storage layer by implementing `TupleStorageApi` or `AsyncTupleStorageApi` interfaces.

```ts
import { TupleStorageApi } from "tuple-database"
class CustomTupleStorage implements TupleDatabaseApi {
	/* ... */
}
```

### Sort Order

Strings and numbers should be ordered as you might expect.

- `"a"` < `"b"`
- `"a"` < `"apple"`
- `2` < `10`

But since a `Value` is any valid JSON, we need to arbitrarily decide how to sort types. And we've arbitrarily decided that:

```ts
null < object < array < number < string < boolean
```

Thus, every number is less than every string:
- `12` < `"apple"`

Arrays are "compound sorted", also called "composite keys" in SQL. This is the same concept as "sort contacts by first *then* last name".
- `["adam"]` < `["adam", "smith"]`
- `["jon", "smith"]` < `["jonathan", "smith"]`

It is important understand that we aren't simply concatenating the strings (`"jonathansmith"` < `"jonsmith"`), and instead we are comparing each item component-wise.

Objects are interpreted as ordered dictionaries — an array of key-value pairs sorted by key.
- `{b: 2, a: 1} => [["a", 1], ["b", 2]]`

I have not discovered a particularly useful reason to use objects in the tuple key. Comparing objects like this just doesn't seem that valuable. I also arbitrarily chose to order objects as pairs rather than zipping (e.g. `{b: 2, a: 1} => [["a", "b"], [1, 2]]` ).

That said, we often use objects with a single key as a "named key" for developer convenience since the ordering will be the same. For example, a key might be `["favoriteColor", {person: string}, {color: string}]` which is less ambiguous than `["favoriteColor", string, string]` for developers to work with.

### Lexicographical Encoding

The tuple storage layer operates at the level of tuples and values. But most existing ordered key-value storage options will only accept bytes as keys. It's non-trivial to convert a tuple into a byte-string that maintains a consistent order. For example `2` < `11` but `"2"` > `"11"`.

For numbers, we use the [`elen` library](https://www.npmjs.com/package/elen) which encodes signed float64 numbers into strings.

For arrays, we join elements using a null byte `\x00` and escape null bytes with `\x00 => \x01\x00` as well as escaping the escape bytes `\x01 => \x01\x01`. Thus, `["jon", "smith"] => "jon\x00smith"` and `["jonathan", "smith"] => "jonathan\x00smith"`.

Lastly, we use a single byte to encode the type of the value which allows us to enforce the type order.

Please [read the source code](./src/helpers/codec.ts) for a better understanding of how this codec works. And check out the existing storage implementations to see how it is used.

### Prefix Scanning

One tricky thing about the scan API is how to you get all tuples with a given prefix? Given a tuple of `[firstName, lastName]`, how do you look up everyone with first name "Jon"?

- We can try something arbitrary like `scan({gt: ["Jon"], lte: ["Jon", "ZZZZ"]})`, but this will miss a potential result: `["Jon", "ZZZZZZZZ"]`.
- We can increment the byte so the upper bound is `["Jom"]`.
	This works, but it's trickier when dealing with numbers. What if we want a prefix of `[1]`? Would the upper bound be `[1.000000000000001]`?

Ideally, we'd be able to specify a minimum and maximum value. It turns out this is pretty easy because of the way our types are ordered with `null` as the smallest value and `true` as the largest value.

Thus, we can get all tuples prefixed by `"Jon"` with `scan({gt: ["Jon"], lt: ["Jon", true]})`.

And for convenience, we've exported `MIN` and `MAX` which are aliased `null` and `true` respectively. It is recommended to use these variables when it makes semantic sense: `scan({gt: ["Jon"], lt: ["Jon", MAX]})`.

## TupleDatabase

`TupleDatabase` is the middle layer which implements [reactivity](#Reactivity) and [concurrency control](#Concurrency-Control).

```ts
import { InMemoryTupleStorage, TupleDatabase } from "tuple-database"
const storage = new InMemoryTupleStorage()
const db = new TupleDatabase(storage)
```

If you're using the an async storage layer, you'll need to use `AsyncTupleDatabase`.


```ts
import { InMemoryTupleStorage, AsyncTupleDatabase } from "tuple-database"
const storage = new InMemoryTupleStorage()
const db = new AsyncTupleDatabase(storage)
```

You will almost always be using this database through a `TupleDatabaseClient` so we won't talk about the TupleDatabase API here. Just understand that this layer is the central process for managing reactivity and concurrency.


## TupleDatabaseClient

`TupleDatabaseClient` is the highest level layer that you will primarily be using to interact with the database.

The client layer provides convenient methods and types on top of the TupleDatabase.

```ts
import {
	TupleDatabaseClient,
	TupleDatabase,
	InMemoryTupleStorage
} from "tuple-database"
const storage = new InMemoryTupleStorage()
const db = new TupleDatabase(storage)
const client = new TupleDatabaseClient(db)
```

If you're using async storage, then you need to use an async client. However you can also use the async client with synchronous storage.

```ts
import {
	AsyncTupleDatabaseClient,
	AsyncTupleDatabase,
	InMemoryTupleStorage
} from "tuple-database"
const storage = new InMemoryTupleStorage()
const db = new AsyncTupleDatabase(storage)
const client = new AsyncTupleDatabaseClient(db)
```

### `client.scan`

This is the same method as `storage.scan` but has a convenient `prefix` argument. Note that the prefix argument is prepended to the rest of the bounds.

Thus `{prefix: ["a"], gt: ["b"]}` will unravel into `{gt: ["a", "b"], lte: ["a", MAX]}`

### `client.get`

This method will scan for a single tuple and return its value if it exists.

### Typed Schema

The client layer introduces Typescript types to describe the schema of the database. Note that this schema is not enforced at runtime and is simply a developer convenience — this database fundamentally is schemaless.

A schema is just a union type of `KeyValuePair`s. For example:

```ts
type Schema =
	| { key: ["score", string]; value: number }
	| { key: ["total"]; value: number }
```

And using this schema allows TypeScript to typecheck and infer types.

```ts
const client = new TupleDatabaseClient<Schema>(
	new TupleDatabase(new InMemoryTupleStorage())
)

const scores = client.scan({ prefix: ["score"] })

// TypeScript will infer the result based on the prefix.
// typeof scores = { key: ["score", string]; value: number }[]
```

### Subspace

Subspaces represent the same database narrowed in on a specific prefix.

```ts
const gameDb = client.subspace(["score"])
// typeof gameDb => TupleDatabaseClientApi<{ key: [string]; value: number }>

const score = gameDb.get(["chet"])
// typeof score = number
```

Subspaces are especially useful for composing logic for nested subspaces.

For example, maybe we defined a bunch of business logic for a specific schema, such as `setScore` for a schema with a single game.

```ts
type GameSchema =
	| { key: ["score", string]; value: number }
	| { key: ["total"]; value: number }

function setScore(db: TupleDatabaseClientApi<GameSchema>, person: string, score: number) {
	/* ... */
}
```

Now suppose we decide that we want to be able to keep track of multiple games. Rather than make `setScore` aware of the `gameId`, we can simply use a subspace.

```ts
type Game = {id: string, name: string, players: string[]}

type Schema =
	| {key: ["game", string], value: Game}
	| SchemaSubspace<["gameState", string], GameSchema>
	// SchemaSubspace will prepend the given prefix to every key in the subspace schenma.

const client = new TupleDatabaseClient<Schema>(new TupleDatabase(new InMemoryTupleStorage()))

// Using a subspace to narrow in on a specific game to re-use the game state logic.
setScore(client.subspace(["gameState", "game1"]), "chet", 2)
```

As an aside, it's interesting to consider how Apple uses this same abstraction with FoundationDb in administering iCloud. You can imagine users get an entire subspace, and specific apps get a subspace within that user's subspace. 🤔

### `client.transact`

This is how you can transactionally read and write to the database.

```ts
const tx = client.transact()
tx.set(tuple, value)
tx.scan(bounds)
tx.remove(tuple)
tx.commit()
```

Note that when you read through the transaction, the results will be modified by any mutations in the transaction that are waiting to be committed.

When there is a conflicting concurrent transaction, then `commit()` with throw a `ReadWriteConflictError`.

Just to be clear, this is a simple example of how a conflict might happen.

```ts
const chet = client.transact()
const meghan = client.transact()

// Meghan sets her score, then updates the total
Meghan: {
	meghan.set(["score", "meghan"], 2)
	const items = meghan.scan({ prefix: ["score"] })
	const total = items.map(({ value }) => value).reduce((a, b) => a + b, 0)
	meghan.set(["total"], total)
}

Chet: {
	// Meanwhile, Chet writes his score and updates the total.
	chet.set(["score", "chet"], 5)
	const items = meghan.scan({ prefix: ["score"] })
	const total = items.map(({ value }) => value).reduce((a, b) => a + b, 0)
	meghan.set(["total"], total)
}

// Chet commits his writes first conflicting with Meghan's transaction.
chet.commit()

// Meghan commits but we get a conflict error.
assert.throws(() => meghan.commit())
```

To better understand the underlying mechanics of how concurrency control works, please [read the Concurreny Control section](#Concurreny-Control) of this documentation.

### `transactionalReadWrite`

Whenever there is a `ReadWriteConflictError`, all we have to do is keep retrying the transaction until it works without a conflict. Thus is is important that this retry logic is idempotent. We have a convenient helper function for creating these idempotent transactions which will retry when there are conflicts and also has some convenient abstractions for composing transactions.

```ts
const setScore = transactionalReadWrite<GameSchema>()((tx, person: string, score: number) => {
		tx.set(["score", person], score)
		updateTotal(tx)
})

const updateTotal = transactionalReadWrite<GameSchema>()((tx) => {
	const items = tx.scan({ prefix: ["score"] })
	const total = items.map(({ value }) => value).reduce((a, b) => a + b, 0)
	tx.set(["total"], total)
	return total
})

setScore(client, "chet", 12)
```

You'll notice there seems to be an extra `()` in there: `transactionalReadWrite<GameSchema>()((tx, person: string, ...`. That's because we want to tell TypeScript the schema that we're working with, but we want TypeScript also to infer the rest of the arguments as well as the return value. So this is just a TypeScript idiosyncrasy.

`transactionalReadWrite` can accept a client or a transation as its first argument. When the first argument is a client, then it will open and commit a transaction, and retry if there if a conflict. But if the first argument is a transaction, it will simply pass it through without commiting the transaction. This allows these transactional queries to be composed as you can see with `setScore` calling `updateTotal`.

You can also see that `updateTotal` reads *through* the transaction. This means that it will see the updated score from `setScore` and compute the correct total.

You can use `transactionalReadWrite` not just to writes, but also for transactional reads!

### `client.subscribe`

You can listen to any range of tuples and the callback argument will have a list of all sets and removes associated with that range.

```ts

const unsubscribe = client.subscribe({prefix: ["score"]},
	(writes) => {
		console.log(writes)
		// => {
		// 	set: [{ key: ["score", "chet"], value: 2 }],
		// 	remove: [],
		// }
	}
)

setScore(client, "chet", 2)
```

Note that this will ignore any `limit` in your subscription. To efficiently listen to paginated updates, it is recommended to use key bounds instead of limits.

### `subscribeQuery`

Sometimes you need to listen to multiple ranges to derive some information. It can be cumbersome to use `client.subscribe` in these circumstances and for this we can use `subscribeQuery` which keeps track of all ranges and subscriptions for you.

```ts
function getScoreFractionOfTotal(db: ReadOnlyDatabaseClientApi<GameSchema>, person: string) {
	const score = db.get(["score", person]) || 0
	const total = db.get(["total"]) || 0
	return score/total
}

const { result: initialResult, destroy } = subscribeQuery(
	client,
	getScoreFractionOfTotal,
	["chet"],
	(newResult) => {
		// ...
	}
)
```

### `useTupleDatabase`

If you're using React, we've wrapped up `subscribeQuery` into a hook you can use within your application

```ts
import { useTupleDatabase } from "tuple-database/useTupleDatabase"

function App({gameDb, person}) {
	const fraction = useTupleDatabase(gameDb, getScoreFractionOfTotal, [person])
	// ...
}
```

## Comparison with FoundationDb

This database works very similar to FoundationDb. In fact, I've created some abstractions modeled after their API. I've implemented the [class scheduling tutorial](https://apple.github.io/foundationdb/class-scheduling.html) from FoundationDb [as a test in this project](./src/test/classScheduling.test.ts).

However, there are some crucial differences with FoundationDb.

- This database is meant to be embedded, not a mutli-node cluster in the cloud.
- This database also has reactive queries, similar to Firebase.
- FoundationDb relies on the serialization process for running range queries. They do this by simply adding  `\0x00` and `0xff` bytes to the end of a serializied tuple prefix. This is really convenient, but it doesn't work for an in-memory database that does not serialize the data. Serialization for an in-memory database is just an unnecessary performance hit.

# Examples

- [Building a social app with indexes feeds.](./src/examples/socialApp.test.ts) While you probably won't use this database for a social app like Twitter, we can demonstrate the power of this abstraction to index feeds — something you cannot so with SQL. And if you wanted to build a social app, all of these abstractions are transferable to FoundationDb.
- [Building an end-user database with dynamic properties and indexing.](./src/examples/endUserDatabase.test.ts) If you want to build product like Notion or Airtable with indexes database views, then this is the way to do it. (P.S. I built Notion 😉).
- [Using a database for frontend state management.](https://github.com/ccorcos/game-counter/blob/master/src/app/GameDb.ts) When you build a sufficiently complex application, state management runs into many of the same problems as databases — normalization, denormalization, indexing, and reactivity. So wouldn't it be great if we could use a proper database for state management?

# Development


## Reactivity

Reactivity is fundamentally a spatial query problem. We have a set of ranges (scan tuple bounds) `[min, max][]` and we want to find all the ranges that intersect with a value (each tuple in a write).

You cannot efficiently solve this problem in a general way with a basic binary search tree. Instead, you need to use something like a [Segment tree](https://en.wikipedia.org/wiki/Segment_tree). In case the reader is unfamiliar with spatial indexes, a [Interval tree](https://en.wikipedia.org/wiki/Interval_tree) is a more general form of a segment tree allowing you to query with a range, returning overlapping ranges. But a [Range tree](https://en.wikipedia.org/wiki/Range_tree) (a.k.a. rtree) is the general solution for an arbitrary number of dimensions and is typically what is used in, for example, Postgres or SQLite.

Spatial indexes is one of the reasons that calendars are hard to build! However, if you need to build an index for a calendar without access to an rtree index, an acceptible solution is called "space partitioning". And this gives us some insight into a little trick we can use for fairly efficient reactivity using a binary tree.

When you subscribe to a range, e.g. `{gt: [1, 2, 3], lt: [1, 2, 4]}`, we look for a common prefix: `[1, 2]` and use that as a listener key. Then when we write some data, e.g. `[1, 2, 3, 4]`, we iterate through every prefix of that tuple: `[1]`, `[1, 2]`, `[1, 2, 3]` and we lookup listeners on those keys. If we find a listener, we double-check that it within the bounds before we emit and update.

This is a fairly simple performant approach, but at some point, we're going to want to implement a proper rtree index anyways and we'll migrate this over. In the meantime, you can [check out the code](./src/database/async/AsyncReactivityTracker.ts) to get a better understanding of how it works.

## Concurreny Control

Concurreny control is surprisingly simple. Whenever we get a read or a write, we keep track of that in a ConcurrencyLog.

Then on commit, we scan through the log looking for reads on this transaction, and looking for conflicting writes that happened after the read.

```ts
const log = new ConcurrencyLog()

// Someone reads all the scores.
log.read("tx1", { gt: ["score"], lte: ["score", MAX] })

// At the same time, someone writes a score.
log.write("tx2", ["score", "chet"])

// Keeping track of concurrent reads/writes.
assert.deepEqual(log.log, [
	{
		txId: "tx1",
		type: "read",
		bounds: {
			gt: ["score"],
			lte: ["score", MAX],
		},
	},
	{
		txId: "tx2",
		type: "write",
		tuple: ["score", "chet"],
	},
])

// Check for conflicts.
log.commit("tx2")
assert.throws(() => log.commit("tx1"))
```

Most of the logic has to do with cleaning up the log to keep it from growing unbounded. But the [code is pretty simple](./src/database/ConcurrencyLog.ts). It's also worth mentioning that looking for conflicting writes can be formulated as a spatial query as well so we have some performance benefits here when we build an rtree index abstraction.

## Sync/Async APIs

One thing that's been pretty annoying is building async and sync storage abstractions in parallel. That's why `npm run build:macros` will compile async code into sync code for us.

Ideally we'd use a proper TypeScript parser rather than a home-grown regex.

## Brenchmark

We have a simple benchmark that read and writes a bunch. Mostly so we can compare between storage engines. This benchmark currenly does 11000 operations. 10000 reads and 1000 writes. So we're looking at fractions of a millisecond per operation.

```
AsyncTupleDatabase(InMemoryTupleStorage)):initialize 24.359458923339844
AsyncTupleDatabase(InMemoryTupleStorage)):readRemoveWrite 1289.2781257629395
AsyncTupleDatabase(SQLiteTupleStorage)):initialize 198.56974983215332
AsyncTupleDatabase(SQLiteTupleStorage)):readRemoveWrite 9325.776041984558
AsyncTupleDatabase(LevelTupleStorage)):initialize 61.02045822143555
AsyncTupleDatabase(LevelTupleStorage)):readRemoveWrite 2224.8067083358765
```

## Future Work

- Seeing as how LevelDb is about 4x faster than SQLite, it seems like a reasonable idea to build a custom storage engine in a memory managed language (like C, Zig, or Rust). We would also be able to avoid the encoding cost and I can imagine a 10x performance boost from a fairly simple implementation. That said, SQLite is a gold standard for flat-file storage.

- It's only a matter of time before we will spatial queries. Maybe it's coordinates on a map, an infinite canvas drawing app, or a calendar app. But it's going to happen. And we could already use it to improve reactivity performance. Plan is to implement an rtree abstraction.

- It would be nice if we could replicate / sync this database. Maybe we only want to replicate some subspaces p2p with another client, or maybe we just want to have a backup somewhere.

> 👋 If you're interested in working on this project with me, [send me an email](mailto:ccorcos@gmail.com)!
