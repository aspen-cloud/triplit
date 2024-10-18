/*

This file is generated from async/transactionalReadWriteAsync.ts

*/

type Identity<T> = T

import { KeyValuePair } from "../../main.js"
import { retry, RetryOptions } from "./retry.js"
import { TupleDatabaseClientApi, TupleTransactionApi } from "./types.js"

// Similar to FoundationDb's abstraction: https://apple.github.io/foundationdb/class-scheduling.html
// Accepts a transaction or a database and allows you to compose transactions together.

// This outer function is just used for the schema type because currying is the only way
// we can partially infer generic type parameters.
// https://stackoverflow.com/questions/60377365/typescript-infer-type-of-generic-after-optional-first-generic
export function transactionalReadWrite<S extends KeyValuePair = KeyValuePair>(
	retries = 5,
	options: RetryOptions = {}
) {
	return function <I extends any[], O>(
		fn: (tx: TupleTransactionApi<S>, ...args: I) => Identity<O>
	) {
		return function (
			dbOrTx: TupleDatabaseClientApi<S> | TupleTransactionApi<S>,
			...args: I
		): Identity<O> {
			if (!("transact" in dbOrTx)) return fn(dbOrTx, ...args)
			return retry(
				retries,
				() => {
					const tx = dbOrTx.transact()
					try {
						const result = fn(tx, ...args)
						tx.commit()
						return result
					} catch (e) {
						// If the transaction is already committed, we don't need to cancel it.
						if (!tx.committed && !tx.canceled) tx.cancel()
						throw e
					}
				},
				options
			)
		}
	}
}

/** @deprecated */
export const transactionalQuery = transactionalReadWrite
