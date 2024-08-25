import { KeyValuePair } from "../../main"
import {
	AsyncTupleDatabaseClientApi,
	AsyncTupleTransactionApi,
} from "./asyncTypes"
import { RetryOptions, retryAsync } from "./retryAsync"

// Similar to FoundationDb's abstraction: https://apple.github.io/foundationdb/class-scheduling.html
// Accepts a transaction or a database and allows you to compose transactions together.

// This outer function is just used for the schema type because currying is the only way
// we can partially infer generic type parameters.
// https://stackoverflow.com/questions/60377365/typescript-infer-type-of-generic-after-optional-first-generic
export function transactionalReadWriteAsync<
	S extends KeyValuePair = KeyValuePair
>(retries = 5, options: RetryOptions = {}) {
	return function <I extends any[], O>(
		fn: (tx: AsyncTupleTransactionApi<S>, ...args: I) => Promise<O>
	) {
		return async function (
			dbOrTx: AsyncTupleDatabaseClientApi<S> | AsyncTupleTransactionApi<S>,
			...args: I
		): Promise<O> {
			if (!("transact" in dbOrTx)) return fn(dbOrTx, ...args)
			return await retryAsync(
				retries,
				async () => {
					const tx = dbOrTx.transact()
					const result = await fn(tx, ...args)
					await tx.commit()
					return result
				},
				options
			)
		}
	}
}

/** @deprecated */
export const transactionalAsyncQuery = transactionalReadWriteAsync
