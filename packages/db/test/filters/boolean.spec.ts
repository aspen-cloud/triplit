import { expect, it } from 'vitest';
import { DB } from '../../src/db.js';

it('boolean TRUE is a no-op', async () => {
  const db = new DB();
  await db.insert('users', { id: '1', name: 'Alice', age: 22 });
  await db.insert('users', { id: '2', name: 'Bob', age: 23 });
  await db.insert('users', { id: '3', name: 'Charlie', age: 24 });
  await db.insert('users', { id: '4', name: 'Dennis', age: 25 });
  await db.insert('users', { id: '5', name: 'Ella', age: 26 });

  const query = db.query('users').Where('age', '>', 24).Where(true);
  const result = await db.fetch(query);
  expect(result.length).toBe(2);
});
it('boolean FALSE returns no data', async () => {
  const db = new DB();
  await db.insert('users', { id: '1', name: 'Alice', age: 22 });
  await db.insert('users', { id: '2', name: 'Bob', age: 23 });
  await db.insert('users', { id: '3', name: 'Charlie', age: 24 });
  await db.insert('users', { id: '4', name: 'Dennis', age: 25 });
  await db.insert('users', { id: '5', name: 'Ella', age: 26 });

  const query = db.query('users').Where('age', '>', 24).Where(false);
  const result = await db.fetch(query);
  expect(result.length).toBe(0);
});
