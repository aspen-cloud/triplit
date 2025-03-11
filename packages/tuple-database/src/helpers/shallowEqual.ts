import { intersection } from "../helpers/remeda.js"
import { isPlainObject } from "./isPlainObject.js"

export function shallowEqual(a: any, b: any) {
	if (a == b) return true
	if (Array.isArray(a)) {
		if (!Array.isArray(b)) return false
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
