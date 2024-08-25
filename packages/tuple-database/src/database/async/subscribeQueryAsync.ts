import { isEmptyWrites } from "../../helpers/isEmptyWrites"
import { Queue } from "../../helpers/Queue"
import { KeyValuePair } from "../../storage/types"
import { TxId } from "../types"
import { AsyncTupleDatabaseClient } from "./AsyncTupleDatabaseClient"
import { AsyncTupleDatabaseClientApi } from "./asyncTypes"

const throwError = () => {
	throw new Error()
}

export async function subscribeQueryAsync<S extends KeyValuePair, T>(
	db: AsyncTupleDatabaseClientApi<S>,
	fn: (db: AsyncTupleDatabaseClientApi<S>) => Promise<T>,
	callback: (result: T) => void
): Promise<{ result: T; destroy: () => void }> {
	let destroyed = false
	const listeners = new Set<any>()

	const compute = () => fn(listenDb)

	const resetListeners = () => {
		listeners.forEach((destroy) => destroy())
		listeners.clear()
	}

	let lastComputedTxId: string | undefined

	const recompute = async (txId: TxId) => {
		if (destroyed) return
		// Skip over duplicate emits.
		if (txId === lastComputedTxId) return

		// Recompute.
		lastComputedTxId = txId
		resetListeners()
		const result = await compute()
		callback(result)
	}

	const recomputeQueue = new Queue()

	// Subscribe for every scan that gets called.
	const listenDb = new AsyncTupleDatabaseClient<S>({
		scan: async (args: any, txId) => {
			// if (txId)
			// 	// Maybe one day we can transactionally subscribe to a bunch of things. But
			// 	// for now, lets just avoid that...
			// 	throw new Error("Not allowed to subscribe transactionally.")

			const destroy = await db.subscribe(args, async (_writes, txId) =>
				recomputeQueue.enqueue(() => recompute(txId))
			)
			listeners.add(destroy)

			const results = await db.scan(args)
			return results
		},
		cancel: async (txId) => {
			await db.cancel(txId)
		},
		commit: async (writes, txId) => {
			if (!isEmptyWrites(writes))
				throw new Error("No writing in a subscribeQueryAsync.")
			// Commit to resolve conflicts with transactional reads.
			await db.commit({}, txId)
		},
		subscribe: throwError,
		close: throwError,
	})

	const result = await compute()
	const destroy = () => {
		resetListeners()
		destroyed = true
	}
	return { result, destroy }
}
