import { AsyncTupleDatabaseApi } from "../database/async/asyncTypes"
import { TupleDatabaseApi } from "../database/sync/types"

function sleep(ms = 0) {
	return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

// Introduce delay into a database, mostly for debugging purposes.
export function DelayDb(
	db: AsyncTupleDatabaseApi | TupleDatabaseApi,
	delay = 0
): AsyncTupleDatabaseApi {
	return {
		scan: async (...args) => {
			await sleep(delay)
			return db.scan(...args)
		},
		commit: async (...args) => {
			await sleep(delay)
			return db.commit(...args)
		},
		cancel: async (...args) => {
			await sleep(delay)
			return db.cancel(...args)
		},
		subscribe: async (...args) => {
			await sleep(delay)
			return db.subscribe(...args)
		},
		close: async (...args) => {
			await sleep(delay)
			return db.close(...args)
		},
	}
}
