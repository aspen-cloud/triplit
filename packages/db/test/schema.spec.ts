import { createDB, DB, DBSchema } from '../src/db.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { Schema as S } from '../src/schema/builder.js';
import { BTreeKVStore } from '../src/kv-store/storage/memory-btree.js';

describe('schema initialization', () => {
  it('should initialize with a schema', async () => {
    const schema: DBSchema = {
      collections: {
        users: {
          schema: S.Schema({
            id: S.Id(),
            username: S.String(),
            email: S.String(),
          }),
        },
      },
      roles: {
        user: {
          match: {
            uid: '$userId',
          },
        },
      },
    };
    const db = await createDB({
      schema,
    });
    // In memory schema should match
    expect(db.schema).toEqual(schema);
    // Stored schema should match
    const schemaEntity = await db.entityStore.getEntity(
      db.kv,
      '_metadata',
      '_schema'
    );
    const {
      // @ts-expect-error
      id,
      ...schemaEntityData
    } = schemaEntity;
    expect(schemaEntityData).toEqual(schema);
  });
  it('createDB will throw an Error if a backwards incompatible schema is provided', async () => {
    const kv = new BTreeKVStore();
    const schema = {
      collections: {
        users: {
          schema: S.Schema({
            id: S.Id(),
            name: S.String(),
          }),
        },
      },
    };
    const db = await createDB({ schema, kv });
    await db.insert('users', { id: '1', name: 'test' });
    const newSchema = {
      collections: {
        users: {
          schema: S.Schema({
            id: S.Id(),
            username: S.String(),
          }),
        },
      },
    };
    await expect(createDB({ schema: newSchema, kv })).rejects.toThrowError();
  });
});
describe('defaults', async () => {
  it('should use defaults when serializing a client record for db insert', async () => {
    const db = new DB({
      schema: {
        collections: {
          users: {
            schema: S.Schema({
              id: S.Id(),
              username: S.String({ default: 'default' }),
              email: S.String(),
            }),
          },
        },
      },
    });
    let input = { id: '1', email: 'test' };
    await db.insert('users', input);
    const results = await db.fetch({ collectionName: 'users' });
    expect(results).toEqual([{ id: '1', username: 'default', email: 'test' }]);
    // @ts-expect-error
    input = { id: '2', email: 'test', username: 'test' };
    await db.insert('users', input);
    const results2 = await db.fetch({ collectionName: 'users' });
    expect(results2).toEqual([
      { id: '1', username: 'default', email: 'test' },
      { id: '2', username: 'test', email: 'test' },
    ]);
  });
  it('defaults for a record type are based on the defaults of attributes', async () => {
    const db = new DB({
      schema: {
        collections: {
          users: {
            schema: S.Schema({
              id: S.Id(),
              address: S.Record({
                street: S.String({ default: '742 Evergreen Terrace' }),
                city: S.String({ default: 'Springfield' }),
              }),
            }),
          },
        },
      },
    });
    // insert full defaults
    await db.insert('users', { id: 'homer', address: {} });
    await db.insert('users', { id: 'marge', address: {} });
    // insert partial
    await db.insert('users', {
      id: 'flanders',
      address: { street: '744 Evergreen Terrace' },
    });

    const results = await db.fetch({ collectionName: 'users' });
    expect(results).toEqual([
      {
        id: 'flanders',
        address: { street: '744 Evergreen Terrace', city: 'Springfield' },
      },
      {
        id: 'homer',
        address: { street: '742 Evergreen Terrace', city: 'Springfield' },
      },
      {
        id: 'marge',
        address: { street: '742 Evergreen Terrace', city: 'Springfield' },
      },
    ]);
  });
  it('defaults are applied for optional attributes', async () => {
    const db = new DB({
      schema: {
        collections: {
          users: {
            schema: S.Schema({
              id: S.Id(),
              name: S.String({ nullable: true, default: 'John Doe' }),
            }),
          },
        },
      },
    });
    await db.insert('users', { id: '1' });
    await db.insert('users', { id: '2', name: null });
    await db.insert('users', { id: '3', name: 'Alice' });
    const results = await db.fetch({ collectionName: 'users' });
    expect(results).toEqual([
      { id: '1', name: 'John Doe' },
      { id: '2', name: null },
      { id: '3', name: 'Alice' },
    ]);
  });
});
