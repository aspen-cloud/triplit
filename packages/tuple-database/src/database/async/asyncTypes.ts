import { KeyValuePair, ScanStorageArgs, WriteOps } from "../../storage/types"
import {
	FilterTupleValuePairByPrefix,
	RemoveTupleValuePairPrefix,
	TuplePrefix,
	ValueForTuple,
} from "../typeHelpers"
import { ScanArgs, TxId, Unsubscribe } from "../types"

/** The low-level API for implementing new storage layers. */
export type AsyncTupleStorageApi = {
	scan: (args?: ScanStorageArgs) => Promise<KeyValuePair[]>
	commit: (writes: WriteOps) => Promise<void>
	close: () => Promise<void>
}

/** Wraps AsyncTupleStorageApi with reactivity and MVCC */
export type AsyncTupleDatabaseApi = {
	scan: (args?: ScanStorageArgs, txId?: TxId) => Promise<KeyValuePair[]>
	commit: (writes: WriteOps, txId?: TxId) => Promise<void>
	cancel: (txId: string) => Promise<void>
	subscribe: (
		args: ScanStorageArgs,
		callback: AsyncCallback
	) => Promise<Unsubscribe>
	close: () => Promise<void>
}

/** Wraps AsyncTupleDatabaseApi with types, subspaces, transaction objects, and additional read apis.  */
export type AsyncTupleDatabaseClientApi<S extends KeyValuePair = KeyValuePair> =
	{
		// Types
		commit: (writes: WriteOps<S>, txId?: TxId) => Promise<void>
		cancel: (txId: string) => Promise<void>
		scan: <T extends S["key"], P extends TuplePrefix<T>>(
			args?: ScanArgs<T, P>,
			txId?: TxId
		) => Promise<FilterTupleValuePairByPrefix<S, P>[]>
		subscribe: <T extends S["key"], P extends TuplePrefix<T>>(
			args: ScanArgs<T, P>,
			callback: AsyncCallback<FilterTupleValuePairByPrefix<S, P>>
		) => Promise<Unsubscribe>
		close: () => Promise<void>

		// ReadApis
		get: <T extends S["key"]>(
			tuple: T,
			txId?: TxId
		) => Promise<ValueForTuple<S, T> | undefined>
		exists: <T extends S["key"]>(tuple: T, txId?: TxId) => Promise<boolean>

		// Subspace
		subspace: <P extends TuplePrefix<S["key"]>>(
			prefix: P
		) => AsyncTupleDatabaseClientApi<RemoveTupleValuePairPrefix<S, P>>

		// Transaction
		/** Arguments to transact() are for internal use only. */
		transact: (
			txId?: TxId,
			writes?: WriteOps<S>
		) => AsyncTupleRootTransactionApi<S>
	}

export type AsyncTupleRootTransactionApi<
	S extends KeyValuePair = KeyValuePair
> = {
	// ReadApis
	// Same as AsyncTupleDatabaseClientApi without the txId argument.
	scan: <T extends S["key"], P extends TuplePrefix<T>>(
		args?: ScanArgs<T, P>
	) => Promise<FilterTupleValuePairByPrefix<S, P>[]>
	get: <T extends S["key"]>(
		tuple: T
	) => Promise<ValueForTuple<S, T> | undefined>
	exists: <T extends S["key"]>(tuple: T) => Promise<boolean>

	// Subspace
	// Demotes to a non-root transaction so you cannot commit, cancel, or inspect
	// the transaction.
	subspace: <P extends TuplePrefix<S["key"]>>(
		prefix: P
	) => AsyncTupleTransactionApi<RemoveTupleValuePairPrefix<S, P>>

	// WriteApis
	set: <Key extends S["key"]>(
		tuple: Key,
		value: ValueForTuple<S, Key>
	) => AsyncTupleRootTransactionApi<S>
	remove: (tuple: S["key"]) => AsyncTupleRootTransactionApi<S>
	write: (writes: WriteOps<S>) => AsyncTupleRootTransactionApi<S>

	// RootTransactionApis
	commit: () => Promise<void>
	cancel: () => Promise<void>
	id: TxId
	writes: Required<WriteOps<S>>
}

export type AsyncTupleTransactionApi<S extends KeyValuePair = KeyValuePair> = {
	// ReadApis
	// Same as AsyncTupleDatabaseClientApi without the txId argument.
	scan: <T extends S["key"], P extends TuplePrefix<T>>(
		args?: ScanArgs<T, P>
	) => Promise<FilterTupleValuePairByPrefix<S, P>[]>
	get: <T extends S["key"]>(
		tuple: T
	) => Promise<ValueForTuple<S, T> | undefined>
	exists: <T extends S["key"]>(tuple: T) => Promise<boolean>

	// Subspace
	subspace: <P extends TuplePrefix<S["key"]>>(
		prefix: P
	) => AsyncTupleTransactionApi<RemoveTupleValuePairPrefix<S, P>>

	// WriteApis
	set: <Key extends S["key"]>(
		tuple: Key,
		value: ValueForTuple<S, Key>
	) => AsyncTupleTransactionApi<S>
	remove: (tuple: S["key"]) => AsyncTupleTransactionApi<S>
	write: (writes: WriteOps<S>) => AsyncTupleTransactionApi<S>
}

/** Useful for indicating that a function does not commit any writes. */
export type ReadOnlyAsyncTupleDatabaseClientApi<
	S extends KeyValuePair = KeyValuePair
> = {
	scan: <T extends S["key"], P extends TuplePrefix<T>>(
		args?: ScanArgs<T, P>,
		txId?: TxId
	) => Promise<FilterTupleValuePairByPrefix<S, P>[]>
	get: <T extends S["key"]>(
		tuple: T,
		txId?: TxId
	) => Promise<ValueForTuple<S, T> | undefined>
	exists: <T extends S["key"]>(tuple: T, txId?: TxId) => Promise<boolean>
	subspace: <P extends TuplePrefix<S["key"]>>(
		prefix: P
	) => ReadOnlyAsyncTupleDatabaseClientApi<RemoveTupleValuePairPrefix<S, P>>

	// subscribe?
}

export type AsyncCallback<S extends KeyValuePair = KeyValuePair> = (
	writes: WriteOps<S>,
	txId: TxId
) => void | Promise<void>
