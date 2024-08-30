import { useEffect, useState } from "react"
import { AsyncTupleDatabaseClientApi } from "./database/async/asyncTypes.js"
import { shallowEqual } from "./helpers/shallowEqual.js"
import { subscribeQueryAsync } from "./main.js"
import { KeyValuePair } from "./storage/types.js"

/** Useful for managing UI state for React with a TupleDatabase. */
export function useAsyncTupleDatabase<
	S extends KeyValuePair,
	T,
	A extends any[]
>(
	db: AsyncTupleDatabaseClientApi<S>,
	fn: (db: AsyncTupleDatabaseClientApi<S>, ...arg: A) => Promise<T>,
	args: A
) {
	const [result, setResult] = useState<T | undefined>(undefined)

	useEffect(() => {
		let stopped = false
		let stop: (() => void) | undefined
		subscribeQueryAsync(
			db,
			(db) => fn(db, ...args),
			(newResult) => {
				if (stopped) return
				if (!shallowEqual(newResult, result)) {
					setResult(newResult)
				}
			}
		).then(({ result, destroy }) => {
			setResult(result)
			if (stopped) destroy()
			else stop = destroy
		})
		return () => {
			stopped = true
			if (stop) stop()
		}
	}, [db, fn, ...args])

	return result
}
