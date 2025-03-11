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
