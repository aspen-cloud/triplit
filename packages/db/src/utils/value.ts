import { DefaultValue } from '../schema/index.js';

export function hasNoValue(value: any): value is null | undefined {
  return value === null || value === undefined;
}

export function isDefaultFunction(value: DefaultValue | undefined) {
  return typeof value === 'object' && value !== null && 'func' in value;
}
