import { sumBy } from "../../helpers/remeda.js"
import { shuffle } from "../../helpers/remeda.js"
import { describe, it, expect } from "bun:test"
import { randomId } from "../../helpers/randomId.js"
import { KeyValuePair, MAX, MIN, WriteOps } from "../../storage/types.js"
import { sortedValues } from "../../test/fixtures.js"
import { transactionalWrite } from "../transactionalWrite.js"
import { Assert } from "../typeHelpers.js"
import {
	AsyncTupleDatabaseClientApi,
	AsyncTupleTransactionApi,
} from "./asyncTypes.js"
import { subscribeQueryAsync } from "./subscribeQueryAsync.js"
import { transactionalReadWriteAsync } from "./transactionalReadWriteAsync.js"

const isSync = false

export function asyncDatabaseTestSuite(
	name: string,
	createStorage: <S extends KeyValuePair = { key: any[]; value: any }>(
		id: string
	) => AsyncTupleDatabaseClientApi<S>,
	durable = true
) {
	describe(name, () => {
		it("inserts in correct order", async () => {
			const store = createStorage(randomId())
			const items: KeyValuePair[] = [
				{ key: ["a", "a", "a"], value: 1 },
				{ key: ["a", "a", "b"], value: 2 },
				{ key: ["a", "a", "c"], value: 3 },
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
				{ key: ["a", "c", "a"], value: 7 },
				{ key: ["a", "c", "b"], value: 8 },
				{ key: ["a", "c", "c"], value: 9 },
			]
			const transaction = store.transact()
			for (const { key, value } of shuffle(items)) {
				transaction.set(key, value)
			}
			await transaction.commit()
			const data = await store.scan()
			expect(data).toEqual(items)
		})

		it("inserting the same thing gets deduplicated", async () => {
			const store = createStorage(randomId())
			const transaction = store.transact()
			transaction.set(["a", "a"], 0)
			transaction.set(["a", "a"], 0)
			await transaction.commit()
			const data = await store.scan()
			expect(data).toEqual([{ key: ["a", "a"], value: 0 }])
		})

		it("updates will overwrite the value", async () => {
			const store = createStorage(randomId())
			const transaction = store.transact()
			transaction.set(["a", "a"], 0)
			transaction.set(["a", "a"], 1)
			await transaction.commit()
			const data = await store.scan()
			expect(data).toEqual([{ key: ["a", "a"], value: 1 }])
		})

		it("transaction value overwrites works", async () => {
			const store = createStorage(randomId())
			const transaction = store.transact()
			transaction.set(["a", "a"], 0)
			await transaction.commit()
			const data = await store.scan()
			expect(data).toEqual([{ key: ["a", "a"], value: 0 }])

			const transaction2 = store.transact()
			transaction2.set(["a", "a"], 1)
			const data2 = await transaction2.scan()
			expect(data2).toEqual([{ key: ["a", "a"], value: 1 }])

			await transaction2.commit()
			const data3 = await store.scan()
			expect(data3).toEqual([{ key: ["a", "a"], value: 1 }])
		})

		it("tx.scan limit and removes items correctly", async () => {
			const store = createStorage(randomId())

			await store.commit({
				set: [
					{ key: [1], value: null },
					{ key: [2], value: null },
					{ key: [3], value: null },
				],
			})

			const transaction = store.transact()
			transaction.remove([1])
			transaction.remove([2])

			const dataNoLimit = await transaction.scan()
			expect(dataNoLimit).toEqual([{ key: [3], value: null }])

			const data = await transaction.scan({ limit: 1 })
			expect(data).toEqual([{ key: [3], value: null }])
		})

		it("inserts the same thing gets deduplicated with ids", async () => {
			const store = createStorage(randomId())
			await store
				.transact()
				.set(["a", { uuid: "a" }], 0)
				.set(["a", { uuid: "a" }], 0)
				.commit()
			const data = await store.scan()
			expect(data.length).toEqual(1)
		})

		it("inserts get deduplicated in separate transactions", async () => {
			const store = createStorage(randomId())

			await store
				.transact()
				.set(["a", { uuid: "a" }], 0)
				.commit()

			await store
				.transact()
				.set(["a", { uuid: "a" }], 0)
				.commit()

			const data = await store.scan()
			expect(data.length).toEqual(1)
		})

		it("inserts get deduplicated set/remove in same transaction", async () => {
			const store = createStorage(randomId())

			await store
				.transact()
				.set(["a", { uuid: "a" }], 0)
				.remove(["a", { uuid: "a" }])
				.commit()

			const data = await store.scan()
			expect(data.length).toEqual(0)
		})

		it("inserts get deduplicated remove/set in same transaction", async () => {
			const store = createStorage(randomId())

			await store
				.transact()
				.remove(["a", { uuid: "a" }])
				.set(["a", { uuid: "a" }], 0)
				.commit()

			const data = await store.scan()
			expect(data.length).toEqual(1)
		})

		it("inserts get deduplicated set/remove in same transaction with initial tuple", async () => {
			const store = createStorage(randomId())

			await store
				.transact()
				.set(["a", { uuid: "a" }], 0)
				.commit()

			await store
				.transact()
				.set(["a", { uuid: "a" }], 1)
				.remove(["a", { uuid: "a" }])
				.commit()

			const data = await store.scan()
			expect(data.length).toEqual(0)
		})

		it("inserts get deduplicated remove/set in same transaction with initial tuple", async () => {
			const store = createStorage(randomId())

			await store
				.transact()
				.set(["a", { uuid: "a" }], 0)
				.commit()

			await store
				.transact()
				.remove(["a", { uuid: "a" }])
				.set(["a", { uuid: "a" }], 1)
				.commit()

			const data = await store.scan()
			expect(data.length).toEqual(1)
		})

		it("removes items correctly", async () => {
			const store = createStorage(randomId())

			const items: KeyValuePair[] = [
				{ key: ["a", "a", "a"], value: 1 },
				{ key: ["a", "a", "b"], value: 2 },
				{ key: ["a", "a", "c"], value: 3 },
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
				{ key: ["a", "c", "a"], value: 7 },
				{ key: ["a", "c", "b"], value: 8 },
				{ key: ["a", "c", "c"], value: 9 },
			]
			const transaction = store.transact()
			for (const { key, value } of shuffle(items)) {
				transaction.set(key, value)
			}
			expect(await transaction.scan()).toEqual(items)

			transaction.remove(["a", "a", "c"])
			transaction.remove(["a", "c", "a"])
			transaction.remove(["a", "b", "b"])

			const data = await transaction.scan()
			expect(data).toEqual([
				{ key: ["a", "a", "a"], value: 1 },
				{ key: ["a", "a", "b"], value: 2 },
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "c"], value: 6 },
				{ key: ["a", "c", "b"], value: 8 },
				{ key: ["a", "c", "c"], value: 9 },
			])
			await transaction.commit()
			expect(await store.scan()).toEqual(data)
		})

		it("transaction.write()", async () => {
			const store = createStorage(randomId())

			const items: KeyValuePair[] = [
				{ key: ["a", "a", "a"], value: 1 },
				{ key: ["a", "a", "b"], value: 2 },
				{ key: ["a", "a", "c"], value: 3 },
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
				{ key: ["a", "c", "a"], value: 7 },
				{ key: ["a", "c", "b"], value: 8 },
				{ key: ["a", "c", "c"], value: 9 },
			]

			await store.transact().write({ set: items }).commit()
			let data = await store.scan()
			expect(data).toEqual(items)

			await store
				.transact()
				.write({
					remove: [
						["a", "b", "a"],
						["a", "b", "b"],
						["a", "b", "c"],
					],
				})
				.commit()

			data = await store.scan()
			expect(data).toEqual([
				{ key: ["a", "a", "a"], value: 1 },
				{ key: ["a", "a", "b"], value: 2 },
				{ key: ["a", "a", "c"], value: 3 },
				{ key: ["a", "c", "a"], value: 7 },
				{ key: ["a", "c", "b"], value: 8 },
				{ key: ["a", "c", "c"], value: 9 },
			])
		})

		it("scan gt", async () => {
			const store = createStorage(randomId())

			const items: KeyValuePair[] = [
				{ key: ["a", "a", "a"], value: 1 },
				{ key: ["a", "a", "b"], value: 2 },
				{ key: ["a", "a", "c"], value: 3 },
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
				{ key: ["a", "c", "a"], value: 7 },
				{ key: ["a", "c", "b"], value: 8 },
				{ key: ["a", "c", "c"], value: 9 },
			]
			const transaction = store.transact()
			for (const { key, value } of shuffle(items)) {
				transaction.set(key, value)
			}
			await transaction.commit()
			const data = await store.scan()
			expect(data).toEqual(items)

			const result = await store.scan({
				gt: ["a", "a", MAX],
			})

			expect(result).toEqual([
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
				{ key: ["a", "c", "a"], value: 7 },
				{ key: ["a", "c", "b"], value: 8 },
				{ key: ["a", "c", "c"], value: 9 },
			])
		})

		it("scan gt/lt", async () => {
			const store = createStorage(randomId())

			const items: KeyValuePair[] = [
				{ key: ["a", "a", "a"], value: 1 },
				{ key: ["a", "a", "b"], value: 2 },
				{ key: ["a", "a", "c"], value: 3 },
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
				{ key: ["a", "c", "a"], value: 7 },
				{ key: ["a", "c", "b"], value: 8 },
				{ key: ["a", "c", "c"], value: 9 },
			]
			const transaction = store.transact()
			for (const { key, value } of shuffle(items)) {
				transaction.set(key, value)
			}
			await transaction.commit()
			const data = await store.scan()
			expect(data).toEqual(items)

			const result = await store.scan({
				gt: ["a", "a", MAX],
				lt: ["a", "c", MIN],
			})

			expect(result).toEqual([
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
			])

			const result2 = await store.scan({
				gt: ["a", "b", MIN],
				lt: ["a", "b", MAX],
			})

			expect(result2).toEqual([
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
			])
		})

		it("scan prefix", async () => {
			const store = createStorage(randomId())

			const items: KeyValuePair[] = [
				{ key: ["a", "a", "a"], value: 1 },
				{ key: ["a", "a", "b"], value: 2 },
				{ key: ["a", "a", "c"], value: 3 },
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
				{ key: ["a", "c", "a"], value: 7 },
				{ key: ["a", "c", "b"], value: 8 },
				{ key: ["a", "c", "c"], value: 9 },
			]
			const transaction = store.transact()
			for (const { key, value } of shuffle(items)) {
				transaction.set(key, value)
			}
			await transaction.commit()
			const data = await store.scan()
			expect(data).toEqual(items)

			const result = await store.scan({
				prefix: ["a", "b"] as any[],
			})

			expect(result).toEqual([
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
			])
		})

		it("scan prefix - issue with MAX being true", async () => {
			const store = createStorage(randomId())

			const items: KeyValuePair[] = [
				{ key: [2, true], value: 1 },
				{ key: [2, true, 1], value: 1 },
				{ key: [2, true, true], value: 1 },
				{ key: [2, true, true, 1], value: 1 },
				{ key: [2, true, true, true], value: 1 },
				{ key: [2, true, true, true, 1], value: 1 },
			]
			const transaction = store.transact()
			for (const { key, value } of shuffle(items)) {
				transaction.set(key, value)
			}
			await transaction.commit()
			const data = await store.scan()
			expect(data).toEqual(items)

			const result = await store.scan({ prefix: [2] })
			expect(result as KeyValuePair[]).toEqual(items)
		})

		it("scan prefix gte/lte", async () => {
			const store = createStorage(randomId())

			const items: KeyValuePair[] = [
				{ key: ["a", "a", "a"], value: 1 },
				{ key: ["a", "a", "b"], value: 2 },
				{ key: ["a", "a", "c"], value: 3 },
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
				{ key: ["a", "b", "d"], value: 6.5 },
				{ key: ["a", "c", "a"], value: 7 },
				{ key: ["a", "c", "b"], value: 8 },
				{ key: ["a", "c", "c"], value: 9 },
			]

			const transaction = store.transact()
			for (const { key, value } of shuffle(items)) {
				transaction.set(key, value)
			}
			await transaction.commit()
			const data = await store.scan()
			expect(data).toEqual(items)

			const result = await store.scan({
				prefix: ["a", "b"] as any[],
				gte: ["b"],
				lte: ["d"],
			})

			expect(result).toEqual([
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
				{ key: ["a", "b", "d"], value: 6.5 },
			])
		})

		it("Scan args types work.", () => {
			type Schema = {
				key: ["aveo", string, number]
				value: null
			}
			const db = createStorage<Schema>(randomId())
			db.subspace(["aveo"]).scan({ gte: ["title"] })
		})

		it("scan prefix gte/lte with schema types", async () => {
			type Schema =
				| { key: ["a", "a", "a"]; value: 1 }
				| { key: ["a", "a", "b"]; value: 2 }
				| { key: ["a", "a", "c"]; value: 3 }
				| { key: ["a", "b", "a"]; value: 4 }
				| { key: ["a", "b", "b"]; value: 5 }
				| { key: ["a", "b", "c"]; value: 6 }
				| { key: ["a", "b", "d"]; value: 6.5 }
				| { key: ["a", "c", "a"]; value: 7 }
				| { key: ["a", "c", "b"]; value: 8 }
				| { key: ["a", "c", "c"]; value: 9 }

			const store = createStorage<Schema>(randomId())

			const items: Schema[] = [
				{ key: ["a", "a", "a"], value: 1 },
				{ key: ["a", "a", "b"], value: 2 },
				{ key: ["a", "a", "c"], value: 3 },
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
				{ key: ["a", "b", "d"], value: 6.5 },
				{ key: ["a", "c", "a"], value: 7 },
				{ key: ["a", "c", "b"], value: 8 },
				{ key: ["a", "c", "c"], value: 9 },
			]

			const transaction = store.transact()
			for (const { key, value } of shuffle(items)) {
				transaction.set(key, value)
			}
			await transaction.commit()
			const data = await store.scan()
			expect(data).toEqual(items)

			const result = await store.scan({
				prefix: ["a", "b"],
				gte: ["b"],
				lte: ["d"],
			})

			expect(result).toEqual([
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
				{ key: ["a", "b", "d"], value: 6.5 },
			])
		})

		it("scan gte", async () => {
			const store = createStorage(randomId())

			const items: KeyValuePair[] = [
				{ key: ["a", "a", "a"], value: 1 },
				{ key: ["a", "a", "b"], value: 2 },
				{ key: ["a", "a", "c"], value: 3 },
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
				{ key: ["a", "c", "a"], value: 7 },
				{ key: ["a", "c", "b"], value: 8 },
				{ key: ["a", "c", "c"], value: 9 },
			]
			const transaction = store.transact()
			for (const { key, value } of shuffle(items)) {
				transaction.set(key, value)
			}
			await transaction.commit()
			const data = await store.scan()
			expect(data).toEqual(items)

			const result = await store.scan({
				gte: ["a", "b", "a"],
			})

			expect(result).toEqual([
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
				{ key: ["a", "c", "a"], value: 7 },
				{ key: ["a", "c", "b"], value: 8 },
				{ key: ["a", "c", "c"], value: 9 },
			])
		})

		it("scan gte/lte", async () => {
			const store = createStorage(randomId())

			const items: KeyValuePair[] = [
				{ key: ["a", "a", "a"], value: 1 },
				{ key: ["a", "a", "b"], value: 2 },
				{ key: ["a", "a", "c"], value: 3 },
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
				{ key: ["a", "c", "a"], value: 7 },
				{ key: ["a", "c", "b"], value: 8 },
				{ key: ["a", "c", "c"], value: 9 },
			]
			const transaction = store.transact()
			for (const { key, value } of shuffle(items)) {
				transaction.set(key, value)
			}
			await transaction.commit()
			const data = await store.scan()
			expect(data).toEqual(items)

			const result = await store.scan({
				gte: ["a", "a", "c"],
				lte: ["a", "c", MAX],
			})

			expect(result).toEqual([
				{ key: ["a", "a", "c"], value: 3 },
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
				{ key: ["a", "c", "a"], value: 7 },
				{ key: ["a", "c", "b"], value: 8 },
				{ key: ["a", "c", "c"], value: 9 },
			])
		})

		it("scan gte/lte with schema types", async () => {
			type Schema =
				| { key: ["a", "a", "a"]; value: 1 }
				| { key: ["a", "a", "b"]; value: 2 }
				| { key: ["a", "a", "c"]; value: 3 }
				| { key: ["a", "b", "a"]; value: 4 }
				| { key: ["a", "b", "b"]; value: 5 }
				| { key: ["a", "b", "c"]; value: 6 }
				| { key: ["a", "c", "a"]; value: 7 }
				| { key: ["a", "c", "b"]; value: 8 }
				| { key: ["a", "c", "c"]; value: 9 }

			const store = createStorage<Schema>(randomId())

			const items: Schema[] = [
				{ key: ["a", "a", "a"], value: 1 },
				{ key: ["a", "a", "b"], value: 2 },
				{ key: ["a", "a", "c"], value: 3 },
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
				{ key: ["a", "c", "a"], value: 7 },
				{ key: ["a", "c", "b"], value: 8 },
				{ key: ["a", "c", "c"], value: 9 },
			]
			const transaction = store.transact()
			for (const { key, value } of shuffle(items)) {
				transaction.set(key, value)
			}
			await transaction.commit()
			const data = await store.scan()
			expect(data).toEqual(items)

			const result = await store.scan({
				gte: ["a", "a", "c"],
				lte: ["a", "c", MAX],
			})

			expect(result).toEqual([
				{ key: ["a", "a", "c"], value: 3 },
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
				{ key: ["a", "c", "a"], value: 7 },
				{ key: ["a", "c", "b"], value: 8 },
				{ key: ["a", "c", "c"], value: 9 },
			])
		})

		it("scan sorted gt", async () => {
			const store = createStorage(randomId())

			const items: KeyValuePair[] = [
				{ key: ["a", "a", "a"], value: 1 },
				{ key: ["a", "a", "b"], value: 2 },
				{ key: ["a", "a", "c"], value: 3 },
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
				{ key: ["a", "c", "a"], value: 7 },
				{ key: ["a", "c", "b"], value: 8 },
				{ key: ["a", "c", "c"], value: 9 },
			]
			const transaction = store.transact()
			for (const { key, value } of shuffle(items)) {
				transaction.set(key, value)
			}
			await transaction.commit()
			const data = await store.scan()
			expect(data).toEqual(items)

			const result = await store.scan({
				gt: ["a", "b", MAX],
			})

			expect(result).toEqual([
				{ key: ["a", "c", "a"], value: 7 },
				{ key: ["a", "c", "b"], value: 8 },
				{ key: ["a", "c", "c"], value: 9 },
			])
		})

		it("scan sorted gt/lt", async () => {
			const store = createStorage(randomId())

			const items: KeyValuePair[] = [
				{ key: ["a", "a", "a"], value: 1 },
				{ key: ["a", "a", "b"], value: 2 },
				{ key: ["a", "a", "c"], value: 3 },
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
				{ key: ["a", "c", "a"], value: 7 },
				{ key: ["a", "c", "b"], value: 8 },
				{ key: ["a", "c", "c"], value: 9 },
			]
			const transaction = store.transact()
			for (const { key, value } of shuffle(items)) {
				transaction.set(key, value)
			}
			await transaction.commit()
			const data = await store.scan()
			expect(data).toEqual(items)

			const result = await store.scan({
				gt: ["a", "a", MAX],
				lt: ["a", "b", MAX],
			})

			expect(result).toEqual([
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
			])
		})

		it("scan sorted gte", async () => {
			const store = createStorage(randomId())

			const items: KeyValuePair[] = [
				{ key: ["a", "a", "a"], value: 1 },
				{ key: ["a", "a", "b"], value: 2 },
				{ key: ["a", "a", "c"], value: 3 },
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
				{ key: ["a", "c", "a"], value: 7 },
				{ key: ["a", "c", "b"], value: 8 },
				{ key: ["a", "c", "c"], value: 9 },
			]
			const transaction = store.transact()
			for (const { key, value } of shuffle(items)) {
				transaction.set(key, value)
			}
			await transaction.commit()
			const data = await store.scan()
			expect(data).toEqual(items)

			const result = await store.scan({
				gte: ["a", "b", MIN],
			})

			expect(result).toEqual([
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
				{ key: ["a", "c", "a"], value: 7 },
				{ key: ["a", "c", "b"], value: 8 },
				{ key: ["a", "c", "c"], value: 9 },
			])
		})

		it("scan sorted gte/lte", async () => {
			const store = createStorage(randomId())

			const items: KeyValuePair[] = [
				{ key: ["a", "a", "a"], value: 1 },
				{ key: ["a", "a", "b"], value: 2 },
				{ key: ["a", "a", "c"], value: 3 },
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
				{ key: ["a", "c", "a"], value: 7 },
				{ key: ["a", "c", "b"], value: 8 },
				{ key: ["a", "c", "c"], value: 9 },
			]
			const transaction = store.transact()
			for (const { key, value } of shuffle(items)) {
				transaction.set(key, value)
			}
			await transaction.commit()
			const data = await store.scan()
			expect(data).toEqual(items)

			const result = await store.scan({
				gte: ["a", "a", "c"],
				lte: ["a", "b", MAX],
			})

			expect(result).toEqual([
				{ key: ["a", "a", "c"], value: 3 },
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
			])
		})

		// TODO: this test is inconsistent across stores, should enforce some common error or no error (no results)
		it.skip("scan invalid bounds", async () => {
			const store = createStorage(randomId())

			const items: KeyValuePair[] = [
				{ key: ["a", "a", "a"], value: 1 },
				{ key: ["a", "a", "b"], value: 2 },
				{ key: ["a", "a", "c"], value: 3 },
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
				{ key: ["a", "c", "a"], value: 7 },
				{ key: ["a", "c", "b"], value: 8 },
				{ key: ["a", "c", "c"], value: 9 },
			]
			const transaction = store.transact()
			for (const { key, value } of shuffle(items)) {
				transaction.set(key, value)
			}
			await transaction.commit()
			const data = await store.scan()
			expect(data).toEqual(items)
			expect(async () => {
				await store.scan({
					gte: ["a", "c"],
					lte: ["a", "a"],
				})
			}).toThrow()
		})

		it("stores all types of values", async () => {
			const store = createStorage(randomId())
			const items: KeyValuePair[] = sortedValues.map(
				(item, i) => ({ key: [item], value: i } as KeyValuePair)
			)
			const transaction = store.transact()
			for (const { key, value } of shuffle(items)) {
				transaction.set(key, value)
			}
			await transaction.commit()
			const data = await store.scan()
			expect(data).toEqual(items)
		})

		it("transaction overwrites when scanning data out", async () => {
			const store = createStorage(randomId())

			const items: KeyValuePair[] = [
				{ key: ["a", "a", "a"], value: 1 },
				{ key: ["a", "a", "b"], value: 2 },
				{ key: ["a", "a", "c"], value: 3 },
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
				{ key: ["a", "c", "a"], value: 7 },
				{ key: ["a", "c", "b"], value: 8 },
				{ key: ["a", "c", "c"], value: 9 },
			]
			const transaction = store.transact()
			for (const { key, value } of shuffle(items)) {
				transaction.set(key, value)
			}
			await transaction.commit()
			const data = await store.scan()
			expect(data).toEqual(items)

			const result = await store.scan({ prefix: ["a", "b"] as any[] })

			expect(result).toEqual([
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
			])

			const transaction2 = store.transact()
			transaction2.set(["a", "b", "b"], 99)
			const result2 = await transaction2.scan({ prefix: ["a", "b"] as any[] })
			expect(result2).toEqual([
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 99 },
				{ key: ["a", "b", "c"], value: 6 },
			])
		})

		it("get", async () => {
			const store = createStorage(randomId())

			const items: KeyValuePair[] = [
				{ key: ["a", "a", "a"], value: 1 },
				{ key: ["a", "a", "b"], value: 2 },
				{ key: ["a", "a", "c"], value: 3 },
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
				{ key: ["a", "c", "a"], value: 7 },
				{ key: ["a", "c", "b"], value: 8 },
				{ key: ["a", "c", "c"], value: 9 },
			]
			const transaction = store.transact()
			for (const { key, value } of shuffle(items)) {
				transaction.set(key, value)
			}
			await transaction.commit()

			expect(await store.get(["a", "a", "c"])).toEqual(3)
			expect(await store.get(["a", "c", "c"])).toEqual(9)
			expect(await store.get(["a", "c", "d"])).toEqual(undefined)
		})

		it("transaction overwrites get", async () => {
			const store = createStorage(randomId())

			await store.transact().set(["a"], 1).set(["b"], 2).set(["c"], 3).commit()

			const tr = store.transact()
			tr.set(["a"], 2)
			expect(await store.get(["a"])).toEqual(1)
			expect(await tr.get(["a"])).toEqual(2)

			tr.remove(["b"])
			expect(await store.get(["b"])).toEqual(2)
			expect(await tr.get(["b"])).toEqual(undefined)

			tr.set(["d"], 99)
			expect(await store.get(["d"])).toEqual(undefined)
			expect(await tr.get(["d"])).toEqual(99)
		})

		it("exists", async () => {
			const store = createStorage(randomId())

			const items: KeyValuePair[] = [
				{ key: ["a", "a", "a"], value: 1 },
				{ key: ["a", "a", "b"], value: 2 },
				{ key: ["a", "a", "c"], value: 3 },
				{ key: ["a", "b", "a"], value: 4 },
				{ key: ["a", "b", "b"], value: 5 },
				{ key: ["a", "b", "c"], value: 6 },
				{ key: ["a", "c", "a"], value: 7 },
				{ key: ["a", "c", "b"], value: 8 },
				{ key: ["a", "c", "c"], value: 9 },
			]
			const transaction = store.transact()
			for (const { key, value } of shuffle(items)) {
				transaction.set(key, value)
			}
			await transaction.commit()

			expect(await store.exists(["a", "a", "c"])).toEqual(true)
			expect(await store.exists(["a", "c", "c"])).toEqual(true)
			expect(await store.exists(["a", "c", "d"])).toEqual(false)
		})

		it("transaction overwrites exists", async () => {
			const store = createStorage(randomId())

			await store.transact().set(["a"], 1).set(["b"], 2).set(["c"], 3).commit()

			const tr = store.transact()
			tr.set(["a"], 2)
			expect(await store.exists(["a"])).toEqual(true)
			expect(await tr.exists(["a"])).toEqual(true)

			tr.remove(["b"])
			expect(await store.exists(["b"])).toEqual(true)
			expect(await tr.exists(["b"])).toEqual(false)

			tr.set(["d"], 99)
			expect(await store.exists(["d"])).toEqual(false)
			expect(await tr.exists(["d"])).toEqual(true)
		})

		it("committing a transaction prevents any further interaction", async () => {
			const store = createStorage(randomId())
			const tx = store.transact()
			await tx.commit()

			expect(() => tx.get([1])).toThrow()
			expect(() => tx.get([1])).toThrow()
			expect(() => tx.exists([1])).toThrow()
			expect(() => tx.scan()).toThrow()
			expect(() => tx.write({})).toThrow()
			expect(() => tx.set([1], 2)).toThrow()
			expect(() => tx.remove([1])).toThrow()
			expect(() => tx.cancel()).toThrow()
			expect(() => tx.commit()).toThrow()
		})

		it("canceling a transaction prevents any further interaction", async () => {
			const store = createStorage(randomId())
			const tx = store.transact()
			await tx.cancel()

			expect(() => tx.get([1])).toThrow()
			expect(() => tx.exists([1])).toThrow()
			expect(() => tx.scan()).toThrow()
			expect(() => tx.write({})).toThrow()
			expect(() => tx.set([1], 2)).toThrow()
			expect(() => tx.remove([1])).toThrow()
			expect(() => tx.cancel()).toThrow()
			expect(() => tx.commit()).toThrow()
		})

		it("cancelling a transaction does not submit writes", async () => {
			const store = createStorage(randomId())
			const tx = store.transact()
			tx.set([1], 2)
			expect(await tx.get([1])).toEqual(2)
			await tx.cancel()

			expect(await store.get([1])).toEqual(undefined)
		})

		it("root transaction can be recomposed", async () => {
			const store = createStorage(randomId())
			const tx = store.transact()
			tx.set([1], 2)

			const tx2 = store.transact(tx.id, tx.writes)
			await tx2.commit()

			expect(await store.scan()).toEqual([{ key: [1], value: 2 }])
		})

		it.todo("cancelled transaction cannot conflict with other transactions")

		describe("application-level indexing", () => {
			it("bidirectional friends stored as keys", async () => {
				const store = createStorage(randomId())

				function setAEV(
					[a, e, v]: [string, string, string],
					tx: AsyncTupleTransactionApi
				) {
					tx.set([a, e, v], null)
					if (a === "friend") tx.set([a, v, e], null)
				}

				function removeAEV(
					[a, e, v]: [string, string, string],
					tx: AsyncTupleTransactionApi
				) {
					tx.remove([a, e, v])
					if (a === "friend") tx.remove([a, v, e])
				}

				const items: [string, string, string][] = [
					["friend", "a", "b"],
					["friend", "a", "c"],
					["friend", "b", "c"],
					["name", "a", "Chet"],
					["name", "b", "Meghan"],
					["name", "c", "Andrew"],
				]
				const transaction = store.transact()
				for (const key of shuffle(items)) {
					setAEV(key, transaction)
				}
				await transaction.commit()

				let result = (await store.scan()).map(({ key }) => key)

				expect(result).toEqual([
					["friend", "a", "b"],
					["friend", "a", "c"],
					["friend", "b", "a"],
					["friend", "b", "c"],
					["friend", "c", "a"],
					["friend", "c", "b"],
					["name", "a", "Chet"],
					["name", "b", "Meghan"],
					["name", "c", "Andrew"],
				])

				const tx = store.transact()
				removeAEV(["friend", "a", "b"], tx)
				result = (await tx.scan()).map(({ key }) => key)

				expect(result).toEqual([
					["friend", "a", "c"],
					["friend", "b", "c"],
					["friend", "c", "a"],
					["friend", "c", "b"],
					["name", "a", "Chet"],
					["name", "b", "Meghan"],
					["name", "c", "Andrew"],
				])

				setAEV(["friend", "d", "a"], tx)
				result = (await tx.scan()).map(({ key }) => key)

				expect(result).toEqual([
					["friend", "a", "c"],
					["friend", "a", "d"],
					["friend", "b", "c"],
					["friend", "c", "a"],
					["friend", "c", "b"],
					["friend", "d", "a"],
					["name", "a", "Chet"],
					["name", "b", "Meghan"],
					["name", "c", "Andrew"],
				])
			})

			it("indexing objects stored as values", async () => {
				const store = createStorage(randomId())

				type Person = { id: number; first: string; last: string; age: number }

				async function setPerson(person: Person, tx: AsyncTupleTransactionApi) {
					const prev = await tx.get(["personById", person.id])
					if (prev) {
						tx.remove(["personByAge", prev.age, prev.id])
					}

					tx.set(["personById", person.id], person)
					tx.set(["personByAge", person.age, person.id], person)
				}

				async function removePerson(
					personId: number,
					tx: AsyncTupleTransactionApi
				) {
					const prev = await tx.get(["personById", personId])
					if (prev) {
						tx.remove(["personByAge", prev.age, prev.id])
						tx.remove(["personById", prev.id])
					}
				}

				const people: Person[] = [
					{ id: 1, first: "Chet", last: "Corcos", age: 29 },
					{ id: 2, first: "Simon", last: "Last", age: 26 },
					{ id: 3, first: "Jon", last: "Schwartz", age: 30 },
					{ id: 4, first: "Luke", last: "Hansen", age: 29 },
				]

				const transaction = store.transact()
				for (const person of shuffle(people)) {
					await setPerson(person, transaction)
				}
				await transaction.commit()
				const scanResults = await store.scan()
				let result = scanResults.map(({ key }) => key)
				expect(result).toEqual([
					["personByAge", 26, 2],
					["personByAge", 29, 1],
					["personByAge", 29, 4],
					["personByAge", 30, 3],
					["personById", 1],
					["personById", 2],
					["personById", 3],
					["personById", 4],
				])

				const tx = store.transact()
				await removePerson(3, tx)
				result = (await tx.scan()).map(({ key }) => key)

				expect(result).toEqual([
					["personByAge", 26, 2],
					["personByAge", 29, 1],
					["personByAge", 29, 4],
					["personById", 1],
					["personById", 2],
					["personById", 4],
				])

				await setPerson(
					{
						id: 1,
						first: "Chet",
						last: "Corcos",
						age: 30,
					},
					tx
				)

				result = (await tx.scan()).map(({ key }) => key)

				expect(result).toEqual([
					["personByAge", 26, 2],
					["personByAge", 29, 4],
					["personByAge", 30, 1],
					["personById", 1],
					["personById", 2],
					["personById", 4],
				])
			})
		})

		describe("MVCC - Multi-version Concurrency Control", () => {
			// Basically, concurrent transactional read-writes.

			it("works", async () => {
				const id = randomId()
				const store = createStorage(id)

				// The lamp is off
				store.commit({ set: [{ key: ["lamp"], value: false }] })

				// Chet wants the lamp on, Meghan wants the lamp off.
				const chet = store.transact()
				const meghan = store.transact()

				// Chet turns it on if its off.
				if (!(await chet.get(["lamp"]))) chet.set(["lamp"], true)

				// Meghan turns it off if its on.
				if (await meghan.get(["lamp"])) meghan.set(["lamp"], false)

				// Someone has to lose. Whoever commits first wins.
				await chet.commit()
				await expect(() => meghan.commit()).toThrow()
				expect(await store.get(["lamp"])).toEqual(true)

				// Meghan will have to try again.
				const meghan2 = store.transact()
				if (await meghan2.get(["lamp"])) meghan2.set(["lamp"], false)
				await meghan2.commit()

				// And she has her way.
				expect(await store.get(["lamp"])).toEqual(false)
			})

			// This test has an unexpected behavior with LMDBTupleStorage
			// I believe this is because the reads are not actually async as expected, so the methods in the test arent all running in the expected order.
			if (!isSync && !name.includes("LMDBTupleStorage")) {
				it("transactionalAsyncQuery will retry on those errors", async () => {
					const id = randomId()
					type Schema = { key: ["score"]; value: number }
					const store = createStorage<Schema>(id)

					await store.commit({ set: [{ key: ["score"], value: 0 }] })

					const sleep = (timeMs: number) =>
						new Promise((resolve) => setTimeout(resolve, timeMs))

					const incScore = transactionalReadWriteAsync<Schema>()(
						async (tx, amount: number, sleepMs: number) => {
							const score = (await tx.get(["score"]))!
							await sleep(sleepMs)
							tx.set(["score"], score + amount)
						}
					)

					// 0 -> chet reads
					// 1 -> meghan reads
					// 2 -> chet writes
					// 3 -> meghan writes -- conflict!
					// 3 -> meghan reads -- retry
					// 4 -> meghan writes -- success!

					async function chet() {
						await incScore(store, 10, 2)
						expect(await store.get(["score"])).toEqual(10)
					}

					async function meghan() {
						await sleep(1)
						await incScore(store, -1, 2)
						expect(await store.get(["score"])).toEqual(9)
					}

					await Promise.all([chet(), meghan()])

					// Final state.
					expect(await store.get(["score"])).toEqual(9)
				})
			}

			it("should probably generalize to scans as well", async () => {
				const id = randomId()
				type Schema =
					| { key: ["player", string, number]; value: null }
					| { key: ["total", number]; value: null }
				const store = createStorage<Schema>(id)
				await store.commit({
					set: [
						// TODO: add test using value as well.
						{ key: ["player", "chet", 0], value: null },
						{ key: ["player", "meghan", 0], value: null },
						{ key: ["total", 0], value: null },
					],
				})

				// We have a score keeping game.
				const addScore = transactionalReadWriteAsync<Schema>()(
					async (tx, player: string, inc: number) => {
						// It has this miserable api, lol.
						const getPlayerScore = async (player: string) => {
							const pairs = await tx.scan({ prefix: ["player", player] })
							if (pairs.length !== 1) throw new Error("Missing player.")
							const [{ key }] = pairs
							return key[2]
						}

						const getCurrentTotal = async () => {
							const totals = await tx.scan({ prefix: ["total"] })
							if (totals.length !== 1) throw new Error("Too many totals.")
							const [{ key }] = totals
							return key[1]
						}

						const resetTotal = async () => {
							const pairs = await tx.scan({ prefix: ["player"] })
							const total = sumBy(pairs, ({ key }) => key[2])
							tx.remove(["total", await getCurrentTotal()])
							tx.set(["total", total], null)
						}

						// But crucially, we reset the whole total whenever someone scores.
						const playerScore = await getPlayerScore(player)
						tx.remove(["player", player, playerScore])
						tx.set(["player", player, playerScore + inc], null)

						await resetTotal()
					}
				)

				// Chet an meghan are playing a game.
				const chet = store.transact()
				const meghan = store.transact()

				// Chet
				await addScore(chet, "chet", 1)
				await addScore(meghan, "meghan", 1)

				// Whoever commits first will win.
				await meghan.commit()
				await expect(() => chet.commit()).toThrow()

				// Most importantly, the total will never be incorrect.
				expect(await store.scan({ prefix: [] })).toEqual([
					{ key: ["player", "chet", 0], value: null },
					{ key: ["player", "meghan", 1], value: null },
					{ key: ["total", 1], value: null },
				])
			})

			it("computes granular conflict based on tuple bounds, not prefix", async () => {
				const id = randomId()
				const store = createStorage(id)

				const a = store.transact()
				const b = store.transact()

				await a.scan({ gte: [1], lt: [10] })
				await b.scan({ gte: [10] })

				const c = store.transact()
				c.set([10], null)
				await c.commit()

				await a.commit() // ok
				expect(async () => await b.commit()).toThrow()
			})

			it.todo("can be used for transactional reads")
		})

		describe("Reactivity", () => {
			it("works with setting a value on existing key", async () => {
				const store = createStorage(randomId())
				await store.commit({
					set: [{ key: ["a"], value: 1 }],
				})

				let hoist: WriteOps | undefined
				await store.subscribe({ gte: ["a"], lte: ["a"] }, (writes) => {
					hoist = writes
				})

				await store.transact().set(["a"], 1).commit()

				expect(hoist).toStrictEqual({
					set: [{ key: ["a"], value: 1 }],
					remove: [],
				})
			})

			it("works with set key", async () => {
				const store = createStorage(randomId())
				const items: KeyValuePair[] = [
					{ key: ["a", "a", "a"], value: 1 },
					{ key: ["a", "a", "b"], value: 2 },
					{ key: ["a", "a", "c"], value: 3 },
					{ key: ["a", "b", "a"], value: 4 },
					{ key: ["a", "b", "b"], value: 5 },
					{ key: ["a", "b", "c"], value: 6 },
					{ key: ["a", "c", "a"], value: 7 },
					{ key: ["a", "c", "b"], value: 8 },
					{ key: ["a", "c", "c"], value: 9 },
				]
				const transaction = store.transact()
				for (const { key, value } of shuffle(items)) {
					transaction.set(key, value)
				}
				await transaction.commit()

				const data = await store.scan()
				expect(data).toEqual(items)

				let hoist: WriteOps | undefined
				await store.subscribe(
					{ gt: ["a", "a", MAX], lt: ["a", "c", MIN] },
					(writes) => {
						hoist = writes
					}
				)

				await store.transact().set(["a", "b", 1], 1).commit()

				expect(hoist).toStrictEqual({
					set: [{ key: ["a", "b", 1], value: 1 }],
					remove: [],
				})
			})

			it("works with remove key", async () => {
				const store = createStorage(randomId())
				const items: KeyValuePair[] = [
					{ key: ["a", "a", "a"], value: 1 },
					{ key: ["a", "a", "b"], value: 2 },
					{ key: ["a", "a", "c"], value: 3 },
					{ key: ["a", "b", "a"], value: 4 },
					{ key: ["a", "b", "b"], value: 5 },
					{ key: ["a", "b", "c"], value: 6 },
					{ key: ["a", "c", "a"], value: 7 },
					{ key: ["a", "c", "b"], value: 8 },
					{ key: ["a", "c", "c"], value: 9 },
				]
				const transaction = store.transact()
				for (const { key, value } of shuffle(items)) {
					transaction.set(key, value)
				}
				await transaction.commit()

				const data = await store.scan()
				expect(data).toEqual(items)

				let hoist: WriteOps | undefined
				await store.subscribe({ prefix: ["a", "b"] }, (writes) => {
					hoist = writes
				})

				await store.transact().remove(["a", "b", "a"]).commit()

				expect(hoist).toStrictEqual({
					set: [],
					remove: [["a", "b", "a"]],
				})
			})

			it("works when overwriting a value to an existing key", async () => {
				const store = createStorage(randomId())
				const items: KeyValuePair[] = [
					{ key: ["a", "a", "a"], value: 1 },
					{ key: ["a", "a", "b"], value: 2 },
					{ key: ["a", "a", "c"], value: 3 },
					{ key: ["a", "b", "a"], value: 4 },
					{ key: ["a", "b", "b"], value: 5 },
					{ key: ["a", "b", "c"], value: 6 },
					{ key: ["a", "c", "a"], value: 7 },
					{ key: ["a", "c", "b"], value: 8 },
					{ key: ["a", "c", "c"], value: 9 },
				]
				const transaction = store.transact()
				for (const { key, value } of shuffle(items)) {
					transaction.set(key, value)
				}
				await transaction.commit()

				const data = await store.scan()
				expect(data).toEqual(items)

				let hoist: WriteOps | undefined
				await store.subscribe({ prefix: ["a", "b"] }, (writes) => {
					hoist = writes
				})

				await store.transact().set(["a", "b", "a"], 99).commit()

				expect(hoist).toStrictEqual({
					set: [{ key: ["a", "b", "a"], value: 99 }],
					remove: [],
				})
			})

			it("should use prefix correctly and filter bounds", async () => {
				const store = createStorage(randomId())
				const items: KeyValuePair[] = [
					{ key: ["a", "a", "a"], value: 1 },
					{ key: ["a", "a", "b"], value: 2 },
					{ key: ["a", "a", "c"], value: 3 },
					{ key: ["a", "b", "a"], value: 4 },
					{ key: ["a", "b", "b"], value: 5 },
					{ key: ["a", "b", "c"], value: 6 },
					{ key: ["a", "c", "a"], value: 7 },
					{ key: ["a", "c", "b"], value: 8 },
					{ key: ["a", "c", "c"], value: 9 },
				]
				const transaction = store.transact()
				for (const { key, value } of shuffle(items)) {
					transaction.set(key, value)
				}
				await transaction.commit()

				const data = await store.scan()
				expect(data).toEqual(items)

				// Note that these queries are *basically* the same.
				// { gt: ["a", "a", MAX], lt: ["a", "c", MIN] },
				// { gt: ["a", "b", MIN], lt: ["a", "b", MAX] },
				// But the second one has better reactivity performance due to the shared prefix.

				let hoist1: WriteOps | undefined
				await store.subscribe(
					{ gt: ["a", "b", MIN], lt: ["a", "b", MAX] },
					(writes) => {
						hoist1 = writes
					}
				)

				let hoist2: WriteOps | undefined
				await store.subscribe(
					{ gt: ["a", "a", MAX], lt: ["a", "c", MIN] },
					(writes) => {
						hoist2 = writes
					}
				)

				let hoist3: WriteOps | undefined
				await store.subscribe(
					{ gt: ["a", "a", MAX], lt: ["a", "c", MAX] },
					(writes) => {
						hoist3 = writes
					}
				)

				await store.transact().set(["a", "c", 1], 1).commit()

				expect(hoist1).toStrictEqual(undefined!)

				// Even though the prefix matches, isWithinBounds should filter this out.
				expect(hoist2).toStrictEqual(undefined!)

				expect(hoist3).toStrictEqual({
					set: [{ key: ["a", "c", 1], value: 1 }],
					remove: [],
				})
			})

			it("waits for emit callbacks before resolving commit", async () => {
				const store = createStorage(randomId())
				await store.commit({ set: [{ key: ["a"], value: 1 }] })

				let value = await store.get(["a"])
				expect(value).toEqual(1)

				await store.subscribe({ gte: ["a"], lte: ["a"] }, async (writes) => {
					value = await store.get(["a"])
				})

				await store.transact().set(["a"], 2).commit()
				expect(value).toEqual(2)
			})

			it("errors in callbacks don't break the database", async () => {
				const store = createStorage(randomId())

				await store.subscribe({ prefix: ["a"] }, async () => {
					throw new Error()
				})
				// Does not throw, calls console.error instead.
				await store.transact().set(["a", 1], 1).commit()
			})

			it.skip("No writing inside an emit", async () => {
				const store = createStorage(randomId())

				let called = false
				let throws = false
				await store.subscribe({ prefix: ["a"] }, async () => {
					called = true
					try {
						await store.commit({ set: [{ key: ["b"], value: 2 }] })
					} catch (error) {
						throws = true
					}
				})
				// Does not throw, calls console.error instead.
				await store.transact().set(["a", 1], 1).commit()

				expect(called).toEqual(true)
				expect(throws).toEqual(true)
			})
		})

		describe("subscribeQueryAsync", () => {
			it("works", async () => {
				type Schema =
					| { key: ["person", number]; value: string }
					| { key: ["list", number, number]; value: null }

				const store = createStorage<Schema>(randomId())
				await store.commit({
					set: [
						{ key: ["person", 1], value: "chet" },
						{ key: ["person", 2], value: "meghan" },
						{ key: ["person", 3], value: "sean" },
						{ key: ["list", 0, 1], value: null },
						{ key: ["list", 1, 2], value: null },
					],
				})

				let compute = 0
				let peopleList: string[] = []

				const { result, destroy } = await subscribeQueryAsync(
					store,
					async (db) => {
						compute++
						const pairs = await db.scan({ prefix: ["list"] })
						const people = (await Promise.all(
							pairs.map(({ key }) => db.get(["person", key[2]]))
						)) as string[]
						return people
					},
					(newResult) => {
						peopleList = newResult
					}
				)

				peopleList = result

				expect(peopleList).toEqual(["chet", "meghan"])
				expect(compute).toEqual(1)
				compute = 0

				await store.transact().set(["person", 1], "chester").commit()

				expect(peopleList).toEqual(["chester", "meghan"])
				expect(compute).toEqual(1)
				compute = 0

				await store.transact().set(["person", 3], "joe").commit()
				expect(peopleList).toEqual(["chester", "meghan"])
				expect(compute).toEqual(0)

				// Two changes at once, only one callback.
				await store
					.transact()
					.set(["person", 2], "mego")
					.set(["person", 1], "chet")
					.remove(["list", 0, 1])
					.set(["list", 2, 1], null)
					.commit()

				expect(peopleList).toEqual(["mego", "chet"])
				expect(compute).toEqual(1)
			})

			it("can transactionally read", async () => {
				const id = randomId()
				type Schema = { key: [string]; value: number }
				const store = createStorage<Schema>(id)

				await store.commit({
					set: [
						{ key: ["chet"], value: 1 },
						{ key: ["meghan"], value: 1 },
					],
				})

				const getTotal = transactionalReadWriteAsync<Schema>()(async (tx) => {
					const chet = await tx.get(["chet"])
					const meghan = await tx.get(["meghan"])
					return chet! + meghan!
				})

				let total: number
				const { result, destroy } = await subscribeQueryAsync(
					store,
					(db) => getTotal(db),
					(result) => {
						total = result
					}
				)
				total = result
				expect(total).toEqual(2)

				await store.commit({
					set: [
						{ key: ["chet"], value: 2 },
						{ key: ["meghan"], value: 2 },
					],
				})
				expect(total).toEqual(4)

				await store.transact().set(["chet"], 3).commit()
				expect(total).toEqual(5)
			})
		})

		describe("subspace", () => {
			it("get/exists/scan works", async () => {
				type Person = { id: string; name: string; age: number }
				type Schema =
					| { key: ["person", string]; value: Person }
					| { key: ["personByName", string, string]; value: Person }
					| { key: ["personByAge", number, string]; value: Person }

				const store = createStorage<Schema>(randomId())

				const writePerson = transactionalReadWriteAsync<Schema>()(
					async (tx, person: Person) => {
						tx.set(["person", person.id], person)
						tx.set(["personByName", person.name, person.id], person)
						tx.set(["personByAge", person.age, person.id], person)
					}
				)

				await writePerson(store, { id: "1", name: "Chet", age: 31 })
				await writePerson(store, { id: "2", name: "Meghan", age: 30 })
				await writePerson(store, { id: "3", name: "Tanishq", age: 22 })

				const personByAge = store.subspace(["personByAge"])
				expect((await personByAge.scan()).map(({ key }) => key[0])).toEqual([
					22, 30, 31,
				])
				expect((await personByAge.get([22, "3"]))!.name).toEqual("Tanishq")
				expect(await personByAge.exists([31, "1"])).toEqual(true)
				expect(await personByAge.exists([31, "2"])).toEqual(false)
			})

			it("writes work", async () => {
				type Schema = { key: ["a", number]; value: number }
				const store = createStorage<Schema>(randomId())

				await store.commit({
					set: [
						{ key: ["a", 1], value: 1 },
						{ key: ["a", 2], value: 2 },
					],
				})

				const a = store.subspace(["a"])
				const tx = a.transact().set([3], 3)
				expect(await tx.get([1])).toEqual(1)
				expect(await tx.get([3])).toEqual(3)
				await tx.commit()

				expect(await a.scan()).toEqual([
					{ key: [1], value: 1 },
					{ key: [2], value: 2 },
					{ key: [3], value: 3 },
				])
			})

			it("writes work in a nested subspace", async () => {
				type Schema = { key: ["a", "a", number]; value: number }
				const store = createStorage<Schema>(randomId())

				await store.commit({
					set: [
						{ key: ["a", "a", 1], value: 1 },
						{ key: ["a", "a", 2], value: 2 },
					],
				})

				const a = store.subspace(["a"])
				const aa = a.subspace(["a"])
				const tx = aa.transact().set([3], 3)
				expect(await tx.get([1])).toEqual(1)
				expect(await tx.get([3])).toEqual(3)
				await tx.commit()
				expect(await aa.scan()).toEqual([
					{ key: [1], value: 1 },
					{ key: [2], value: 2 },
					{ key: [3], value: 3 },
				])
			})

			it("can create nested subspace inside a transaction", async () => {
				type Schema = { key: ["a", "a", number]; value: number }
				const store = createStorage<Schema>(randomId())

				await store.commit({
					set: [
						{ key: ["a", "a", 1], value: 1 },
						{ key: ["a", "a", 2], value: 2 },
					],
				})

				const a = store.subspace(["a"])
				const tx = a.transact()

				tx.set(["a", 3], 3)

				const aa = tx.subspace(["a"])
				aa.set([4], 4)

				expect(await aa.scan()).toEqual([
					{ key: [1], value: 1 },
					{ key: [2], value: 2 },
					{ key: [3], value: 3 },
					{ key: [4], value: 4 },
				])

				await tx.commit()

				expect(await a.scan()).toEqual([
					{ key: ["a", 1], value: 1 },
					{ key: ["a", 2], value: 2 },
					{ key: ["a", 3], value: 3 },
					{ key: ["a", 4], value: 4 },
				])
			})

			it("root tuple transaction API conforms to non-root transaction api.", async () => {
				type Schema = { key: [number]; value: number }
				const store = createStorage<Schema>(randomId())

				function f(
					tx: AsyncTupleTransactionApi<{ key: [number]; value: number }>
				) {}

				const tx = store.transact()
				f(tx)
				f(tx.subspace([]))
			})

			it("scan args types work", async () => {
				type Schema = { key: ["a", number]; value: number }
				const store = createStorage<Schema>(randomId())

				await store.commit({
					set: [
						{ key: ["a", 1], value: 1 },
						{ key: ["a", 2], value: 2 },
					],
				})

				const a = store.subspace(["a"])

				expect(await a.scan({ gt: [1] })).toEqual([{ key: [2], value: 2 }])
			})
		})

		describe("subschema", () => {
			it("types work", () => {
				type SubSchema1 = { key: ["a", number]; value: number }
				type SubSchema2 = { key: ["b", string]; value: string }
				type Schema = SubSchema1 | SubSchema2
				const store = createStorage<Schema>(randomId())

				function module0(db: AsyncTupleDatabaseClientApi<Schema>) {
					const a1 = () => db.get(["a", 1])
					type A1 = Assert<ReturnType<typeof a1>, Promise<number | undefined>>

					const a2 = () => db.get(["b", ""])
					type A2 = Assert<ReturnType<typeof a2>, Promise<string | undefined>>

					const a3 = () => db.scan({ prefix: ["a"] })
					type A3 = Assert<ReturnType<typeof a3>, Promise<SubSchema1[]>>

					const a4 = () => db.scan({ prefix: ["b"] })
					type A4 = Assert<ReturnType<typeof a4>, Promise<SubSchema2[]>>

					const a5 = () => db.scan({ prefix: [] })
					type A5 = Assert<ReturnType<typeof a5>, Promise<Schema[]>>

					const a6 = () => db.subspace(["a"])
					type A6 = Assert<
						ReturnType<typeof a6>,
						AsyncTupleDatabaseClientApi<{
							key: [number]
							value: number
						}>
					>

					const a7 = () => db.subspace(["b"])
					type A7 = Assert<
						ReturnType<typeof a7>,
						AsyncTupleDatabaseClientApi<{
							key: [string]
							value: string
						}>
					>

					const a8 = () => db.transact()
					type A8 = Assert<
						ReturnType<typeof a8>,
						AsyncTupleTransactionApi<Schema>
					>
				}
				function module1(db: AsyncTupleDatabaseClientApi<SubSchema1>) {
					const a1 = () => db.get(["a", 1])
					type A1 = Assert<ReturnType<typeof a1>, Promise<number | undefined>>

					const a3 = () => db.scan({ prefix: ["a"] })
					type A3 = Assert<ReturnType<typeof a3>, Promise<SubSchema1[]>>

					// TODO: this is leaky! Maybe its best to use subspaces!
					const a5 = () => db.scan({ prefix: [] })
					type A5 = Assert<ReturnType<typeof a5>, Promise<SubSchema1[]>>

					const a6 = () => db.subspace(["a"])
					type A6 = Assert<
						ReturnType<typeof a6>,
						AsyncTupleDatabaseClientApi<{
							key: [number]
							value: number
						}>
					>

					const a8 = () => db.transact()
					type A8 = Assert<
						ReturnType<typeof a8>,
						AsyncTupleTransactionApi<SubSchema1>
					>
				}
				function module2(db: AsyncTupleDatabaseClientApi<SubSchema2>) {
					const a2 = () => db.get(["b", ""])
					type A2 = Assert<ReturnType<typeof a2>, Promise<string | undefined>>

					const a4 = () => db.scan({ prefix: ["b"] })
					type A4 = Assert<ReturnType<typeof a4>, Promise<SubSchema2[]>>

					const a5 = () => db.scan({ prefix: [] })
					type A5 = Assert<ReturnType<typeof a5>, Promise<SubSchema2[]>>

					const a7 = () => db.subspace(["b"])
					type A7 = Assert<
						ReturnType<typeof a7>,
						AsyncTupleDatabaseClientApi<{
							key: [string]
							value: string
						}>
					>
				}

				module0(store)
				// @ts-expect-error
				module1(store)
				// @ts-expect-error
				module2(store)
			})

			it("types work", () => {
				type SubSchema1 = { key: ["a", number]; value: number }
				type SubSchema2 = { key: ["b", string]; value: string }
				type SubSchema3 = { key: ["c", boolean]; value: boolean }

				type Schema = SubSchema1 | SubSchema2
				const store = createStorage<Schema>(randomId())

				function module1(db: AsyncTupleDatabaseClientApi<SubSchema3>) {}
				function module2(db: AsyncTupleDatabaseClientApi<SubSchema3>) {}

				// @ts-expect-error
				module1(store)
				// @ts-expect-error
				module2(store)
			})
		})

		if (durable) {
			describe("Persistence", () => {
				it("persists properly", async () => {
					const id = randomId()
					const store = createStorage(id)

					const items: KeyValuePair[] = [
						{ key: ["a", "a", "a"], value: 1 },
						{ key: ["a", "a", "b"], value: 2 },
						{ key: ["a", "a", "c"], value: 3 },
						{ key: ["a", "b", "a"], value: 4 },
						{ key: ["a", "b", "b"], value: 5 },
						{ key: ["a", "b", "c"], value: 6 },
						{ key: ["a", "c", "a"], value: 7 },
						{ key: ["a", "c", "b"], value: 8 },
						{ key: ["a", "c", "c"], value: 9 },
					]
					const transaction = store.transact()
					for (const { key, value } of shuffle(items)) {
						transaction.set(key, value)
					}
					await transaction.commit()

					const data = await store.scan()
					expect(data).toEqual(items)

					await store.close()

					const store2 = createStorage(id)
					const data2 = await store2.scan()
					expect(data2).toEqual(items)
				})
			})
		}

		it("scan reverse", async () => {
			const db = createStorage(randomId())

			await db.commit({
				set: [
					{ key: [1], value: null },
					{ key: [2], value: null },
					{ key: [3], value: null },
				],
			})

			expect(await db.scan({ reverse: true })).toEqual([
				{ key: [3], value: null },
				{ key: [2], value: null },
				{ key: [1], value: null },
			])
		})

		it("scan limit", async () => {
			const db = createStorage(randomId())

			await db.commit({
				set: [
					{ key: [1], value: null },
					{ key: [2], value: null },
					{ key: [3], value: null },
				],
			})

			expect(await db.scan({ limit: 1 })).toEqual([{ key: [1], value: null }])
		})

		it("scan reverse limit", async () => {
			const db = createStorage(randomId())

			await db.commit({
				set: [
					{ key: [1], value: null },
					{ key: [2], value: null },
					{ key: [3], value: null },
				],
			})

			expect(await db.scan({ reverse: true, limit: 1 })).toEqual([
				{ key: [3], value: null },
			])
		})

		it("tx.scan reverse with pending write", async () => {
			const db = createStorage(randomId())

			await db.commit({
				set: [
					{ key: [1], value: null },
					{ key: [2], value: null },
					{ key: [3], value: null },
				],
			})

			const tx = db.transact()

			tx.set([2.5], null)

			expect(await tx.scan({ reverse: true })).toEqual([
				{ key: [3], value: null },
				{ key: [2.5], value: null },
				{ key: [2], value: null },
				{ key: [1], value: null },
			])
		})

		it("tx.scan limit", async () => {
			const db = createStorage(randomId())

			await db.commit({
				set: [
					{ key: [1], value: null },
					{ key: [2], value: null },
					{ key: [3], value: null },
				],
			})

			NoChange: {
				const tx = db.transact()
				tx.set([5], null)
				expect(await tx.scan({ limit: 1 })).toEqual([{ key: [1], value: null }])
			}

			YesChange: {
				const tx = db.transact()
				tx.set([0], null)
				expect(await tx.scan({ limit: 1 })).toEqual([{ key: [0], value: null }])
			}
		})

		it("tx.scan limit reverse", async () => {
			const db = createStorage(randomId())

			await db.commit({
				set: [
					{ key: [1], value: null },
					{ key: [2], value: null },
					{ key: [3], value: null },
				],
			})

			YesChange: {
				const tx = db.transact()
				tx.set([5], null)
				expect(await tx.scan({ limit: 1, reverse: true })).toEqual([
					{ key: [5], value: null },
				])
			}

			NoChange: {
				const tx = db.transact()
				tx.set([0], null)
				expect(await tx.scan({ limit: 1, reverse: true })).toEqual([
					{ key: [3], value: null },
				])
			}
		})

		it("tx.scan limit 2", async () => {
			const db = createStorage(randomId())

			await db.commit({
				set: [
					{ key: [1], value: null },
					{ key: [2], value: null },
					{ key: [3], value: null },
				],
			})

			YesChange: {
				const tx = db.transact()
				tx.set([0], null)
				expect(await tx.scan({ limit: 2 })).toEqual([
					{ key: [0], value: null },
					{ key: [1], value: null },
				])
			}

			NoChange: {
				const tx = db.transact()
				tx.set([5], null)
				expect(await tx.scan({ limit: 2 })).toEqual([
					{ key: [1], value: null },
					{ key: [2], value: null },
				])
			}
		})

		describe("transactionalWrite", () => {
			it("Works for both async and sync, but no reads.", () => {
				const id = randomId()
				type Schema = { key: ["score"]; value: number }
				const store = createStorage<Schema>(id)

				const resetScore = transactionalWrite<Schema>()((tx) => {
					tx.set(["score"], 0)
				})
				resetScore(store)
			})
		})

		// New tests here...
	})
}
