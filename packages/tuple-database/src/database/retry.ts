/*

This file is generated from async/retryAsync.ts

*/

type Identity<T> = T

import { ReadWriteConflictError } from "./ConcurrencyLog"

export function retry<O>(retries: number, fn: () => Identity<O>) {
	while (true) {
		try {
			const result = fn()
			return result
		} catch (error) {
			if (retries <= 0) throw error
			const isConflict = error instanceof ReadWriteConflictError
			if (!isConflict) throw error
			retries -= 1
		}
	}
}
