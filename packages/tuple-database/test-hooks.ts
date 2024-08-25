import { beforeAll, afterAll } from "bun:test"
import { $ } from "bun"

beforeAll(async () => {
	// global setup
	await $`rm -rf ./tmp`
})

afterAll(async () => {
	// global teardown
	await $`rm -rf ./tmp`
})
