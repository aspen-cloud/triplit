// TODO: See if we can remove these, or not manually maintain them
export const VALUE_TYPE_KEYS = ['string', 'number', 'boolean', 'date'] as const;
export const COLLECTION_TYPE_KEYS = ['set'] as const;
export const RECORD_TYPE_KEYS = ['record'] as const;
export const ALL_TYPES = [
  ...VALUE_TYPE_KEYS,
  ...COLLECTION_TYPE_KEYS,
  ...RECORD_TYPE_KEYS,
] as const;
