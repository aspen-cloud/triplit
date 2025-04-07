// @ts-nocheck Fix types if needed
import { ViewEntity } from '../query-engine.js';
import { TypeConverters } from '../schema/converters.js';
import { CollectionQuery } from '../types.js';

/**
 * This takes a ViewEntity, query, typeConverters and creates getters for the inclusions
 * and select doing conversions lazily as necessary
 * NOTE: this is not used and still TBD if it's worth the complexity
 **/
export function createLazyEntity(
  entity: ViewEntity,
  query: CollectionQuery,
  typeConverters?: TypeConverters
) {
  // Single cache Map, no pre-computation
  const cache = new Map<string, any>();

  const handler: ProxyHandler<object> = {
    get(target, prop, receiver) {
      const propStr = String(prop);

      // Handle special methods
      if (
        prop === 'toJSON' ||
        prop === 'toString' ||
        prop === 'valueOf' ||
        prop === Symbol.toPrimitive
      ) {
        return () => {
          if (!cache.has('data')) {
            const dataConverter = typeConverters?.get(query.collectionName);
            cache.set(
              'data',
              dataConverter?.fromDB(entity.data) ?? entity.data
            );
          }
          const data = cache.get('data');
          return prop === 'toString' ? JSON.stringify(data) : data;
        };
      }

      // Return cached value if exists
      if (cache.has(propStr)) {
        return cache.get(propStr);
      }

      // Lazy computation only when accessed
      let value;
      if (propStr === 'data') {
        const dataConverter = typeConverters?.get(query.collectionName);
        value = dataConverter?.fromDB(entity.data) ?? entity.data;
      } else {
        const inclusion = query.include?.[propStr];
        if (inclusion) {
          const subquery = inclusion.subquery;
          const cardinality = inclusion.cardinality;
          const subEntities = entity.subqueries[propStr];
          if (cardinality === 'one') {
            value = subEntities?.[0]
              ? createLazyEntity(subEntities[0], subquery, typeConverters)
              : null;
          } else {
            value = (subEntities || []).map((v) =>
              createLazyEntity(v, subquery, typeConverters)
            );
          }
        } else {
          // Lazy compute dataKeys only when needed
          const dataKeys = query.select ?? Object.keys(entity.data);
          value = dataKeys.includes(propStr) ? entity.data[propStr] : undefined;
        }
      }

      cache.set(propStr, value);
      return value;
    },

    has(target, prop) {
      const propStr = String(prop);
      if (propStr === 'data') return true;
      if (cache.has(propStr)) return true;

      // Lazy check inclusion and data keys
      if (query.include?.[propStr]) return true;
      const dataKeys = query.select ?? Object.keys(entity.data);
      return dataKeys.includes(propStr);
    },

    ownKeys(target) {
      // Extremely lazy - only returns what's been accessed plus 'data'
      const cachedKeys = Array.from(cache.keys());
      return [
        'data',
        ...(query.include ? Object.keys(query.include) : []),
        ...cachedKeys,
      ].filter((key, idx, arr) => arr.indexOf(key) === idx);
    },

    getOwnPropertyDescriptor(target, prop) {
      const propStr = String(prop);
      // Lazy check if property exists
      const hasProp =
        propStr === 'data' ||
        query.include?.[propStr] !== undefined ||
        (query.select ?? Object.keys(entity.data)).includes(propStr) ||
        cache.has(propStr);

      if (hasProp) {
        return {
          enumerable: true,
          configurable: true,
          get: () => Reflect.get(target, prop, receiver),
        };
      }
      return undefined;
    },
  };

  return new Proxy({}, handler);
}
