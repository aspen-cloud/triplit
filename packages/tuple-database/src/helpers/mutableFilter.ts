export function mutableFilter<T>(array: T[], fn: (item: T) => boolean) {
	let i = 0
	while (true) {
		if (i >= array.length) break
		const item = array[i]
		if (fn(item)) {
			i++
		} else {
			array.splice(i, 1)
		}
	}
}
