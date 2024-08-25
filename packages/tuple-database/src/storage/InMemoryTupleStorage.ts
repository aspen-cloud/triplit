import { TupleStorageApi } from "../database/sync/types"
import * as tv from "../helpers/sortedTupleValuePairs"
import { KeyValuePair, ScanStorageArgs, WriteOps } from "./types"

export class InMemoryTupleStorage implements TupleStorageApi {
	data: KeyValuePair[]

	constructor(data?: KeyValuePair[]) {
		this.data = data || []
	}

	scan(args?: ScanStorageArgs) {
		return tv.scan(this.data, args)
	}

	commit(writes: WriteOps) {
		// Indexers run inside the tx so we don't need to do that here.
		// And because of that, the order here should not matter.
		const { set, remove } = writes
		for (const tuple of remove || []) {
			tv.remove(this.data, tuple)
		}
		for (const { key, value } of set || []) {
			tv.set(this.data, key, value)
		}
	}

	close() {}
}
