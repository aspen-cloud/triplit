import { Value } from '@sinclair/typebox/value';
import { CollectionQuery } from '@triplit/db';

export function hashQuery(params: CollectionQuery<any, any>) {
  // @ts-expect-error
  const { id, ...queryParams } = params;
  return Value.Hash(queryParams).toString();
}
