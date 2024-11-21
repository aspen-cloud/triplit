import { expect, it } from 'vitest';
import DB from '../src/db.js';

// Sanity check with entity cache, when reading in a transaction we should not use the cached value
it('Reads proper data within a transaction', async () => {
  const db = new DB({
    experimental: {
      entityCache: { capacity: 100 },
    },
  });
  await db.insert('test', { id: '1', name: 'test' });
  // loads cache
  await db.fetchById('test', '1');
  expect(db.entityCache?.has('test#1')).toBe(true);

  await db.transact(async (tx) => {
    await tx.update('test', '1', (entity) => {
      entity.name = 'updated';
    });

    // Transaction read has updated data
    // Cache still has old data
    const data = await tx.fetchById('test', '1');
    const txName = data?.name;
    const cacheName = db.entityCache?.get('test#1')?.data.name;
    expect(txName).toBe('updated');
    expect(cacheName).toBe('test');
  });

  // After update cache is updated
  const cacheName = db.entityCache?.get('test#1')?.data.name;
  expect(cacheName).toBe('updated');
});

it('fetches a non-existent entity without loading it into the cache', async () => {
  const db = new DB({
    experimental: {
      entityCache: { capacity: 100 },
    },
  });
  let result = await db.fetchById('test', '1');
  expect(result).toBe(null);
  expect(db.entityCache?.has('test#1')).toBe(false);
  await db.insert('test', { id: '1', name: 'test' });
  result = await db.fetchById('test', '1');
  expect(result).toEqual({ id: '1', name: 'test' });
  expect(db.entityCache?.has('test#1')).toBe(true);
});
