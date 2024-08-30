import { isPlainObject } from "./isPlainObject.js"
import { Tuple, Value } from "../storage/types.js"

// It is convenient to use named tuples when defining a schema so that you
// don't get confused what [string, number] is and can instead write something
// like [{playerId: string}, {score: number}].
type NamedTupleItem = { [key: string | number]: Value }

// When we have a named tuple, we can merge all items into an object that is
// more convenient to work with:
export type NamedTupleToObject<T extends Tuple> = CleanUnionToIntersection<
	Extract<T[number], NamedTupleItem>
>

function isNamedTupleItem(value: Value): value is NamedTupleItem {
	return isPlainObject(value)
}

export function namedTupleToObject<T extends Tuple>(key: T) {
	const obj = key
		.filter(isNamedTupleItem)
		.reduce((obj, item) => Object.assign(obj, item), {})
	return obj as NamedTupleToObject<T>
}

// Some type wizardry.
// https://stackoverflow.com/questions/63542526/merge-discriminated-union-of-object-types-in-typescript
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
	k: infer I
) => void
	? I
	: never

type CleanUnionToIntersection<U> = UnionToIntersection<U> extends infer O
	? { [K in keyof O]: O[K] }
	: never
