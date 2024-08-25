/*

Just basic JSON data-types. This is a pragmatic decision:
- If we have custom data types in here, we have to consider how to deserialize
	into different languages. For JavaScript, that means creating a class. But
	these classes don't serialize well over a JSON bridge between processes.
- The kind of data types we might want is endless. To start, I can think of
	{uuid: string}, {date: string} but then there's things like {url: string} or
	{phone: string} which dive deeper into application-level concepts.

So that is why this database layer only deals with JSON.

*/

export type Value = string | number | boolean | null | Array<Value> | object

export type Tuple = Value[]

export type KeyValuePair = { key: Tuple; value: any }

export const MIN = null
export const MAX = true

export type WriteOps<S extends KeyValuePair = KeyValuePair> = {
	set?: S[]
	remove?: S["key"][]
}

export type ScanStorageArgs = {
	gt?: Tuple
	gte?: Tuple
	lt?: Tuple
	lte?: Tuple
	limit?: number
	reverse?: boolean
}
