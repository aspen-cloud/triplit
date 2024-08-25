import {
	FilterTupleValuePairByPrefix,
	RemoveTupleValuePairPrefix,
	TuplePrefix,
} from "../database/typeHelpers"
import {
	AsyncTupleDatabaseClientApi,
	AsyncTupleTransactionApi,
	ScanArgs,
	TupleDatabaseClientApi,
	TupleTransactionApi,
} from "../main"
import { KeyValuePair, WriteOps } from "../storage/types"

export class QueryResult<T> {
	constructor(public ops: any[] = []) {}
	map = <O>(fn: (value: T) => O): QueryResult<O> => {
		return new QueryResult([...this.ops, { fn: "map", args: [fn] }])
	}
	chain = <O>(fn: (value: T) => QueryResult<O>): QueryResult<O> => {
		return new QueryResult([...this.ops, { fn: "chain", args: [fn] }])
	}
}

export class QueryBuilder<S extends KeyValuePair = KeyValuePair> {
	constructor(public ops: any[] = []) {}
	subspace = <P extends TuplePrefix<S["key"]>>(
		prefix: P
	): QueryBuilder<RemoveTupleValuePairPrefix<S, P>> => {
		return new QueryBuilder([...this.ops, { fn: "subspace", args: [prefix] }])
	}
	scan = <T extends S["key"], P extends TuplePrefix<T>>(
		args?: ScanArgs<T, P>
	): QueryResult<FilterTupleValuePairByPrefix<S, P>[]> => {
		return new QueryResult([...this.ops, { fn: "scan", args: [args] }])
	}
	write = (writes: WriteOps<S>): QueryResult<void> => {
		return new QueryResult([...this.ops, { fn: "write", args: [writes] }])
	}
}

export function execute<O, S extends KeyValuePair = KeyValuePair>(
	dbOrTx: TupleDatabaseClientApi<S> | TupleTransactionApi<S>,
	query: QueryResult<O>
): O
export function execute<O, S extends KeyValuePair = KeyValuePair>(
	dbOrTx: AsyncTupleDatabaseClientApi<S> | AsyncTupleTransactionApi<S>,
	query: QueryResult<O>
): Promise<O>
export function execute<O, S extends KeyValuePair = KeyValuePair>(
	dbOrTx:
		| TupleDatabaseClientApi<S>
		| TupleTransactionApi<S>
		| AsyncTupleDatabaseClientApi<S>
		| AsyncTupleTransactionApi<S>,
	query: QueryResult<O>
): O | Promise<O> {
	let tx: any = dbOrTx

	const isTx = "set" in dbOrTx
	if (!isTx) {
		tx = dbOrTx.transact()
	}

	let x: any = tx

	for (const op of query.ops) {
		if (op.fn === "subspace") {
			x = x.subspace(...op.args)
		}
		if (op.fn === "scan") {
			x = x.scan(...op.args)
		}
		if (op.fn === "write") {
			x = x.write(...op.args)
		}

		if (op.fn === "map") {
			if (x instanceof Promise) {
				x = x.then((x) => op.args[0](x))
			} else {
				x = op.args[0](x)
			}
		}
		if (op.fn === "chain") {
			if (x instanceof Promise) {
				x = x.then((x) => execute(tx, op.args[0](x)))
			} else {
				x = execute(tx, op.args[0](x))
			}
		}
	}

	if (!isTx) {
		if (x instanceof Promise) {
			x = x.then((x) => {
				tx.commit()
				return x
			})
		} else {
			tx.commit()
		}
	}

	return x
}
