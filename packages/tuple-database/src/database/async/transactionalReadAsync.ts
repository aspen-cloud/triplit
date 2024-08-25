import { KeyValuePair } from "../../storage/types"
import { retry } from "../retry"
import {
	AsyncTupleDatabaseClientApi,
	AsyncTupleTransactionApi,
	ReadOnlyAsyncTupleDatabaseClientApi,
} from "./asyncTypes"

/**
 * Similar to transactionalReadWrite and transactionalWrite but only allows reads.
 */
export function transactionalReadAsync<S extends KeyValuePair = KeyValuePair>(
	retries = 5
) {
	return function <I extends any[], O>(
		fn: (tx: ReadOnlyAsyncTupleDatabaseClientApi<S>, ...args: I) => O
	) {
		return function (
			dbOrTx:
				| AsyncTupleDatabaseClientApi<S>
				| AsyncTupleTransactionApi<S>
				| ReadOnlyAsyncTupleDatabaseClientApi<S>,
			...args: I
		): O {
			if (!("transact" in dbOrTx)) return fn(dbOrTx, ...args)
			return retry(retries, () => {
				const tx = dbOrTx.transact()
				const result = fn(tx, ...args)
				tx.commit()
				return result
			})
		}
	}
}
