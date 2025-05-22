import { DataType, DefaultableType, PrimitiveType } from '../../index.js';

export const PRIMITIVE_TYPE_KEYS = Object.freeze([
  'string',
  'number',
  'boolean',
  'date',
] as const) satisfies readonly PrimitiveType['type'][];
export const PRIMITIVE_TYPE_KEYS_SET = new Set(PRIMITIVE_TYPE_KEYS);

export const DEFAULTABLE_TYPE_KEYS = Object.freeze([
  'string',
  'number',
  'boolean',
  'date',
  'set',
  'json',
] as const) satisfies readonly DefaultableType['type'][];
export const DEFAULTABLE_TYPE_KEYS_SET = new Set(DEFAULTABLE_TYPE_KEYS);

export const ALL_TYPES = Object.freeze([
  ...PRIMITIVE_TYPE_KEYS,
  'set',
  'json',
  'record',
] as const) satisfies readonly DataType['type'][];
export const ALL_TYPES_SET = new Set(ALL_TYPES);

export const DEFAULT_FUNCTIONS = Object.freeze([
  'now',
  'nanoid',
  'uuid', // @deprecated
  'uuidv4',
  'uuidv7',
  'Set.empty',
] as const);
