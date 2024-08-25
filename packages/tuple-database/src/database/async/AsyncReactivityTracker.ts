import { maybePromiseAll } from "../../helpers/maybeWaitForPromises"
import { Bounds } from "../../helpers/sortedTupleArray"
import {
	KeyValuePair,
	ScanStorageArgs,
	Tuple,
	WriteOps,
} from "../../storage/types"
import { TxId } from "../types"
import { AsyncCallback } from "./asyncTypes"
import * as SortedTupleValue from "../../helpers/sortedTupleValuePairs"
import * as SortedTuple from "../../helpers/sortedTupleArray"

type Listeners = Map<AsyncCallback, Bounds>

export class AsyncReactivityTracker {
	private listeners: Listeners = new Map()

	subscribe(args: ScanStorageArgs, callback: AsyncCallback) {
		return subscribe(this.listeners, args, callback)
	}

	computeReactivityEmits(writes: WriteOps) {
		return getReactivityEmits(this.listeners, writes)
	}

	async emit(emits: ReactivityEmits, txId: TxId) {
		let promises: any[] = []
		for (const [callback, writes] of emits.entries()) {
			try {
				// Catch sync callbacks.
				promises.push(callback(writes, txId))
			} catch (error) {
				console.error(error)
			}
		}
		// This trick allows us to return a Promise from a sync TupleDatabase#commit
		// when there are async callbacks. And this allows us to create an async client
		// on top of a sync client.
		return maybePromiseAll(promises)
	}
}

type ReactivityEmits = Map<AsyncCallback, Required<WriteOps>>

function getReactivityEmits(listenersDb: Listeners, writes: WriteOps) {
	const emits: ReactivityEmits = new Map()

	for (const [callback, bounds] of listenersDb) {
		const matchingWrites: KeyValuePair[] = []
		const matchingRemoves: Tuple[] = []
		// Found it to be slightly faster to not assume this is sorted and check bounds individually instead of using scan(writes.set, bounds)
		for (const kv of writes.set || []) {
			if (SortedTuple.isTupleWithinBounds(kv.key, bounds)) {
				matchingWrites.push(kv)
			}
		}
		for (const tuple of writes.remove || []) {
			if (SortedTuple.isTupleWithinBounds(tuple, bounds)) {
				matchingRemoves.push(tuple)
			}
		}
		if (matchingWrites.length > 0 || matchingRemoves.length > 0) {
			emits.set(callback, { set: matchingWrites, remove: matchingRemoves })
		}
	}

	return emits
}

function subscribe(
	listenersDb: Listeners,
	args: ScanStorageArgs,
	callback: AsyncCallback
) {
	listenersDb.set(callback, args)

	return () => {
		listenersDb.delete(callback)
	}
}
