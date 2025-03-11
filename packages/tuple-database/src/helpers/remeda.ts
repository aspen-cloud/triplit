export function shuffle<T>(items: ReadonlyArray<T>): Array<T> {
	const result = [...items]
	for (let index = 0; index < items.length; index++) {
		const rand = index + Math.floor(Math.random() * (items.length - index))
		const value = result[rand]!
		result[rand] = result[index]!
		result[index] = value
	}
	return result
}

export function sumBy<T>(
	array: ReadonlyArray<T>,
	callbackfn: (value: T, index: number, data: ReadonlyArray<T>) => number
): number {
	const iter = array.entries()

	const firstEntry = iter.next()
	if (firstEntry.done ?? false) {
		return 0
	}

	const {
		value: [, firstValue],
	} = firstEntry
	let sum = callbackfn(firstValue, 0, array)
	for (const [index, item] of iter) {
		const summand = callbackfn(item, index, array)
		sum += summand
	}
	return sum
}

export function range(start: number, end: number): Array<number> {
	const ret: Array<number> = []
	for (let i = start; i < end; i++) {
		ret.push(i)
	}
	return ret
}

export function invert(
	data: Readonly<Record<PropertyKey, PropertyKey>>
): Record<PropertyKey, PropertyKey> {
	const result: Record<PropertyKey, PropertyKey> = {}

	for (const [key, value] of Object.entries(data)) {
		result[value] = key
	}

	return result
}

export function chunk<T>(
	data: ReadonlyArray<T>,
	size: number
): Array<Array<T>> {
	if (size < 1) {
		throw new RangeError(
			`chunk: A chunk size of '${size.toString()}' would result in an infinite array`
		)
	}

	if (data.length === 0) {
		return []
	}

	if (size >= data.length) {
		// Optimized for when there is only one chunk.
		return [[...data]]
	}

	const chunks = Math.ceil(data.length / size)

	// eslint-disable-next-line unicorn/no-new-array -- This is OK, a sparse array allows us to handle very large arrays more efficiently.
	const result = new Array<Array<T>>(chunks)

	if (size === 1) {
		// Optimized for when we don't need slice.
		for (const [index, item] of data.entries()) {
			result[index] = [item]
		}
	} else {
		for (let index = 0; index < chunks; index += 1) {
			const start = index * size
			result[index] = data.slice(start, start + size)
		}
	}

	return result
}

export function omitBy<T extends object>(
	data: T,
	predicate: (value: unknown, key: string, data: T) => boolean
): Record<string, unknown> {
	const out: Partial<Record<string, unknown>> = { ...data }

	for (const [key, value] of Object.entries(out)) {
		if (predicate(value, key, data)) {
			// eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- This is the best way to do it!
			delete out[key]
		}
	}

	return out
}

/**
 * Returns a list of elements that exist in both array. The output maintains the
 * same order as the input. The inputs are treated as multi-sets/bags (multiple
 * copies of items are treated as unique items).
 *
 * @param data - The input items.
 * @param other - The items to compare against.
 * @signature
 *    R.intersection(data, other)
 * @example
 *    R.intersection([1, 2, 3], [2, 3, 5]); // => [2, 3]
 *    R.intersection([1, 1, 2, 2], [1]); // => [1]
 * @dataFirst
 * @lazy
 * @category Array
 */
export function intersection<T, S>(
	data: ReadonlyArray<T>,
	other: ReadonlyArray<S>
): Array<S & T> {
	const set = new Set(data)
	return other.filter((item) =>
		set.has(
			// @ts-expect-error
			item
		)
	) as Array<S & T>
}

export function isDeepEqual<T>(data: unknown, other: T): data is T {
	if (data === other) {
		return true
	}

	if (Object.is(data, other)) {
		// We want to ignore the slight differences between `===` and `Object.is` as
		// both of them largely define equality from a semantic point-of-view.
		return true
	}

	if (typeof data !== "object" || typeof other !== "object") {
		return false
	}

	if (data === null || other === null) {
		return false
	}

	if (Object.getPrototypeOf(data) !== Object.getPrototypeOf(other)) {
		// If the objects don't share a prototype it's unlikely that they are
		// semantically equal. It is technically possible to build 2 prototypes that
		// act the same but are not equal (at the reference level, checked via
		// `===`) and then create 2 objects that are equal although we would fail on
		// them. Because this is so unlikely, the optimization we gain here for the
		// rest of the function by assuming that `other` is of the same type as
		// `data` is more than worth it.
		return false
	}

	if (Array.isArray(data)) {
		return isDeepEqualArrays(data, other as unknown as ReadonlyArray<unknown>)
	}

	if (data instanceof Map) {
		return isDeepEqualMaps(data, other as unknown as Map<unknown, unknown>)
	}

	if (data instanceof Set) {
		return isDeepEqualSets(data, other as unknown as Set<unknown>)
	}

	if (data instanceof Date) {
		return data.getTime() === (other as unknown as Date).getTime()
	}

	if (data instanceof RegExp) {
		return data.toString() === (other as unknown as RegExp).toString()
	}

	// At this point we only know that the 2 objects share a prototype and are not
	// any of the previous types. They could be plain objects (Object.prototype),
	// they could be classes, they could be other built-ins, or they could be
	// something weird. We assume that comparing values by keys is enough to judge
	// their equality.

	if (Object.keys(data).length !== Object.keys(other).length) {
		return false
	}

	for (const [key, value] of Object.entries(data)) {
		if (!(key in other)) {
			return false
		}

		if (
			!isDeepEqual(
				value,
				// @ts-expect-error [ts7053] - We already checked that `other` has `key`
				other[key]
			)
		) {
			return false
		}
	}

	return true
}

function isDeepEqualArrays(
	data: ReadonlyArray<unknown>,
	other: ReadonlyArray<unknown>
): boolean {
	if (data.length !== other.length) {
		return false
	}

	for (const [index, item] of data.entries()) {
		if (!isDeepEqual(item, other[index])) {
			return false
		}
	}

	return true
}

function isDeepEqualMaps(
	data: ReadonlyMap<unknown, unknown>,
	other: ReadonlyMap<unknown, unknown>
): boolean {
	if (data.size !== other.size) {
		return false
	}

	for (const [key, value] of data.entries()) {
		if (!other.has(key)) {
			return false
		}

		if (!isDeepEqual(value, other.get(key))) {
			return false
		}
	}

	return true
}

function isDeepEqualSets(
	data: ReadonlySet<unknown>,
	other: ReadonlySet<unknown>
): boolean {
	if (data.size !== other.size) {
		return false
	}

	// To ensure we only count each item once we need to "remember" which items of
	// the other set we've already matched against. We do this by creating a copy
	// of the other set and removing items from it as we find them in the data
	// set.
	const otherCopy = [...other]

	for (const dataItem of data) {
		let isFound = false

		for (const [index, otherItem] of otherCopy.entries()) {
			if (isDeepEqual(dataItem, otherItem)) {
				isFound = true
				otherCopy.splice(index, 1)
				break
			}
		}

		if (!isFound) {
			return false
		}
	}

	return true
}
