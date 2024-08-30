// This codec is should create a component-wise lexicographically sortable array.

// @ts-expect-error
import * as elen from "elen"
import { invert, sortBy } from "remeda"
import { isPlainObject } from "./isPlainObject.js"
import { Tuple, Value } from "../storage/types.js"
import { compare } from "./compare.js"
import { UnreachableError } from "./Unreachable.js"

export type EncodingOptions = {
	delimiter?: string
	escape?: string
	disallow?: string[]
}

// null < object < array < number < string < boolean
export const encodingByte = {
	null: "b",
	object: "c",
	array: "d",
	number: "e",
	string: "f",
	boolean: "g",
} as const

export type EncodingType = keyof typeof encodingByte

export const encodingRank = new Map<EncodingType, number>(
	sortBy(Object.entries(encodingByte), ([key, value]) => value).map(
		([key], i) => [key as EncodingType, i]
	)
)

export function encodeValue(value: Value, options?: EncodingOptions): string {
	if (value === null) {
		return encodingByte.null
	}
	if (value === true || value === false) {
		return encodingByte.boolean + value
	}
	if (typeof value === "string") {
		for (const disallowed of options?.disallow ?? []) {
			if (value.includes(disallowed)) {
				throw new Error(`Disallowed character found: ${disallowed}.`)
			}
		}
		return encodingByte.string + value
	}
	if (typeof value === "number") {
		return encodingByte.number + elen.encode(value)
	}
	if (Array.isArray(value)) {
		return encodingByte.array + encodeTuple(value, options)
	}
	if (typeof value === "object") {
		return encodingByte.object + encodeObjectValue(value, options)
	}
	throw new UnreachableError(value, "Unknown value type")
}

export function encodingTypeOf(value: Value): EncodingType {
	if (value === null) {
		return "null"
	}
	if (value === true || value === false) {
		return "boolean"
	}
	if (typeof value === "string") {
		return "string"
	}
	if (typeof value === "number") {
		return "number"
	}
	if (Array.isArray(value)) {
		return "array"
	}
	if (typeof value === "object") {
		return "object"
	}
	throw new UnreachableError(value, "Unknown value type")
}

const decodeType = invert(encodingByte) as {
	[key: string]: keyof typeof encodingByte
}

export function decodeValue(str: string, options?: EncodingOptions): Value {
	const encoding: EncodingType = decodeType[str[0]]
	const rest = str.slice(1)

	if (encoding === "null") {
		return null
	}
	if (encoding === "boolean") {
		return JSON.parse(rest)
	}
	if (encoding === "string") {
		return rest
	}
	if (encoding === "number") {
		return elen.decode(rest)
	}
	if (encoding === "array") {
		return decodeTuple(rest, options)
	}
	if (encoding === "object") {
		return decodeObjectValue(rest, options)
	}
	throw new UnreachableError(encoding, "Invalid encoding byte")
}

export function encodeTuple(tuple: Tuple, options?: EncodingOptions) {
	const delimiter = options?.delimiter ?? "\x00"
	const escape = options?.escape ?? "\x01"
	const reEscapeByte = new RegExp(`${escape}`, "g")
	const reDelimiterByte = new RegExp(`${delimiter}`, "g")
	return tuple
		.map((value, i) => {
			const encoded = encodeValue(value, options)
			return (
				encoded
					// B -> BB or \ -> \\
					.replace(reEscapeByte, escape + escape)
					// A -> BA or x -> \x
					.replace(reDelimiterByte, escape + delimiter) + delimiter
			)
		})
		.join("")
}

export function decodeTuple(str: string, options?: EncodingOptions) {
	if (str === "") {
		return []
	}

	const delimiter = options?.delimiter ?? "\x00"
	const escape = options?.escape ?? "\x01"

	// Capture all of the escaped BB and BA pairs and wait
	// til we find an exposed A.
	const matcher = new RegExp(
		`(${escape}(${escape}|${delimiter})|${delimiter})`,
		"g"
	)
	const reEncodedEscape = new RegExp(escape + escape, "g")
	const reEncodedDelimiter = new RegExp(escape + delimiter, "g")
	const tuple: Tuple = []
	let start = 0
	while (true) {
		const match = matcher.exec(str)
		if (match === null) {
			return tuple
		}
		if (match[0][0] === escape) {
			// If we match a escape+escape or escape+delimiter then keep going.
			continue
		}
		const end = match.index
		const escaped = str.slice(start, end)
		if (typeof escaped !== "string") {
			console.log(escaped)
		}
		const unescaped = escaped
			// BB -> B
			.replace(reEncodedEscape, escape)
			// BA -> A
			.replace(reEncodedDelimiter, delimiter)
		const decoded = decodeValue(unescaped, options)
		tuple.push(decoded)
		// Skip over the \x00.
		start = end + 1
	}
}

function encodeObjectValue(obj: object, options?: EncodingOptions) {
	if (!isPlainObject(obj)) {
		throw new Error("Cannot serialize this object.")
	}
	const entries = Object.entries(obj)
		.sort(([k1], [k2]) => compare(k1, k2))
		// We allow undefined values in objects, but we want to strip them out before
		// serializing.
		.filter(([key, value]) => value !== undefined)
	return encodeTuple(entries as Tuple, options)
}

function decodeObjectValue(str: string, options?: EncodingOptions) {
	const entries = decodeTuple(str, options) as Array<[string, Value]>
	const obj: Record<string, any> = {}
	for (const [key, value] of entries) {
		obj[key] = value
	}
	return obj
}
