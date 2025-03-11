import { describe, expect, it } from 'vitest';
import { Schema as S } from '../src/schema/builder.js';
import { DB } from '../src';
import { DBSerializationError } from '../src/errors.js';

describe('Enum properties in a schema', () => {
  const schema = {
    collections: {
      Todos: {
        schema: S.Schema({
          id: S.Id(),
          text: S.String({ enum: ['a', 'b', 'c'] }),
        }),
      },
    },
  };
  it('can create a database with a schema with an enum property', async () => {
    expect(
      () =>
        new DB({
          schema,
        })
    ).not.toThrowError();
  });
  it('can insert with enum properties', async () => {
    const db = new DB({
      schema,
    });
    expect(
      async () =>
        await db.insert('Todos', {
          id: 'todo-1',
          text: 'a',
        })
    ).not.toThrowError();
    await db.insert('Todos', {
      id: 'todo-1',
      text: 'a',
    });
    const result = await db.fetchById('Todos', 'todo-1');
    expect(result).toHaveProperty('text');
    expect(result?.text).toBe('a');
  });
  it("can't insert with a property set to a value not in the enum", async () => {
    const db = new DB({
      schema,
    });
    expect(
      async () =>
        await db.insert('Todos', {
          id: 'todo-1',
          text: 'a',
        })
    ).not.toThrowError();
    await expect(
      db.insert('Todos', {
        id: 'todo-1',
        text: 'd',
      })
    ).rejects.toThrowError(DBSerializationError);
  });
  it('can update with nullable properties', async () => {
    const db = new DB({
      schema,
    });
    await db.insert('Todos', {
      id: 'todo-1',
      text: 'a',
    });
    await db.update('Todos', 'todo-1', async (entity) => {
      entity.text = 'b';
    });
    let result = await db.fetchById('Todos', 'todo-1');
    expect(result).toHaveProperty('text');
    expect(result?.text).toBe('b');
  });
  it("can't update with a enum property set to a value not in the enum", async () => {
    const db = new DB({
      schema,
    });
    await db.insert('Todos', {
      id: 'todo-1',
      text: 'a',
    });
    await expect(
      async () =>
        await db.update('Todos', 'todo-1', async (entity) => {
          entity.text = 'd';
        })
    ).rejects.toThrowError(DBSerializationError);
  });
});
