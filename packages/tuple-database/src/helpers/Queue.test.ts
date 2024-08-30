import { describe, it, expect } from "bun:test"
import { Queue } from "./Queue.js"

describe("Queue", () => {
	it("evaluates synchronously", () => {
		const q = new Queue()

		const items: any[] = []

		q.enqueue(() => items.push(1))
		expect(items).toEqual([1])

		q.enqueue(() => items.push(2))
		expect(items).toEqual([1, 2])
	})

	it("evaluates asynchronously", async () => {
		const q = new Queue()

		const items: any[] = []

		const d1 = new DeferredPromise()
		const q1 = q.enqueue(async () => {
			await d1.promise
			items.push(1)
		})

		const d2 = new DeferredPromise()
		const q2 = q.enqueue(async () => {
			await d2.promise
			items.push(2)
		})

		expect(items).toEqual([])

		d1.resolve()
		await q1
		expect(items).toEqual([1])

		d2.resolve()
		await q2
		expect(items).toEqual([1, 2])
	})
})

/**
 * A Promise utility that lets you specify the resolve/reject after the promise is made
 * (or outside of the Promise constructor)
 */
class DeferredPromise<T = void> {
	resolve!: (value: T) => void
	reject!: (error: any) => void
	promise: Promise<T>
	constructor() {
		this.promise = new Promise((resolve, reject) => {
			this.resolve = resolve
			this.reject = reject
		})
	}
}
