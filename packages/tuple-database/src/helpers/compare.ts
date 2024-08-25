export type Compare<T> = (a: T, b: T) => number

export function compare<K extends string | number | boolean>(
	a: K,
	b: K
): number {
	if (a > b) {
		return 1
	}
	if (a < b) {
		return -1
	}
	return 0
}
