import { binarySearch } from "./binarySearch"
import { Compare } from "./compare"

export function set<T>(list: T[], item: T, cmp: Compare<T>) {
	const result = binarySearch(list, item, cmp)
	if (result.found !== undefined) {
		// Replace the whole item.
		list.splice(result.found, 1, item)
	} else {
		// Insert at missing index.
		list.splice(result.closest, 0, item)
	}
}

export function get<T>(list: T[], item: T, cmp: Compare<T>) {
	const result = binarySearch(list, item, cmp)
	if (result.found === undefined) return
	return list[result.found]
}

export function exists<T>(list: T[], item: T, cmp: Compare<T>) {
	const result = binarySearch(list, item, cmp)
	return result.found !== undefined
}

export function remove<T>(list: T[], item: T, cmp: Compare<T>) {
	let { found } = binarySearch(list, item, cmp)
	if (found !== undefined) {
		// Remove from index.
		return list.splice(found, 1)[0]
	}
}

type ScanArgs<T> = {
	gt?: T
	gte?: T
	lt?: T
	lte?: T
	limit?: number
	reverse?: boolean
}

export function scan<T>(list: T[], args: ScanArgs<T>, cmp: Compare<T>) {
	const start = args.gte || args.gt
	const end = args.lte || args.lt

	if (start !== undefined && end !== undefined && cmp(start, end) > 0) {
		throw new Error("Invalid bounds.")
	}

	let lowerSearchBound: number
	let upperSearchBound: number

	if (start === undefined) {
		lowerSearchBound = 0
	} else {
		const result = binarySearch(list, start, cmp)
		if (result.found === undefined) {
			lowerSearchBound = result.closest
		} else {
			if (args.gt) lowerSearchBound = result.found + 1
			else lowerSearchBound = result.found
		}
	}

	if (end === undefined) {
		upperSearchBound = list.length
	} else {
		const result = binarySearch(list, end, cmp)
		if (result.found === undefined) {
			upperSearchBound = result.closest
		} else {
			if (args.lt) upperSearchBound = result.found
			else upperSearchBound = result.found + 1
		}
	}

	const lowerDataBound =
		args.reverse && args.limit
			? Math.max(lowerSearchBound, upperSearchBound - args.limit)
			: lowerSearchBound
	const upperDataBound =
		!args.reverse && args.limit
			? Math.min(lowerSearchBound + args.limit, upperSearchBound)
			: upperSearchBound

	return args.reverse
		? list.slice(lowerDataBound, upperDataBound).reverse()
		: list.slice(lowerDataBound, upperDataBound)
}
