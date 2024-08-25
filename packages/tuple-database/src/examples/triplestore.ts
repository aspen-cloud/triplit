import { transactionalReadWrite } from "../database/sync/transactionalReadWrite"

export type Value = string | number | boolean
export type Fact = [string, string, Value]

export type TriplestoreSchema =
	| { key: ["eav", ...Fact]; value: null }
	| { key: ["ave", string, Value, string]; value: null }
	| { key: ["vea", Value, string, string]; value: null }

export const writeFact = transactionalReadWrite<TriplestoreSchema>()(
	(tx, fact: Fact) => {
		const [e, a, v] = fact
		tx.set(["eav", e, a, v], null)
		tx.set(["ave", a, v, e], null)
		tx.set(["vea", v, e, a], null)
	}
)

export const removeFact = transactionalReadWrite<TriplestoreSchema>()(
	(tx, fact: Fact) => {
		const [e, a, v] = fact
		tx.remove(["eav", e, a, v])
		tx.remove(["ave", a, v, e])
		tx.remove(["vea", v, e, a])
	}
)

export class Variable {
	constructor(public name: string) {}
}

// Just for dev UX.
export function $(name: string) {
	return new Variable(name)
}

export type Expression = [
	Fact[0] | Variable,
	Fact[1] | Variable,
	Fact[2] | Variable
]

export type Binding = { [varName: string]: Value }

// Evaluate an expression by scanning the appropriate index.
export const queryExpression = transactionalReadWrite<TriplestoreSchema>()(
	(tx, expr: Expression): Binding[] => {
		const [$e, $a, $v] = expr
		if ($e instanceof Variable) {
			if ($a instanceof Variable) {
				if ($v instanceof Variable) {
					// ___
					return tx
						.scan({ prefix: ["eav"] })
						.map(({ key: [_eav, e, a, v] }) => ({
							[$e.name]: e,
							[$a.name]: a,
							[$v.name]: v,
						}))
				} else {
					// __V
					return tx
						.scan({ prefix: ["vea", $v] })
						.map(({ key: [_vea, _v, e, a] }) => ({
							[$e.name]: e,
							[$a.name]: a,
						}))
				}
			} else {
				if ($v instanceof Variable) {
					// A__
					return tx
						.scan({ prefix: ["ave", $a] })
						.map(({ key: [_ave, _a, v, e] }) => ({
							[$e.name]: e,
							[$v.name]: v,
						}))
				} else {
					// A_V
					return tx
						.scan({ prefix: ["ave", $a, $v] })
						.map(({ key: [_ave, _a, _v, e] }) => ({
							[$e.name]: e,
						}))
				}
			}
		} else {
			if ($a instanceof Variable) {
				if ($v instanceof Variable) {
					// E__
					return tx
						.scan({ prefix: ["eav", $e] })
						.map(({ key: [_eav, _e, a, v] }) => ({
							[$a.name]: a,
							[$v.name]: v,
						}))
				} else {
					// E_V
					return tx
						.scan({ prefix: ["vea", $v, $e] })
						.map(({ key: [_vea, _v, _e, a] }) => ({
							[$a.name]: a,
						}))
				}
			} else {
				if ($v instanceof Variable) {
					// EA_
					return tx
						.scan({ prefix: ["eav", $e, $a] })
						.map(({ key: [_eav, _e, _a, v] }) => ({
							[$v.name]: v,
						}))
				} else {
					// EAV
					return tx
						.scan({ prefix: ["eav", $e, $a, $v] })
						.map(({ key: [_eav, _e, _a, _v] }) => ({}))
				}
			}
		}
	}
)

export type Query = Expression[]

export function substituteBinding(query: Query, binding: Binding): Query {
	return query.map((expr) => {
		return expr.map((item) =>
			item instanceof Variable && item.name in binding
				? binding[item.name]
				: item
		) as Expression
	})
}

// Recursively evaluate a query.
export const evaluateQuery = transactionalReadWrite<TriplestoreSchema>()(
	(tx, query: Query): Binding[] => {
		const [first, ...rest] = query

		if (rest.length === 0) return queryExpression(tx, first)

		const bindings = queryExpression(tx, first)

		const result = bindings
			.map((binding) => {
				// Substitute the rest of the variables for any bindings.
				const restQuery = substituteBinding(rest, binding)

				// Recursively evaluate
				const moreBindings = evaluateQuery(tx, restQuery)

				// Join the results
				return moreBindings.map((b) => ({ ...b, ...binding }))
			})
			// Flatten the arrays
			.reduce((acc, next) => acc.concat(next), [])

		return result
	}
)
