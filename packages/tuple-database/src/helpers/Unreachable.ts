export class UnreachableError extends Error {
	constructor(obj: never, message?: string) {
		super((message + ": " || "Unreachable: ") + obj)
	}
}
