import { TriplitError } from '../../errors.js';
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
  set: [...BASE_OPERATIONS, ...COLLECTION_OPERATORS],
  string: [
    ...BASE_OPERATIONS,
    ...COMPARISON_OPERATORS,
    ...COLLECTION_ITEM_OPERATORS,
    'like',
    'nlike',
  ],
} as const satisfies Record<AllTypes, string[]>;

// Return the operator that remains true if the left and right operands are flipped
export function flipOperator(op: string) {
  if (op === '=') return '=';
  if (op === '!=') return '!=';
  if (op === '<') return '>';
  if (op === '>') return '<';
  if (op === '<=') return '>=';
  if (op === '>=') return '<=';
  if (op === 'in') return 'has';
  if (op === 'nin') return '!has';
  if (op === 'has') return 'in';
  if (op === '!has') return 'nin';
  // If we hit this with a valid operator, figure out how to support that operator
  // Ex. not sure how 'like' fits into this
  throw new TriplitError(`Cannot flip operator ${op}`);
}
