import DB, { DBTransaction, Models } from '../../src/index.js';

export function fakeTx<M extends Models<any, any> | undefined>(
  db: DB<M>
): DBTransaction<M> {
  return {} as DBTransaction<M>;
}

export type MapKey<M> = M extends Map<infer K, any> ? K : never;
export type MapValue<M> = M extends Map<any, infer V> ? V : never;
