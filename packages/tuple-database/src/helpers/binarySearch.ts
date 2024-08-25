import { Compare } from "./compare"

export type BinarySearchResult =
	| { found: number; closest?: undefined }
	| { found?: undefined; closest: number }

// This binary search is generalized so that we can use it for both normal lists
// as well as associative lists.
export function generalizedBinarySearch<I, V>(
	getValue: (item: I) => V,
	cmp: Compare<V>
) {
	return function (list: Array<I>, item: V): BinarySearchResult {
		var min = 0
		var max = list.length - 1
		while (min <= max) {
			var k = (max + min) >> 1
			var dir = cmp(item, getValue(list[k]))
			if (dir > 0) {
				min = k + 1
			} else if (dir < 0) {
				max = k - 1
			} else {
				return { found: k }
			}
		}
		return { closest: min }
	}
}

export function binarySearch<T>(list: T[], item: T, cmp: Compare<T>) {
	return generalizedBinarySearch<T, T>((x) => x, cmp)(list, item)
}

export function binarySearchAssociativeList<T>(
	list: [T, any][],
	item: T,
	cmp: Compare<T>
) {
	return generalizedBinarySearch<[T, any], T>((x) => x[0], cmp)(list, item)
}
