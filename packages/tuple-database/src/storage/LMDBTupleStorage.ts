import type * as LMDB from "lmdb"
import { AsyncTupleStorageApi } from "../database/async/asyncTypes"
import {
	decodeTuple,
	decodeValue,
	encodeTuple,
	encodeValue,
} from "../helpers/codec"
import { KeyValuePair, MIN, ScanStorageArgs, Tuple, WriteOps } from "./types"

const MIN_TUPLE = encodeTuple([MIN])

export class LMDBTupleStorage implements AsyncTupleStorageApi {
	public db: LMDB.Database
	constructor(dbFactory: (options: LMDB.RootDatabaseOptions) => LMDB.Database) {
		const encoder = {
			writeKey(
				key: string | Buffer,
				targetBuffer: Buffer,
				startPosition: number
			) {
				// Sometimes key is buffer (i think for longer keys)
				// TODO: add test
				if (Buffer.isBuffer(key)) {
					key.copy(targetBuffer, startPosition)
				} else {
					targetBuffer.write(key, startPosition, key.length, "utf8")
				}
				return startPosition + key.length
			},
			readKey(buffer: Buffer, startPosition: number, endPosition: number) {
				return buffer.toString("utf8", startPosition, endPosition)
			},
		}
		// This encoder should take our encoded tuples and write them directly to a buffer
		// keyEncoder is used to encode keys when writing to the database, although its mentioned in docs, it is not in the types
		// encoder (I think) encodes values, it is not mentioned in the docs however is properly typed
		// TODO: test lmdb directly to determine why pre-encoded strings sometimes fail to encode properly with their default encoder
		this.db = dbFactory({
			// @ts-expect-error
			keyEncoder: encoder,
		})
	}

	async scan(args: ScanStorageArgs = {}): Promise<KeyValuePair[]> {
		const startTuple = args.gt ?? args.gte
		const start = startTuple !== undefined ? encodeTuple(startTuple) : MIN_TUPLE
		const endTuple = args.lt ?? args.lte
		const end = endTuple !== undefined ? encodeTuple(endTuple) : undefined
		if (start && end) {
			if (start > end) {
				throw new Error("invalid bounds for scan. Start is greater than end.")
			}
		}
		const results: KeyValuePair[] = []
		const reverse = args.reverse ?? false
		// console.log("scan args", args, start, end, reverse)
		for (const { key, value } of this.db.getRange({
			start: reverse ? end : start,
			reverse,
		})) {
			if (args.gt && (key as string) <= start!) {
				if (reverse) {
					break
				}
				continue
			}
			if (args.gte && (key as string) < start!) {
				if (reverse) {
					break
				}
				continue
			}
			if (args.lt && (key as string) >= end!) {
				if (reverse) {
					continue
				}
				break
			}
			if (args.lte && (key as string) > end!) {
				if (reverse) {
					continue
				}
				break
			}
			results.push({
				key: decodeTuple(key as string),
				value: value,
			})
			if (results.length >= (args?.limit ?? Infinity)) break
		}
		return results
	}

	async commit(writes: WriteOps): Promise<void> {
		await this.db.batch(() => {
			for (const tuple of writes.remove ?? []) {
				this.db.remove(encodeTuple(tuple))
			}
			for (const { key, value } of writes.set ?? []) {
				const storedKey = encodeTuple(key)
				const storedValue = value
				this.db.put(storedKey, storedValue)
			}
		})
	}

	async close(): Promise<void> {
		return this.db.close()
	}
}
