import MultiTupleStore from './multi-tuple-store.js';
import type { Timestamp } from './timestamp.js';
import type {
  Attribute,
  EATIndex,
  EntityId,
  TripleMetadata,
  TupleIndex,
  Value,
} from './triple-store-utils.js';

export const TRIPLE_STORE_MIGRATIONS: ((
  tupleStore: MultiTupleStore<TupleIndex>
) => Promise<void>)[] = [
  async function migrateFromEAVtoEAT(tupleStore: MultiTupleStore<TupleIndex>) {
    // Check if any EAV tuples exist and migrate them to EAT
    // @ts-ignore
    const existingTuples = (await tupleStore.scan({
      prefix: ['EAV'],
    })) as {
      key: ['EAV', EntityId, Attribute, Value, Timestamp];
      value: TripleMetadata;
    }[];

    if (existingTuples.length === 0) return;

    const tuplesToInsert: EATIndex[] = [];
    for (const tuple of existingTuples) {
      const [_index, id, attribute, value, timestamp] = tuple.key;
      const { expired } = tuple.value;
      tuplesToInsert.push({
        key: ['EAT', id, attribute, timestamp],
        value: [value, expired],
      } as EATIndex);
    }
    await tupleStore.autoTransact(async (tx) => {
      // Delete old EAV tuples
      for (const tuple of existingTuples) {
        // @ts-ignore
        tx.remove(tuple.key);
      }
      // Insert new EAT tuples
      for (const tuple of tuplesToInsert) {
        await tx.set(tuple.key, tuple.value);
      }
    }, undefined);
  },
];
