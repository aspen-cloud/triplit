export function enumerate<T>(array: T[]): [number, T][] {
	const pairs: [number, T][] = []
	for (let i = 0; i < array.length; i++) {
		pairs.push([i, array[i]])
	}
	return pairs
}

export function enumerateReverse<T>(array: T[]): [number, T][] {
	const pairs: [number, T][] = []
	for (let i = array.length - 1; i >= 0; i--) {
		pairs.push([i, array[i]])
	}
	return pairs
}
