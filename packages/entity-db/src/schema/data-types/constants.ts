export const PRIMITIVE_TYPE_KEYS = [
  'string',
  'number',
  'boolean',
  'date',
] as const;
export const VALUE_TYPE_KEYS = [...PRIMITIVE_TYPE_KEYS, 'set'] as const;
export const RECORD_TYPE_KEYS = ['record'] as const;
export const ALL_TYPES = [...VALUE_TYPE_KEYS, ...RECORD_TYPE_KEYS] as const;

export const DEFAULT_FUNCTIONS = ['now', 'uuid', 'Set.empty'] as const;
