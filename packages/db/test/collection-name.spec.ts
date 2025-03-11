import { it, expect, describe } from 'vitest';
import { DB } from '../src';
import { Schema as S } from '../src/schema/builder.js';
import { InvalidCollectionNameError } from '../src/errors.js';

const schema = {
  collections: {
    todos: {
      schema: S.Schema({
        id: S.Id(),
        title: S.String(),
        completed: S.Boolean(),
      }),
    },
  },
};

describe('schemaful', () => {
  it('collection name should be string', async () => {
    const db = new DB({ schema });
    const query = db.query(123);
    try {
      await db.fetchOne(query);
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidCollectionNameError);
      console.log(e);
      expect(e.contextMessage).toBe('Collection name must be a string');
    }
  });

  it('collection name should be in the schema', async () => {
    const db = new DB({ schema });
    const query = db.query('bad');
    try {
      await db.fetchOne(query);
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidCollectionNameError);
      expect(e.contextMessage).toBe(
        `Collection 'bad' does not exist in the schema`
      );
    }
  });
});

describe('schemaless', () => {
  it('collection name should be string', async () => {
    const db = new DB({ schema });
    const query = db.query(123);
    try {
      await db.fetchOne(query);
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidCollectionNameError);
      console.log(e);
      expect(e.contextMessage).toBe('Collection name must be a string');
    }
  });
});
