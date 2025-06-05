import { beforeEach, describe, expect, it } from 'vitest';
import { Schema as S } from '../src/schema/builder.js';
import { BTreeKVStore } from '../src/kv-store/storage/memory-btree.js';
import { DBInitializationError, TriplitError } from '../src/errors.js';
import { createDB, DB, DBSchema } from '../src/db.js';

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
    const { db } = await createDB({
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
  it('createDB will contain an error event if a backwards incompatible schema is provided', async () => {
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
    {
      const { db, event } = await createDB({ schema, kv });
      expect(event.type).toBe('SUCCESS');
      await db.insert('users', { id: '1', name: 'test' });
    }

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
    {
      const { db, event } = await createDB({ schema: newSchema, kv });
      expect(event.type).toBe('SCHEMA_UPDATE_FAILED');
      // Old schema should still be in place
      expect(db.schema).toEqual(schema);
      const storedSchema = await DB.getSchemaFromStorage(kv);
      expect(storedSchema).toEqual(schema);
    }
  });
  it('createDB will throw an error if it cannot create a db instance', async () => {
    const kv = new BTreeKVStore();
    const { db } = await createDB({ kv });
    const invalidSchema = {
      collections: {
        users: {
          schema: S.Schema({
            id: S.Id(),
            todos: S.Json(),
          }),
          relationships: {
            todos: S.RelationById('todos', '$1.id'),
          },
        },
        todos: {
          schema: S.Schema({
            id: S.Id(),
          }),
        },
      },
    };
    // Manually update the schema to an invalid one
    // @ts-expect-error - private method
    await db.updateSchema(invalidSchema);
    // TODO: vitest not accepting DBInitializationError, but it clearly is
    await expect(createDB({ kv })).rejects.toThrow(TriplitError); // DBInitializationError
  });
  it('schemas will full overwrite and not merge on replacement', async () => {
    const kv = new BTreeKVStore();
    const schema = {
      collections: {
        users: {
          schema: S.Schema({
            id: S.Id(),
            name: S.String(),
          }),
          relationships: {
            todos: S.RelationById('todos', '$1.id'),
          },
        },
        todos: {
          schema: S.Schema({
            id: S.Id(),
            title: S.String(),
          }),
        },
      },
    };
    {
      const { db } = await createDB({ schema, kv });
      const storedSchema = await DB.getSchemaFromStorage(kv);
      expect(storedSchema).toEqual(schema);
    }
    // Now replace the schema with a new one
    const newSchema = {
      collections: {
        users: {
          schema: S.Schema({
            id: S.Id(),
            // changed attribute
            username: S.String(),
            // moved relationship to attribute
            todos: S.Json(),
          }),
        },
        todos: {
          schema: S.Schema({
            id: S.Id(),
            title: S.String(),
          }),
        },
      },
    };
    {
      const { db } = await createDB({ schema: newSchema, kv });
      const storedSchema = await DB.getSchemaFromStorage(kv);
      expect(storedSchema).toEqual(newSchema);
    }
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
