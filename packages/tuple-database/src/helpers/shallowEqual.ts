import { intersection, isArray } from "remeda"
import { isPlainObject } from "./isPlainObject"

export function shallowEqual(a: any, b: any) {
	if (a == b) return true
	if (isArray(a)) {
		if (!isArray(b)) return false
		if (a.length !== b.length) return false
		return a.every((x, i) => b[i] === x)
	}
	if (isPlainObject(a)) {
		if (!isPlainObject(b)) return false
		const aKeys = Object.keys(a)
		const bKeys = Object.keys(b)
		if (aKeys.length !== bKeys.length) return false
		const sameKeys = intersection(aKeys, bKeys)
		if (aKeys.length !== sameKeys.length) return false
		return aKeys.every((key) => a[key] == b[key])
	}
	return false
}
