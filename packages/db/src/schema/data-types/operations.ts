import { TriplitError } from '../../errors.js';
import { SET_OP_PREFIX } from '../../filters.js';
import { AllTypes } from '../types/index.js';

const BASE_OPERATIONS = ['isDefined'] as const;
const COMPARISON_OPERATORS = ['=', '!=', '<', '>', '<=', '>='] as const;
const COLLECTION_OPERATORS = ['has', '!has'] as const;
const COLLECTION_ITEM_OPERATORS = ['in', 'nin'] as const;

export const SUPPORTED_OPERATIONS = {
  boolean: [...BASE_OPERATIONS, ...COMPARISON_OPERATORS],
  date: [...BASE_OPERATIONS, ...COMPARISON_OPERATORS],
  number: [
    ...BASE_OPERATIONS,
    ...COMPARISON_OPERATORS,
    ...COLLECTION_ITEM_OPERATORS,
  ],
  record: [...BASE_OPERATIONS],
  /**
   * Temporarily prefixing all set operations to make them unique in the query engine
   * This may be a long term solution, but it is okay to refactor the representation if needed
   */
  set: prefixOperations(
    [...BASE_OPERATIONS, ...COLLECTION_OPERATORS] as const,
    SET_OP_PREFIX
  ),
  string: [
    ...BASE_OPERATIONS,
    ...COMPARISON_OPERATORS,
    ...COLLECTION_ITEM_OPERATORS,
    'like',
    'nlike',
  ],
} as const satisfies Record<AllTypes, ReadonlyArray<string>>;

export function prefixOperations<Ops extends string, Prefix extends string>(
  operations: ReadonlyArray<Ops>,
  prefix: Prefix
): ReadonlyArray<`${Prefix}${Ops}`> {
  return operations.map((op) => `${prefix}${op}` as `${Prefix}${Ops}`);
}

// Return the operator that remains true if the left and right operands are flipped
export function flipOperator(op: string) {
  if (op === '=') return '=';
  if (op === '!=') return '!=';
  if (op === '<') return '>';
  if (op === '>') return '<';
  if (op === '<=') return '>=';
  if (op === '>=') return '<=';
  if (op === 'in') return 'SET_has';
  if (op === 'nin') return 'SET_!has';
  if (op === 'SET_has') return 'in';
  if (op === 'SET_!has') return 'nin';
  // If we hit this with a valid operator, figure out how to support that operator
  // Ex. not sure how 'like' fits into this
  throw new TriplitError(`Cannot flip operator ${op}`);
}
