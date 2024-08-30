import { ScanArgs } from "../database/types.js"
import { KeyValuePair, Tuple } from "../storage/types.js"
import { compareTuple } from "./compareTuple.js"
import * as sortedList from "./sortedList.js"
import { normalizeTupleBounds } from "./sortedTupleArray.js"

export function compareTupleValuePair(a: KeyValuePair, b: KeyValuePair) {
	return compareTuple(a.key, b.key)
}

function compareTupleValuePairReverse(a: KeyValuePair, b: KeyValuePair) {
	return compareTuple(a.key, b.key) * -1
}

export function set(
	data: KeyValuePair[],
	key: Tuple,
	value: any,
	reverse = false
) {
	return sortedList.set(
		data,
		{ key, value },
		reverse ? compareTupleValuePairReverse : compareTupleValuePair
	)
}

export function remove(data: KeyValuePair[], key: Tuple, reverse = false) {
	return sortedList.remove(
		data,
		{ key, value: null },
		reverse ? compareTupleValuePairReverse : compareTupleValuePair
	)
}

export function get(data: KeyValuePair[], key: Tuple, reverse = false) {
	const pair = sortedList.get(
		data,
		{ key, value: null },
		reverse ? compareTupleValuePairReverse : compareTupleValuePair
	)
	if (pair !== undefined) return pair.value
}

export function exists(data: KeyValuePair[], key: Tuple, reverse = false) {
	return sortedList.exists(
		data,
		{ key, value: null },
		reverse ? compareTupleValuePairReverse : compareTupleValuePair
	)
}

function normalizeTupleValuePairBounds(args: ScanArgs<Tuple, any>) {
	const bounds = normalizeTupleBounds(args)
	const { gt, lt, gte, lte } = bounds
	return {
		gt: gt ? ({ key: gt, value: null } as KeyValuePair) : undefined,
		gte: gte ? ({ key: gte, value: null } as KeyValuePair) : undefined,
		lt: lt ? ({ key: lt, value: null } as KeyValuePair) : undefined,
		lte: lte ? ({ key: lte, value: null } as KeyValuePair) : undefined,
	}
}

export function scan(data: KeyValuePair[], args: ScanArgs<Tuple, any> = {}) {
	const { limit, reverse, ...rest } = args
	const bounds = normalizeTupleValuePairBounds(rest)
	return sortedList.scan(
		data,
		{ limit, reverse, ...bounds },
		compareTupleValuePair
	)
}
