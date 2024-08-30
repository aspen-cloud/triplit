/*

This file is generated from async/AsyncTupleDatabase.ts

*/

type Identity<T> = T

import { iterateWrittenTuples } from "../../helpers/iterateTuples.js"
import { randomId } from "../../helpers/randomId.js"
import { KeyValuePair, ScanStorageArgs, WriteOps } from "../../storage/types.js"
import { ConcurrencyLog } from "../ConcurrencyLog.js"
import { TupleStorageApi } from "../sync/types.js"
import { TxId, Unsubscribe } from "../types.js"
import { ReactivityTracker } from "./ReactivityTracker.js"
import { Callback, TupleDatabaseApi } from "./types.js"

export class TupleDatabase implements TupleDatabaseApi {
	constructor(private storage: TupleStorageApi) {}

	log = new ConcurrencyLog()
	reactivity = new ReactivityTracker()

	scan(args: ScanStorageArgs = {}, txId?: TxId): Identity<KeyValuePair[]> {
		const { reverse, limit, ...bounds } = args
		if (txId) this.log.read(txId, bounds)
		return this.storage.scan({ ...bounds, reverse, limit })
	}

	subscribe(args: ScanStorageArgs, callback: Callback): Identity<Unsubscribe> {
		return this.reactivity.subscribe(args, callback)
	}

	commit(writes: WriteOps, txId?: string) {
		// Note: commit is called for transactional reads as well!
		const emits = this.reactivity.computeReactivityEmits(writes)

		if (txId) this.log.commit(txId)
		for (const tuple of iterateWrittenTuples(writes)) {
			this.log.write(txId, tuple)
		}
		this.storage.commit(writes)

		return this.reactivity.emit(emits, txId || randomId())
	}

	cancel(txId: string) {
		this.log.cancel(txId)
	}

	close() {
		this.storage.close()
	}
}
