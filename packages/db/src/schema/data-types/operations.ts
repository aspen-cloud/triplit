import { TriplitError } from '../../errors.js';
import { AllTypes } from '../types/index.js';

const BASE_OPERATIONS = ['isDefined'] as const;
const COMPARISON_OPERATORS = ['=', '!=', '<', '>', '<=', '>='] as const;
const COLLECTION_OPERATORS = ['has', '!has'] as const;
const COLLECTION_ITEM_OPERATORS = ['in', 'nin'] as const;

export const SET_OP_PREFIX = 'SET_';

const BOOLEAN_OPERATIONS = [...BASE_OPERATIONS, ...COMPARISON_OPERATORS];
const DATE_OPERATIONS = [...BASE_OPERATIONS, ...COMPARISON_OPERATORS];
const NUMBER_OPERATIONS = [
  ...BASE_OPERATIONS,
  ...COMPARISON_OPERATORS,
  ...COLLECTION_ITEM_OPERATORS,
];
const RECORD_OPERATIONS = [...BASE_OPERATIONS];
const SET_OPERATIONS = prefixOperations(
  [...BASE_OPERATIONS, ...COLLECTION_OPERATORS] as const,
  SET_OP_PREFIX
);
const STRING_OPERATIONS = [
  ...BASE_OPERATIONS,
  ...COMPARISON_OPERATORS,
  ...COLLECTION_ITEM_OPERATORS,
  'like',
  'nlike',
] as const;

const JSON_OPERATIONS = Array.from(
  new Set([
    // Supported primitive type Operations
    ...BOOLEAN_OPERATIONS,
    ...NUMBER_OPERATIONS,
    ...STRING_OPERATIONS,
    // For a JSON object, works for now
    ...RECORD_OPERATIONS,
    // For an array, works for now
    ...COLLECTION_OPERATORS,
  ])
);

export const SUPPORTED_OPERATIONS = {
  boolean: BOOLEAN_OPERATIONS,
  date: DATE_OPERATIONS,
  json: JSON_OPERATIONS,
  number: NUMBER_OPERATIONS,
  record: RECORD_OPERATIONS,
  /**
   * Temporarily prefixing all set operations to make them unique in the query engine
   * This may be a long term solution, but it is okay to refactor the representation if needed
   */
  set: SET_OPERATIONS,
  string: STRING_OPERATIONS,
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
