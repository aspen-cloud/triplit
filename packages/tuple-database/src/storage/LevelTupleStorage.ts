import { AbstractBatch } from "abstract-leveldown"
import { Level } from "level"
import { AsyncTupleStorageApi } from "../database/async/asyncTypes"
import {
	decodeTuple,
	decodeValue,
	encodeTuple,
	encodeValue,
} from "../helpers/codec"
import { KeyValuePair, ScanStorageArgs, WriteOps } from "./types"

export class LevelTupleStorage implements AsyncTupleStorageApi {
	/**
	 * import level from "level"
	 * new LevelTupleStorage(level("path/to.db"))
	 */
	constructor(public db: Level) {}

	async scan(args: ScanStorageArgs = {}): Promise<KeyValuePair[]> {
		const dbArgs: any = {}
		if (args.gt !== undefined) dbArgs.gt = encodeTuple(args.gt)
		if (args.gte !== undefined) dbArgs.gte = encodeTuple(args.gte)
		if (args.lt !== undefined) dbArgs.lt = encodeTuple(args.lt)
		if (args.lte !== undefined) dbArgs.lte = encodeTuple(args.lte)
		if (args.limit !== undefined) dbArgs.limit = args.limit
		if (args.reverse !== undefined) dbArgs.reverse = args.reverse

		const results: KeyValuePair[] = []
		for await (const [key, value] of this.db.iterator(dbArgs)) {
			results.push({
				key: decodeTuple(key),
				value: decodeValue(value),
			})
		}
		return results
	}

	async commit(writes: WriteOps): Promise<void> {
		const ops = [
			...(writes.remove || []).map(
				(tuple) =>
					({
						type: "del",
						key: encodeTuple(tuple),
					} as AbstractBatch)
			),
			...(writes.set || []).map(
				({ key, value }) =>
					({
						type: "put",
						key: encodeTuple(key),
						value: encodeValue(value),
					} as AbstractBatch)
			),
		]

		await this.db.batch(ops)
	}

	async close(): Promise<void> {
		return this.db.close()
	}
}
