export function maybePromiseAll(values: any[]): any {
	if (values.some((value) => value instanceof Promise))
		return Promise.all(
			values.map((value) => {
				// Gobble up errors.
				if (value instanceof Promise) {
					return value.catch((error) => console.error(error))
				} else {
					return value
				}
			})
		)
	else return values
}
