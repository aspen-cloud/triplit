import { omitBy } from "../helpers/remeda.js"
import { ScanArgs } from "../database/types.js"
import { MAX, Tuple } from "../storage/types.js"
import { compareTuple } from "./compareTuple.js"
import * as sortedList from "./sortedList.js"

export function set(data: Array<Tuple>, tuple: Tuple) {
	return sortedList.set(data, tuple, compareTuple)
}

export function exists(data: Array<Tuple>, tuple: Tuple) {
	return sortedList.exists(data, tuple, compareTuple)
}

export function remove(data: Array<Tuple>, tuple: Tuple) {
	return sortedList.remove(data, tuple, compareTuple)
}

export const MaxTuple = [MAX, MAX, MAX, MAX, MAX, MAX, MAX, MAX, MAX, MAX]

/**
 * Gets the tuple bounds taking into account any prefix specified.
 */
export function normalizeTupleBounds(args: ScanArgs<Tuple, any>): Bounds {
	let gte: Tuple | undefined
	let gt: Tuple | undefined
	let lte: Tuple | undefined
	let lt: Tuple | undefined

	if (args.gte) {
		if (args.prefix) {
			gte = [...args.prefix, ...args.gte]
		} else {
			gte = [...args.gte]
		}
	} else if (args.gt) {
		if (args.prefix) {
			gt = [...args.prefix, ...args.gt]
		} else {
			gt = [...args.gt]
		}
	} else if (args.prefix) {
		gte = [...args.prefix]
	}

	if (args.lte) {
		if (args.prefix) {
			lte = [...args.prefix, ...args.lte]
		} else {
			lte = [...args.lte]
		}
	} else if (args.lt) {
		if (args.prefix) {
			lt = [...args.prefix, ...args.lt]
		} else {
			lt = [...args.lt]
		}
	} else if (args.prefix) {
		// [MAX] is less than [true, "hello"]
		// So we're counting on there not being a really long, all true tuple.
		// TODO: ideally, we'd either specify a max tuple length, or we'd go
		// back to using symbols.
		lte = [...args.prefix, ...MaxTuple]
	}

	return omitBy({ gte, gt, lte, lt }, (x) => x === undefined)
}

export function getPrefixContainingBounds(bounds: Bounds) {
	const prefix: Tuple = []
	const start = bounds.gt || bounds.gte || []
	const end = bounds.lt || bounds.lte || []
	const len = Math.min(start.length, end.length)
	for (let i = 0; i < len; i++) {
		if (start[i] === end[i]) {
			prefix.push(start[i])
		} else {
			break
		}
	}
	return prefix
}

export function isTupleWithinBounds(tuple: Tuple, bounds: Bounds) {
	if (bounds.gt) {
		if (compareTuple(tuple, bounds.gt) !== 1) {
			return false
		}
	}
	if (bounds.gte) {
		if (compareTuple(tuple, bounds.gte) === -1) {
			return false
		}
	}
	if (bounds.lt) {
		if (compareTuple(tuple, bounds.lt) !== -1) {
			return false
		}
	}
	if (bounds.lte) {
		if (compareTuple(tuple, bounds.lte) === 1) {
			return false
		}
	}
	return true
}

export type Bounds = {
	/** This prevents developers from accidentally using ScanArgs instead of TupleBounds */
	prefix?: never
	gte?: Tuple
	gt?: Tuple
	lte?: Tuple
	lt?: Tuple
}

export function scan(data: Array<Tuple>, args: ScanArgs<Tuple, any> = {}) {
	const { limit, reverse, ...rest } = args
	const bounds = normalizeTupleBounds(rest)
	return sortedList.scan(data, { limit, reverse, ...bounds }, compareTuple)
}
