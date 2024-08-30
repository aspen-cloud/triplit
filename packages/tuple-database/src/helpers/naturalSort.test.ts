import { describe, it, expect } from "bun:test"
import { invertString } from "./invertString.js"

type ParseTest = [string, number]

const digitsTest: ParseTest[] = [
	["1", 1],
	["2", 2],
	["20", 20],
	["24", 24],
	["024", 24],
	["0024", 24],
]

const decimalsTest: ParseTest[] = [
	["0.1", 0.1],
	[".1", 0.1],
	[".12", 0.12],
	["12.12", 12.12],
	["012.1200", 12.12],
]

function toNegative([a, b]: ParseTest): ParseTest {
	return ["-" + a, -1 * b]
}

function toPositive([a, b]: ParseTest): ParseTest {
	return ["+" + a, b]
}

const negativeDigits: ParseTest[] = digitsTest.map(toNegative)
const positiveDigits: ParseTest[] = digitsTest.map(toPositive)

const negativeDecimals: ParseTest[] = decimalsTest.map(toNegative)
const positiveDecimals: ParseTest[] = decimalsTest.map(toPositive)

const scientificNotation: ParseTest[] = [
	["1e3", 1000],
	["1e-2", 0.01],
	["1.2e-2", 0.012],
	["1.20e-2", 0.012],
	["01.20e-2", 0.012],
	["10.20e-2", 0.102],
	["10.20e2", 1020],
]

const negativeScientificNotation: ParseTest[] =
	scientificNotation.map(toNegative)
const positiveScientificNotation: ParseTest[] =
	scientificNotation.map(toPositive)

const commaNumbers: ParseTest[] = [
	["1,000", 1000],
	["1,000.4", 1000.4],
	["-1,000,000.4", -1000000.4],
	["-1,000,000.4e-6", -1.0000004],
	["+1,000e3", -1000000],
]

describe("parseNumber", () => {
	const data = [
		"aaa",
		"aab",
		"aac",
		"aba",
		"abc",
		"aca",
		"acc",
		"bbb",
		"bca",
		"bcb",
		"caa",
		"cab",
		"ccc",
	]

	it("can encode and decode properly", () => {
		for (const str of data) {
			expect(invertString(invertString(str))).toStrictEqual(str)
		}
	})

	it("inversion is reverse sorted", () => {
		const sorted = [...data].sort()
		expect(sorted).toStrictEqual(data)

		const inverseSorted = sorted.map(invertString).sort().map(invertString)
		expect(inverseSorted).toStrictEqual(sorted.reverse())
	})
})
