import { isPlainObject } from "./isPlainObject.js"
import { Tuple, Value } from "../storage/types.js"
import { encodingRank, encodingTypeOf } from "./codec.js"
import { compare } from "./compare.js"
import { UnreachableError } from "./Unreachable.js"

export function compareValue(a: Value, b: Value): number {
	const at = encodingTypeOf(a)
	const bt = encodingTypeOf(b)
	if (at === bt) {
		if (at === "array") {
			return compareTuple(a as any, b as any)
		} else if (at === "object") {
			if (a === b) return 0
			// TODO: prototype.compare for classes.
			// NOTE: it's a bit contentious to allow for unsortable data inside a sorted array.
			// But it is convenient at times to be able to do this sometimes and just assume that
			// thee classes are unsorted.
			if (isPlainObject(a)) {
				if (isPlainObject(b)) {
					// Plain objects are ordered.
					// This is convenient for meta types like `{date: "2021-12-01"}` =>  [["date", "2021-12-01"]]
					return compareObject(a as any, b as any)
				} else {
					// json > class
					return -1
				}
			} else if (isPlainObject(b)) {
				// json > class
				return 1
			} else {
				// class != class
				return 1
			}
		} else if (at === "boolean") {
			return compare(a as boolean, b as boolean)
		} else if (at === "null") {
			return 0
		} else if (at === "number") {
			return compare(a as number, b as number)
		} else if (at === "string") {
			return compare(a as string, b as string)
		} else {
			throw new UnreachableError(at)
		}
	}

	return compare(encodingRank.get(at)!, encodingRank.get(bt)!)
}

function compareObject(
	a: { [key: string]: Value },
	b: { [key: string]: Value }
) {
	const ae = Object.entries(a)
		.filter(([k, v]) => v !== undefined)
		.sort(([k1], [k2]) => compare(k1, k2))
	const be = Object.entries(b)
		.filter(([k, v]) => v !== undefined)
		.sort(([k1], [k2]) => compare(k1, k2))

	const len = Math.min(ae.length, be.length)

	for (let i = 0; i < len; i++) {
		const [ak, av] = ae[i]
		const [bk, bv] = be[i]
		const dir = compareValue(ak, bk)
		if (dir === 0) {
			const dir2 = compareValue(av, bv)
			if (dir2 === 0) {
				continue
			}
			return dir2
		}
		return dir
	}

	if (ae.length > be.length) {
		return 1
	} else if (ae.length < be.length) {
		return -1
	} else {
		return 0
	}
}

export function compareTuple(a: Tuple, b: Tuple) {
	const len = Math.min(a.length, b.length)

	for (let i = 0; i < len; i++) {
		const dir = compareValue(a[i], b[i])
		if (dir === 0) {
			continue
		}
		return dir
	}

	if (a.length > b.length) {
		return 1
	} else if (a.length < b.length) {
		return -1
	} else {
		return 0
	}
}

export function ValueToString(value: Value) {
	if (value === null) {
		return "null"
	} else {
		return JSON.stringify(value)
	}
}

export function TupleToString(tuple: Tuple) {
	return `[${tuple.map(ValueToString).join(",")}]`
}
