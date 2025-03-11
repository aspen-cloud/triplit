import { describe, expect, it } from 'vitest';
import { Schema as S } from '../src/schema/builder.js';
import { DB } from '../src';
import { DBSerializationError } from '../src/errors.js';

// TODO: come back and un-todo this
describe('Nullable properties in a schema', () => {
  const schema = {
    collections: {
      Todos: {
        schema: S.Schema({
          id: S.Id(),
          text: S.String(),
          created_at: S.Date(),
          deleted_at: S.Date({ nullable: true }),
        }),
      },
    },
  };
  it('can create a database with a schema with nullable properties', async () => {
    expect(
      () =>
        new DB({
          schema,
        })
    ).not.toThrowError();
  });
  it('can insert with nullable properties', async () => {
    const db = new DB({
      schema,
    });
    await expect(
      db.insert('Todos', {
        id: 'todo-1',
        text: 'Do something',
        created_at: new Date(),
        deleted_at: null,
      })
    ).resolves.not.toThrowError();
    await db.insert('Todos', {
      id: 'todo-1',
      text: 'Do something',
      created_at: new Date(),
      deleted_at: null,
    });
    console.log();
    const result = await db.fetchById('Todos', 'todo-1');
    expect(result).toHaveProperty('deleted_at');
    expect(result.deleted_at).toBeNull();
  });
  it("can't insert with a non-nullable property set to null", async () => {
    const db = new DB({
      schema,
    });
    expect(
      async () =>
        await db.insert('Todos', {
          id: 'todo-1',
          text: 'Do something',
          created_at: new Date(),
          deleted_at: null,
        })
    ).not.toThrowError();
    await expect(
      db.insert('Todos', {
        id: 'todo-1',
        text: 'Do something',
        created_at: null,
        deleted_at: null,
      })
    ).rejects.toThrowError(DBSerializationError);
  });
  it('can update with nullable properties', async () => {
    const db = new DB({
      schema,
    });
    await db.insert('Todos', {
      id: 'todo-1',
      text: 'Do something',
      created_at: new Date(),
      deleted_at: null,
    });
    await db.update('Todos', 'todo-1', async (entity) => {
      entity.deleted_at = new Date();
    });
    let result = await db.fetchById('Todos', 'todo-1');
    expect(result).toHaveProperty('deleted_at');
    expect(result.deleted_at).not.toBeNull();
    await db.update('Todos', 'todo-1', async (entity) => {
      entity.deleted_at = null;
    });
    result = await db.fetchById('Todos', 'todo-1');
    expect(result).toHaveProperty('deleted_at');
    expect(result.deleted_at).toBeNull();
  });
  it("can't update with a non-nullable property set to null", async () => {
    const db = new DB({
      schema,
    });
    await db.insert('Todos', {
      id: 'todo-1',
      text: 'Do something',
      created_at: new Date(),
      deleted_at: null,
    });
    await expect(
      async () =>
        await db.update('Todos', 'todo-1', async (entity) => {
          entity.created_at = null;
        })
    ).rejects.toThrowError(DBSerializationError);
  });
});
