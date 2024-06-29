import { describe, expect, it } from 'vitest';
import DB from '../../src/db.js';
import { Schema as S } from '../../src/schema/builder.js';
import { InvalidSelectClauseError } from '../../src/errors.js';

const todosSchema = {
  collections: {
    todos: {
      schema: S.Schema({
        id: S.Id(),
        title: S.String(),
        completed: S.Boolean(),
        assignee_id: S.Optional(S.String()),
        assignee: S.RelationById('users', '$assignee_id'),
      }),
    },
    users: {
      schema: S.Schema({
        id: S.Id(),
        name: S.String(),
      }),
    },
  },
};

describe('schemaful', () => {
  it('should select all fields if no selection is provided', async () => {
    const db = new DB({ schema: todosSchema });
    await db.insert('todos', { id: '1', title: 'foo', completed: false });
    const query = db.query('todos').build();
    const result = await db.fetchOne(query);
    expect(result).toEqual({ id: '1', title: 'foo', completed: false });
  });

  it('should select only the fields that are provided, with inclusion', async () => {
    const db = new DB({ schema: todosSchema });
    await db.insert('todos', {
      id: '1',
      title: 'foo',
      completed: false,
      assignee_id: '1',
    });
    await db.insert('users', { id: '1', name: 'bar' });
    const query = db.query('todos').include('assignee').build();
    const result = await db.fetchOne(query);
    expect(result).toEqual({
      id: '1',
      title: 'foo',
      completed: false,
      assignee_id: '1',
      assignee: { id: '1', name: 'bar' },
    });
  });

  it('should select only the fields that are provided', async () => {
    const db = new DB({ schema: todosSchema });
    await db.insert('todos', { id: '1', title: 'foo', completed: false });
    const query = db.query('todos').select(['id', 'title']).build();
    const result = await db.fetchOne(query);
    expect(result).toEqual({ id: '1', title: 'foo' });
  });

  it('will throw error if selecting a field that does not exist', async () => {
    const db = new DB({ schema: todosSchema });
    await db.insert('todos', { id: '1', title: 'foo', completed: false });
    const query = db.query('todos').select(['id', 'title', 'foo']).build();
    await expect(db.fetchOne(query)).rejects.toThrow(InvalidSelectClauseError);
  });

  it('can select _metadata collection', async () => {
    const db = new DB({ schema: todosSchema });
    const query = db.query('_metadata').where('id', '=', '_schema').build();
    const result = await db.fetchOne(query);
    const collectionKeys = Object.keys(result?.collections);
    expect(collectionKeys.length).toBe(2);
    expect(collectionKeys).toContain('todos');
    expect(collectionKeys).toContain('users');
  });
});

describe('schemaless', () => {
  it('should select all fields if no selection is provided', async () => {
    const db = new DB();
    await db.insert('todos', { id: '1', title: 'foo', completed: false });
    const query = db.query('todos').build();
    const result = await db.fetchOne(query);
    expect(result).toEqual({ id: '1', title: 'foo', completed: false });
  });

  it('should select only the fields that are provided, with inclusion', async () => {
    const db = new DB();
    await db.insert('todos', {
      id: '1',
      title: 'foo',
      completed: false,
      assignee_id: '1',
    });
    await db.insert('users', { id: '1', name: 'bar' });
    const query = db
      .query('todos')
      // TODO: fix types
      .include('assignee', {
        subquery: db.query('users').where('id', '=', '$1.assignee_id').build(),
        cardinality: 'one',
      })
      .build();
    const result = await db.fetchOne(query);
    expect(result).toEqual({
      id: '1',
      title: 'foo',
      completed: false,
      assignee_id: '1',
      assignee: { id: '1', name: 'bar' },
    });
  });

  it('should select only the fields that are provided', async () => {
    const db = new DB();
    await db.insert('todos', { id: '1', title: 'foo', completed: false });
    const query = db.query('todos').select(['id', 'title']).build();
    const result = await db.fetchOne(query);
    expect(result).toEqual({ id: '1', title: 'foo' });
  });

  it('will return undefined at field that does not exist', async () => {
    const db = new DB();
    await db.insert('todos', { id: '1', title: 'foo', completed: false });
    const query = db.query('todos').select(['id', 'title', 'foo']).build();
    const result = await db.fetchOne(query);
    expect(result).toEqual({ id: '1', title: 'foo', foo: undefined });
  });
});
