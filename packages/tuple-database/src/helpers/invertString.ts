/**
 * This is helpful when you have a fixed-length string that you want to sort in reverse order.
 * For example, and ISO date string.
 */
export function invertString(str: string) {
	return str
		.split("")
		.map((char) => String.fromCharCode(-1 * char.charCodeAt(0)))
		.join("")
}
