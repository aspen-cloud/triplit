/*

This file is generated from async/retryAsync.ts

*/

type Identity<T> = T

import { ReadWriteConflictError } from "../../database/ConcurrencyLog.js"

export type RetryOptions = {
	exponentialBackoff?: boolean
	backoffBase?: number
	maxDelay?: number
	jitter?: boolean
}

const DEFAULT_MAX_DELAY = 1000
const DEFAULT_BACKOFF_BASE = 10

export function retry<O>(
	retries: number,
	fn: () => Identity<O>,
	options: RetryOptions = {}
) {
	let delay = 0
	let attempt = 0
	const { exponentialBackoff, jitter } = options
	const backoffBase = options.backoffBase ?? DEFAULT_BACKOFF_BASE
	const maxDelay = options.maxDelay ?? DEFAULT_MAX_DELAY

	// Note: not sure this translates perfectly to synchronous code
	while (true) {
		try {
			attempt += 1
			const result = fn()
			return result
		} catch (error) {
			if (retries <= 0) throw error
			const isConflict = error instanceof ReadWriteConflictError
			if (!isConflict) throw error

			// If there is exponential backoff, update the delay
			if (exponentialBackoff) {
				delay = Math.min(backoffBase * 2 ** attempt, maxDelay)
			}

			// If there is jitter, randomize the delay to the current range
			if (jitter) {
				delay = randomBetween(0, delay || maxDelay)
			}
			retries -= 1

			if (delay) {
				new Promise((resolve) => setTimeout(resolve, delay))
			}
		}
	}
}

function randomBetween(min: number, max: number) {
	return Math.floor(Math.random() * (max - min + 1) + min)
}
