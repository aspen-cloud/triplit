/*

This file is generated from async/subscribeQueryAsync.ts

*/

type Identity<T> = T

import { isEmptyWrites } from "../../helpers/isEmptyWrites"
import { Queue } from "../../helpers/Queue"
import { KeyValuePair } from "../../storage/types"
import { TxId } from "../types"
import { TupleDatabaseClient } from "./TupleDatabaseClient"
import { TupleDatabaseClientApi } from "./types"

const throwError = () => {
	throw new Error()
}

export function subscribeQuery<S extends KeyValuePair, T>(
	db: TupleDatabaseClientApi<S>,
	fn: (db: TupleDatabaseClientApi<S>) => Identity<T>,
	callback: (result: T) => void
): Identity<{ result: T; destroy: () => void }> {
	let destroyed = false
	const listeners = new Set<any>()

	const compute = () => fn(listenDb)

	const resetListeners = () => {
		listeners.forEach((destroy) => destroy())
		listeners.clear()
	}

	let lastComputedTxId: string | undefined

	const recompute = (txId: TxId) => {
		if (destroyed) return
		// Skip over duplicate emits.
		if (txId === lastComputedTxId) return

		// Recompute.
		lastComputedTxId = txId
		resetListeners()
		const result = compute()
		callback(result)
	}

	const recomputeQueue = new Queue()

	// Subscribe for every scan that gets called.
	const listenDb = new TupleDatabaseClient<S>({
		scan: (args: any, txId) => {
			// if (txId)
			// 	// Maybe one day we can transactionally subscribe to a bunch of things. But
			// 	// for now, lets just avoid that...
			// 	throw new Error("Not allowed to subscribe transactionally.")

			const destroy = db.subscribe(args, (_writes, txId) =>
				recomputeQueue.enqueue(() => recompute(txId))
			)
			listeners.add(destroy)

			const results = db.scan(args)
			return results
		},
		cancel: (txId) => {
			db.cancel(txId)
		},
		commit: (writes, txId) => {
			if (!isEmptyWrites(writes))
				throw new Error("No writing in a subscribeQuery.")
			// Commit to resolve conflicts with transactional reads.
			db.commit({}, txId)
		},
		subscribe: throwError,
		close: throwError,
	})

	const result = compute()
	const destroy = () => {
		resetListeners()
		destroyed = true
	}
	return { result, destroy }
}
