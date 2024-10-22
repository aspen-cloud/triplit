import { LRUCacheWithDelete } from 'mnemonist';
import { Entity } from '../entity.js';
import { TripleStore } from '../triple-store.js';
import { EntityCache, EntityCacheOptions } from './types/entity-cache.js';

export function createEntityCache(options: EntityCacheOptions): EntityCache {
  return new LRUCacheWithDelete<string, Entity>(options.capacity);
}

export function assignEntityCacheToStore(
  store: TripleStore,
  cache: EntityCache
): void {
  // Capture inserts in after commit hook
  store.afterCommit((storeTriples) => {
    for (const triples of Object.values(storeTriples)) {
      for (const triple of triples) {
        if (cache.has(triple.id)) {
          cache.get(triple.id)?.applyTriple(triple);
        }
      }
    }
  });
  // Capture deletes in data hook
  store.onWrite((writes) => {
    for (const data of Object.values(writes)) {
      for (const triple of data.deletes) {
        cache.delete(triple.id);
      }
    }
  });
  // Capture clears in clear hook
  store.onClear(() => {
    cache.clear();
  });
}
