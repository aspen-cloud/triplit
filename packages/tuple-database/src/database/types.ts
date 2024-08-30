import { MAX, MIN, Tuple } from "../storage/types.js"
import { RemoveTuplePrefix, TuplePrefix } from "./typeHelpers.js"

export type ScanArgs<
	T extends Tuple,
	P extends TuplePrefix<T>
> = PrefixScanArgs<T, P>

export type PrefixScanArgs<T extends Tuple, P extends TuplePrefix<T>> = {
	prefix?: P
	gt?: AllowMinMax<TuplePrefix<RemoveTuplePrefix<T, P>>>
	gte?: AllowMinMax<TuplePrefix<RemoveTuplePrefix<T, P>>>
	lt?: AllowMinMax<TuplePrefix<RemoveTuplePrefix<T, P>>>
	lte?: AllowMinMax<TuplePrefix<RemoveTuplePrefix<T, P>>>
	limit?: number
	reverse?: boolean
}

type AllowMinMax<T extends Tuple> = {
	[K in keyof T]: T[K] | typeof MIN | typeof MAX
}

export type TxId = string

export type Unsubscribe = () => void
