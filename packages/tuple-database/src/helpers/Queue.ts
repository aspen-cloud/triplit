export type Thunk<T> = () => Promise<T> | T

export class Queue {
	private currentPromise: Promise<any> | undefined

	public enqueue<T>(fn: Thunk<T>): Promise<T> | T {
		if (this.currentPromise) {
			const nextPromise = this.currentPromise.then(fn).then((result) => {
				if (this.currentPromise === nextPromise) this.currentPromise = undefined
				return result
			})
			this.currentPromise = nextPromise
			return nextPromise
		}

		const result = fn()
		if (result instanceof Promise) {
			const nextPromise = result.then((result) => {
				if (this.currentPromise === nextPromise) this.currentPromise = undefined
				return result
			})
			this.currentPromise = nextPromise
			return nextPromise
		}

		return result
	}
}
