import { isDeepEqual, omitBy } from "remeda"
import { ScanArgs } from "../database/types.js"
import {
	KeyValuePair,
	ScanStorageArgs,
	Tuple,
	WriteOps,
} from "../storage/types.js"
import { normalizeTupleBounds } from "./sortedTupleArray.js"

export function prependPrefixToTuple(prefix: Tuple, tuple: Tuple): Tuple {
	if (!prefix.length) return tuple
	return [...prefix, ...tuple]
}

function prependPrefixToTuples(prefix: Tuple, tuples: Tuple[]): Tuple[] {
	if (!prefix.length) return tuples
	return tuples.map((tuple) => prependPrefixToTuple(prefix, tuple))
}

function prependPrefixToTupleValuePair(
	prefix: Tuple,
	pair: KeyValuePair
): KeyValuePair {
	if (!prefix.length) return pair
	const { key, value } = pair
	return {
		key: prependPrefixToTuple(prefix, key),
		value,
	}
}

function prependPrefixToTupleValuePairs(
	prefix: Tuple,
	pairs: KeyValuePair[]
): KeyValuePair[] {
	if (!prefix.length) return pairs
	return pairs.map((pair) => prependPrefixToTupleValuePair(prefix, pair))
}

export function prependPrefixToWriteOps(
	prefix: Tuple,
	writes: WriteOps
): WriteOps {
	if (!prefix.length) return writes
	const set = writes.set
		? prependPrefixToTupleValuePairs(prefix, writes.set)
		: undefined

	const remove = writes.remove
		? prependPrefixToTuples(prefix, writes.remove)
		: undefined

	return { set, remove }
}

export function removePrefixFromWriteOps(
	prefix: Tuple,
	writes: WriteOps
): WriteOps {
	if (!prefix.length) return writes
	const set = writes.set
		? removePrefixFromTupleValuePairs(prefix, writes.set)
		: undefined

	const remove = writes.remove
		? removePrefixFromTuples(prefix, writes.remove)
		: undefined

	return { set, remove }
}

export function removePrefixFromTuple(prefix: Tuple, tuple: Tuple) {
	if (!prefix.length) return tuple
	if (!isDeepEqual(tuple.slice(0, prefix.length), prefix)) {
		throw new Error("Invalid prefix: " + JSON.stringify({ prefix, tuple }))
	}
	return tuple.slice(prefix.length)
}

function removePrefixFromTuples(prefix: Tuple, tuples: Tuple[]) {
	if (!prefix.length) return tuples
	return tuples.map((tuple) => removePrefixFromTuple(prefix, tuple))
}

function removePrefixFromTupleValuePair(
	prefix: Tuple,
	pair: KeyValuePair
): KeyValuePair {
	if (!prefix.length) return pair
	const { key, value } = pair
	return { key: removePrefixFromTuple(prefix, key), value }
}

export function removePrefixFromTupleValuePairs(
	prefix: Tuple,
	pairs: KeyValuePair[]
): KeyValuePair[] {
	if (!prefix.length) return pairs
	return pairs.map((pair) => removePrefixFromTupleValuePair(prefix, pair))
}

export function normalizeSubspaceScanArgs(
	subspacePrefix: Tuple,
	args: ScanArgs<Tuple, any>
): ScanStorageArgs {
	const prefix = args.prefix
		? [...subspacePrefix, ...args.prefix]
		: subspacePrefix

	const bounds = normalizeTupleBounds({ ...args, prefix })
	const { limit, reverse } = args

	return omitBy({ ...bounds, limit, reverse }, (x) => x === undefined)
}
