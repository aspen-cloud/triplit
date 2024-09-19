import { describe, expect, it } from 'vitest';
import { DB, Schema as S, DBSerializationError } from '../../src';
import { testSubscription } from '../utils/test-subscription.js';

describe('Set operations', () => {
  const schema = {
    collections: {
      Users: {
        schema: S.Schema({
          id: S.String(),
          name: S.String(),
          friends: S.Set(S.String()),
        }),
      },
    },
  };
  const defaultUser = {
    id: 'user-1',
    name: 'Alice',
    friends: new Set(['Bob', 'Charlie']),
  };

  it('can insert a set', async () => {
    const db = new DB({ schema });
    await db.insert('Users', defaultUser);
    const result = await db.fetchById('Users', 'user-1');
    expect(result!.friends).toBeInstanceOf(Set);
    expect([...result!.friends.values()]).toEqual(['Bob', 'Charlie']);
  });

  it('can insert an empty set', async () => {
    const db = new DB({ schema });
    await db.insert('Users', {
      id: 'user-1',
      name: 'Alice',
      friends: new Set(),
    });
    const result = await db.fetchById('Users', 'user-1');
    expect(result!.friends).toBeInstanceOf(Set);
    expect([...result!.friends.values()]).toEqual([]);
  });

  it('sets default to empty set', async () => {
    const db = new DB({ schema });
    await db.insert('Users', {
      id: 'user-1',
      name: 'Alice',
    });
    const result = await db.fetchById('Users', 'user-1');
    expect(result!.friends).toBeInstanceOf(Set);
    expect([...result!.friends.values()]).toEqual([]);
  });

  it('cannot insert a non-set', async () => {
    const db = new DB({ schema });
    await expect(
      db.insert('Users', {
        id: 'user-1',
        name: 'Alice',
        friends: 123,
      })
    ).rejects.toThrowError(DBSerializationError);
  });

  it('cannot insert a set with non-matching values', async () => {
    const db = new DB({ schema });
    await expect(
      db.insert('Users', {
        id: 'user-1',
        name: 'Alice',
        friends: new Set([123]),
      })
    ).rejects.toThrowError(DBSerializationError);
  });

  it('cannot insert a set with null', async () => {
    const db = new DB({ schema });
    await expect(
      db.insert('Users', {
        id: 'user-1',
        name: 'Alice',
        friends: new Set(['Bob', null]),
      })
    ).rejects.toThrowError(DBSerializationError);
  });

  it('can add to set', async () => {
    const db = new DB({ schema });
    await db.insert('Users', defaultUser);
    await db.update('Users', 'user-1', async (entity) => {
      entity.friends.add('Diane');
      expect([...entity.friends.values()]).toEqual(['Bob', 'Charlie', 'Diane']);
    });
    const result = await db.fetchById('Users', 'user-1');
    expect(result!.friends).toBeInstanceOf(Set);
    expect([...result!.friends.values()]).toEqual(['Bob', 'Charlie', 'Diane']);
  });

  it('can remove from set', async () => {
    const db = new DB({ schema });
    await db.insert('Users', defaultUser);
    await db.update('Users', 'user-1', async (entity) => {
      entity.friends.delete('Bob');
      expect([...entity.friends.values()]).toEqual(['Charlie']);
    });
    {
      const result = await db.fetchById('Users', 'user-1');
      expect(result!.friends).toBeInstanceOf(Set);
      expect([...result!.friends.values()]).toEqual(['Charlie']);
    }
    await db.update('Users', 'user-1', async (entity) => {
      entity.friends.delete('Charlie');
      expect([...entity.friends.values()]).toEqual([]);
    });
    {
      const result = await db.fetchById('Users', 'user-1');
      expect(result!.friends).toBeInstanceOf(Set);
      expect([...result!.friends.values()]).toEqual([]);
    }
  });

  it('can clear a set', async () => {
    const db = new DB({ schema });
    await db.insert('Users', defaultUser);
    await db.update('Users', 'user-1', async (entity) => {
      entity.friends.clear();
      expect([...entity.friends.values()]).toEqual([]);
    });
    const result = await db.fetchById('Users', 'user-1');
    expect(result!.friends).toBeInstanceOf(Set);
    expect([...result!.friends.values()]).toEqual([]);
  });

  it('set.length correctly tracks updates', async () => {
    const db = new DB({ schema });
    await db.insert('Users', defaultUser);
    await db.update('Users', 'user-1', async (entity) => {
      // initial check
      expect(entity.friends.size).toBe(2);

      // can add and size is updated
      entity.friends.add('Diane');
      expect(entity.friends.size).toBe(3);

      // can delete and size is updated
      entity.friends.delete('Bob');
      expect(entity.friends.size).toBe(2);

      // can clear and size is updated
      entity.friends.clear();
      expect(entity.friends.size).toBe(0);
    });
  });

  it('set.has correctly tracks updates', async () => {
    const db = new DB({ schema });
    await db.insert('Users', defaultUser);
    await db.update('Users', 'user-1', async (entity) => {
      // initial check
      expect(entity.friends.has('Bob')).toBe(true);
      expect(entity.friends.has('Diane')).toBe(false);

      // can add and has result is updated
      entity.friends.add('Diane');
      expect(entity.friends.has('Diane')).toBe(true);

      // can delete and has result is updated
      entity.friends.delete('Bob');
      expect(entity.friends.has('Bob')).toBe(false);

      entity.friends.clear();
      expect(entity.friends.has('Bob')).toBe(false);
      expect(entity.friends.has('Charlie')).toBe(false);
      expect(entity.friends.has('Diane')).toBe(false);
    });
  });

  it('set iteration works properly', async () => {
    const db = new DB({ schema });
    await db.insert('Users', defaultUser);
    await db.update('Users', 'user-1', async (entity) => {
      // Array.from
      expect(Array.from(entity.friends)).toEqual(['Bob', 'Charlie']);

      // keys
      const keys: string[] = [];
      for (const key of entity.friends.keys()) {
        keys.push(key);
      }
      expect(keys).toEqual(['Bob', 'Charlie']);

      // values
      const values: string[] = [];
      for (const value of entity.friends.values()) {
        values.push(value);
      }
      expect(values).toEqual(['Bob', 'Charlie']);

      // entries
      const entries: [string, string][] = [];
      for (const entry of entity.friends.entries()) {
        entries.push(entry);
      }
      expect(entries).toEqual([
        ['Bob', 'Bob'],
        ['Charlie', 'Charlie'],
      ]);
    });
  });

  it('can assign to a set', async () => {
    const db = new DB({ schema });
    await db.insert('Users', defaultUser);
    await db.update('Users', 'user-1', async (entity) => {
      entity.friends = new Set(['test']);
      expect([...entity.friends.values()]).toEqual(['test']);
    });
    const result = await db.fetchById('Users', 'user-1');
    expect([...result!.friends.values()]).toEqual(['test']);
  });

  it('can assign an empty set', async () => {
    const db = new DB({ schema });
    await db.insert('Users', defaultUser);
    await db.update('Users', 'user-1', async (entity) => {
      entity.friends = new Set();
      expect([...entity.friends.values()]).toEqual([]);
    });
    const result = await db.fetchById('Users', 'user-1');
    expect([...result!.friends.values()]).toEqual([]);
  });

  it('cannot assign a non-set', async () => {
    const db = new DB({ schema });
    await db.insert('Users', defaultUser);
    await expect(
      db.update('Users', 'user-1', async (entity) => {
        entity.friends = 123;
      })
    ).rejects.toThrowError(DBSerializationError);
  });

  it('cannot add the wrong type to a set', async () => {
    const db = new DB({ schema });
    await db.insert('Users', defaultUser);
    await expect(
      db.update('Users', 'user-1', async (entity) => {
        entity.friends.add(123);
      })
    ).rejects.toThrowError(DBSerializationError);
  });

  it('cannot add null to a set', async () => {
    const db = new DB({
      schema,
    });
    await db.insert('Users', defaultUser);
    await expect(
      db.update('Users', 'user-1', async (entity) => {
        entity.friends.add(null);
      })
    ).rejects.toThrowError(DBSerializationError);
  });

  it('can create sets with different types', async () => {
    const schema = {
      collections: {
        test: {
          schema: S.Schema({
            id: S.Id(),
            stringSet: S.Set(S.String()),
            numberSet: S.Set(S.Number()),
            booleanSet: S.Set(S.Boolean()),
            dateSet: S.Set(S.Date()),
          }),
        },
      },
    };
    const db = new DB({
      schema,
    });
    await db.insert('test', {
      id: 'test1',
      stringSet: new Set(['a']),
      numberSet: new Set([1]),
      booleanSet: new Set([true]),
      dateSet: new Set([new Date(2020, 1, 1)]),
    });

    await db.update('test', 'test1', async (entity) => {
      entity.stringSet.add('b');
      entity.numberSet.add(2);
      entity.booleanSet.add(false);
      entity.dateSet.add(new Date(2020, 1, 2));
    });

    const result = await db.fetchById('test', 'test1');
    expect(result.stringSet).toBeInstanceOf(Set);
    expect(result.numberSet).toBeInstanceOf(Set);
    expect(result.booleanSet).toBeInstanceOf(Set);
    expect(result.dateSet).toBeInstanceOf(Set);

    expect(
      [...result.stringSet.values()].every((val) => typeof val === 'string')
    ).toBeTruthy();
    expect(
      [...result.numberSet.values()].every((val) => typeof val === 'number')
    ).toBeTruthy();
    expect(
      [...result.dateSet.values()].every((val) => val instanceof Date)
    ).toBeTruthy();
    expect(
      [...result.booleanSet.values()].every((val) => typeof val === 'boolean')
    ).toBeTruthy();
  });

  // Sets cant really be deleted at the moment, but entities with sets can, make sure fetch still works
  it('set filters can fetch deleted entities', async () => {
    const schema = {
      collections: {
        students: {
          schema: S.Schema({
            id: S.Id(),
            name: S.String(),
            classes: S.Set(S.String()),
          }),
        },
      },
    };
    const db = new DB({ schema });
    await db.insert('students', {
      id: '1',
      name: 'Alice',
      classes: new Set(['math', 'science']),
    });
    await db.insert('students', {
      id: '2',
      name: 'Bob',
      classes: new Set(['math', 'science']),
    });
    await db.delete('students', '1');

    const query = db
      .query('students')
      .where([['classes', '=', 'math']])
      .build();

    const results = await db.fetch(query);
    expect(results.length).toBe(1);
    expect(results.find((e) => e.id === '2')).toBeDefined();
  });

  it('Can subscribe to queries with a set in the filter', async () => {
    const schema = {
      collections: {
        students: {
          schema: S.Schema({
            id: S.Id(),
            name: S.String(),
            classes: S.Set(S.String()),
          }),
        },
      },
    };

    const db = new DB({ schema });
    const query = db
      .query('students')
      .where([['classes', '=', 'math']])
      .build();
    await db.insert('students', {
      id: '1',
      name: 'Alice',
      classes: new Set(['math', 'science']),
    });

    await testSubscription(db, query, [
      { check: (data) => expect(data.map((e) => e.id)).toEqual(['1']) },
      // Insert
      {
        action: async () => {
          await db.transact(async (tx) => {
            await tx.insert('students', {
              id: '2',
              name: 'Bob',
              classes: new Set(['history', 'science']),
            });
            await tx.insert('students', {
              id: '3',
              name: 'Charlie',
              classes: new Set(['math', 'history']),
            });
          });
        },
        check: (data) => expect(data.map((e) => e.id)).toEqual(['1', '3']),
      },
      // Update
      {
        action: async () => {
          await db.transact(async (tx) => {
            await tx.update('students', '2', async (entity) => {
              entity.classes.add('math');
            });
            await tx.update('students', '3', async (entity) => {
              entity.classes.delete('math');
            });
          });
        },
        check: (data) => expect(data.map((e) => e.id)).toEqual(['1', '2']),
      },
      // Delete
      {
        action: async () => {
          await db.delete('students', '1');
        },
        check: (data) => expect(data.map((e) => e.id)).toEqual(['2']),
      },
    ]);
  });
  describe('nullable sets', () => {
    it('can define nullable sets in schema', async () => {
      const schema = {
        collections: {
          test: {
            schema: S.Schema({
              id: S.Id(),
              name: S.String(),
              friends: S.Set(S.String(), { nullable: true }),
            }),
          },
        },
      };
      const db = new DB({ schema });
      await db.insert('test', {
        id: '1',
        name: 'Alice',
        friends: new Set(['Bob', 'Charlie']),
      });
      await db.insert('test', {
        id: '2',
        name: 'Bob',
        friends: null,
      });
      await db.insert('test', {
        id: '3',
        name: 'Charlie',
        friends: new Set(),
      });
      await db.insert('test', {
        id: '4',
        name: 'Diane',
        friends: new Set(['Ella']),
      });

      const result = await db.fetchById('test', '2');
      expect(result!.friends).toBeNull();
      const result2 = await db.fetchById('test', '3');
      expect(result2!.friends).toBeInstanceOf(Set);
      expect([...result2!.friends!.values()]).toEqual([]);
    });

    it('can update a null set to a non-null set', async () => {
      const schema = {
        collections: {
          test: {
            schema: S.Schema({
              id: S.Id(),
              name: S.String(),
              friends: S.Set(S.String(), { nullable: true }),
            }),
          },
        },
      };
      const db = new DB({ schema });
      await db.insert('test', {
        id: '1',
        name: 'Alice',
        friends: null,
      });
      await db.update('test', '1', async (entity) => {
        entity.friends = new Set(['Bob', 'Charlie']);
      });
      const result = await db.fetchById('test', '1');
      expect(result!.friends).toBeInstanceOf(Set);
      expect([...result!.friends!.values()]).toEqual(['Bob', 'Charlie']);
    });
    it('can update update a nullable set to null', async () => {
      const schema = {
        collections: {
          test: {
            schema: S.Schema({
              id: S.Id(),
              name: S.String(),
              friends: S.Set(S.String(), { nullable: true }),
            }),
          },
        },
      };
      const db = new DB({ schema });
      await db.insert('test', {
        id: '1',
        name: 'Alice',
        friends: new Set(['Bob', 'Charlie']),
      });
      await db.update('test', '1', async (entity) => {
        entity.friends = null;
      });
      const result = await db.fetchById('test', '1');
      expect(result!.friends).toBeNull();
    });
  });

  describe('optional sets', () => {
    const schema = {
      collections: {
        test: {
          schema: S.Schema({
            id: S.Id(),
            name: S.String(),
            friends: S.Optional(S.Set(S.String())),
          }),
        },
      },
    };

    it('can delete an optional set', async () => {
      const db = new DB({ schema });
      await db.insert('test', {
        id: '1',
        name: 'Alice',
        friends: new Set(['Bob', 'Charlie']),
      });
      {
        const result = await db.fetchById('test', '1');
        expect(result!.friends).toBeInstanceOf(Set);
        expect([...result!.friends!.values()]).toEqual(['Bob', 'Charlie']);
      }
      await db.update('test', '1', async (entity) => {
        delete entity.friends;
      });
      const result = await db.fetchById('test', '1');
      expect(result!.friends).toBeUndefined();
    });

    it('can assign undefined to optional sets', async () => {
      const db = new DB({ schema });
      await db.insert('test', {
        id: '1',
        name: 'Alice',
        friends: new Set(['Bob', 'Charlie']),
      });
      {
        const result = await db.fetchById('test', '1');
        expect(result!.friends).toBeInstanceOf(Set);
        expect([...result!.friends!.values()]).toEqual(['Bob', 'Charlie']);
      }
      await db.update('test', '1', async (entity) => {
        entity.friends = undefined;
      });
      {
        const result = await db.fetchById('test', '1');
        expect(result!.friends).toBeUndefined();
      }
    });
  });
});
