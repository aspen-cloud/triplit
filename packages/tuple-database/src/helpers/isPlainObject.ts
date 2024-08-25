export function isPlainObject(value: any): boolean {
	if (value === null || typeof value !== "object") {
		return false
	}
	const proto = Object.getPrototypeOf(value)
	return proto === Object.prototype || proto === null
}
