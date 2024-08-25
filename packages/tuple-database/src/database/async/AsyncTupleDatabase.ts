import { iterateWrittenTuples } from "../../helpers/iterateTuples"
import { randomId } from "../../helpers/randomId"
import { KeyValuePair, ScanStorageArgs, WriteOps } from "../../storage/types"
import { ConcurrencyLog } from "../ConcurrencyLog"
import { TupleStorageApi } from "../sync/types"
import { TxId, Unsubscribe } from "../types"
import { AsyncReactivityTracker } from "./AsyncReactivityTracker"
import {
	AsyncCallback,
	AsyncTupleDatabaseApi,
	AsyncTupleStorageApi,
} from "./asyncTypes"

export class AsyncTupleDatabase implements AsyncTupleDatabaseApi {
	constructor(private storage: TupleStorageApi | AsyncTupleStorageApi) {}

	log = new ConcurrencyLog()
	reactivity = new AsyncReactivityTracker()

	async scan(args: ScanStorageArgs = {}, txId?: TxId): Promise<KeyValuePair[]> {
		const { reverse, limit, ...bounds } = args
		if (txId) this.log.read(txId, bounds)
		return this.storage.scan({ ...bounds, reverse, limit })
	}

	async subscribe(
		args: ScanStorageArgs,
		callback: AsyncCallback
	): Promise<Unsubscribe> {
		return this.reactivity.subscribe(args, callback)
	}

	async commit(writes: WriteOps, txId?: string) {
		// Note: commit is called for transactional reads as well!
		const emits = this.reactivity.computeReactivityEmits(writes)

		if (txId) this.log.commit(txId)
		for (const tuple of iterateWrittenTuples(writes)) {
			this.log.write(txId, tuple)
		}
		await this.storage.commit(writes)

		return this.reactivity.emit(emits, txId || randomId())
	}

	async cancel(txId: string) {
		this.log.cancel(txId)
	}

	async close() {
		await this.storage.close()
	}
}
