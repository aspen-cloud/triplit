import { assert, beforeEach, describe, expect, it } from 'vitest';
import { withServer } from '../utils/server.js';
import { ClientSchema, Entity, HttpClient } from '@triplit/client';
import { InsertTypeFromModel, Schema as S } from '@triplit/db';

const PORT = 8888;

const serviceToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ4LXRyaXBsaXQtdG9rZW4tdHlwZSI6InNlY3JldCIsIngtdHJpcGxpdC1wcm9qZWN0LWlkIjoicHJvamVjdCJ9.gcDKyZU9wf8o43Ca9kUVXO4KsGwX8IhhyEg1PO1ZqiQ';

process.env.PROJECT_ID = 'project';
process.env.JWT_SECRET = 'test-secret';

// TODO: include this as part of withServer (gives the server a little breather between closing and opening)
beforeEach(async () => {
  await new Promise((res) => setTimeout(res, 1000));
});

it('fetch respects queries', async () => {
  await withServer({ port: PORT }, async () => {
    const client = new HttpClient({
      server: `http://localhost:${PORT}`,
      token: serviceToken,
    });
    await client.insert('test', { id: 'test1', name: 'a' });
    await client.insert('test', { id: 'test2', name: 'b' });
    await client.insert('test', { id: 'test3', name: 'a' });

    const result = await client.fetch({
      collectionName: 'test',
      where: [['name', '=', 'a']],
    });

    expect(result.size).toEqual(2);
    expect(result.get('test1')).toBeTruthy();
    expect(result.get('test2')).toBeFalsy();
    expect(result.get('test3')).toBeTruthy();
  });
});

it('fetchOne returns a single entity that matches filter', async () => {
  await withServer({ port: PORT }, async () => {
    const client = new HttpClient({
      server: `http://localhost:${PORT}`,
      token: serviceToken,
    });
    await client.insert('test', { id: 'test1', name: 'a' });
    await client.insert('test', { id: 'test2', name: 'b' });
    await client.insert('test', { id: 'test3', name: 'a' });

    const result = await client.fetchOne({
      collectionName: 'test',
      where: [['name', '=', 'a']],
    });

    expect(result).toEqual({ id: 'test1', name: 'a' });
  });
});

it('fetchById returns a single entity by id', async () => {
  await withServer({ port: PORT }, async () => {
    const client = new HttpClient({
      server: `http://localhost:${PORT}`,
      token: serviceToken,
    });
    await client.insert('test', { id: 'test1', name: 'a' });
    await client.insert('test', { id: 'test2', name: 'b' });
    await client.insert('test', { id: 'test3', name: 'a' });

    const result = await client.fetchById('test', 'test1');

    expect(result).toEqual({ id: 'test1', name: 'a' });
  });
});

it('can handle inserting all of our supported types', async () => {
  const schema = {
    test: {
      schema: S.Schema({
        id: S.Id(),
        string: S.String(),
        number: S.Number(),
        boolean: S.Boolean(),
        date: S.Date(),
        set: S.Set(S.String()),
        record: S.Record({
          string: S.String(),
          number: S.Number(),
          boolean: S.Boolean(),
          date: S.Date(),
        }),
        nullableString: S.String({ nullable: true }),
        nullableNumber: S.Number({ nullable: true }),
        nullableBoolean: S.Boolean({ nullable: true }),
        nullableDate: S.Date({ nullable: true }),
        nullableSet: S.Set(S.String(), { nullable: true }),
        defaultString: S.String({ default: 'default' }),
        defaultNumber: S.Number({ default: 42 }),
        defaultBoolean: S.Boolean({ default: true }),
        defaultDate: S.Date({ default: new Date(2022, 10, 15).toISOString() }),
        defaultNullString: S.String({ default: null, nullable: true }),
        defaultNullNumber: S.Number({ default: null, nullable: true }),
        defaultNullBoolean: S.Boolean({ default: null, nullable: true }),
        defaultNullDate: S.Date({ default: null, nullable: true }),
      }),
    },
  } satisfies ClientSchema;
  type TestSchema = Entity<typeof schema, 'test'>;
  const insertedEntity: InsertTypeFromModel<(typeof schema)['test']['schema']> =
    {
      id: 'test1',
      string: 'string',
      number: 42,
      boolean: true,
      date: new Date(2022, 10, 15),
      set: new Set(['set']),
      record: {
        string: 'string',
        number: 42,
        boolean: true,
        date: new Date(2022, 10, 15),
      },
      nullableString: null,
      nullableNumber: null,
      nullableBoolean: null,
      nullableDate: null,
      nullableSet: null,
    };
  const expectedEntity: TestSchema = {
    ...(insertedEntity as TestSchema),
    defaultString: 'default',
    defaultNumber: 42,
    defaultBoolean: true,
    defaultDate: new Date(2022, 10, 15),
    defaultNullString: null,
    defaultNullNumber: null,
    defaultNullBoolean: null,
    defaultNullDate: null,
  };
  await withServer(
    {
      port: PORT,
      serverOptions: {
        dbOptions: {
          schema: { collections: schema },
        },
      },
    },
    async () => {
      const client = new HttpClient<typeof schema>({
        server: `http://localhost:${PORT}`,
        token: serviceToken,
        schema,
      });

      await client.insert('test', insertedEntity);

      const result = await client.fetchOne({
        collectionName: 'test',
        where: [['string', '=', 'string']],
      });

      expect(result).toEqual(expectedEntity);

      // delete the entity
      await client.delete('test', 'test1');

      //fetch it back
      const result2 = await client.fetchOne({
        collectionName: 'test',
        where: [['string', '=', 'string']],
      });

      expect(result2).toBeNull();

      await client.bulkInsert({ test: [insertedEntity] });
      const result3 = await client.fetchOne({
        collectionName: 'test',
        where: [['string', '=', 'string']],
      });
      expect(result3).toEqual(expectedEntity);
    }
  );
});

describe('set operations', () => {
  const schema = {
    collections: {
      test: {
        schema: S.Schema({
          id: S.Id(),
          name: S.String(),
          tags: S.Set(S.String()),
        }),
      },
    },
  };

  it('can insert Sets', async () => {
    await withServer(
      {
        port: PORT,
        serverOptions: {
          dbOptions: {
            schema,
          },
        },
      },
      async () => {
        const client = new HttpClient({
          server: `http://localhost:${PORT}`,
          token: serviceToken,
          schema: schema.collections,
        });

        // Test single insert
        await client.insert('test', {
          id: 'test1',
          name: 'a',
          tags: new Set(['tag1', 'tag2']),
        });

        const result = await client.fetchById('test', 'test1');
        expect(result).toEqual({
          id: 'test1',
          name: 'a',
          tags: new Set(['tag1', 'tag2']),
        });

        // Test bulk insert
        await client.bulkInsert({
          test: [
            {
              id: 'test2',
              name: 'b',
              tags: new Set(['tag3', 'tag4']),
            },
            {
              id: 'test3',
              name: 'c',
              tags: new Set(['tag5', 'tag6']),
            },
          ],
        });

        const result2 = await client.fetchById('test', 'test2');
        expect(result2).toEqual({
          id: 'test2',
          name: 'b',
          tags: new Set(['tag3', 'tag4']),
        });

        const result3 = await client.fetchById('test', 'test3');
        expect(result3).toEqual({
          id: 'test3',
          name: 'c',
          tags: new Set(['tag5', 'tag6']),
        });
      }
    );
  });

  it('can update sets', async () => {
    await withServer(
      {
        port: PORT,
        serverOptions: {
          dbOptions: {
            schema,
          },
        },
      },
      async () => {
        const client = new HttpClient({
          server: `http://localhost:${PORT}`,
          token: serviceToken,
          schema: schema.collections,
        });

        await client.insert('test', {
          id: 'test1',
          name: 'a',
          tags: new Set(['tag1', 'tag2']),
        });

        await client.update('test', 'test1', (entity) => {
          entity.tags.add('tag3');
        });

        {
          const result = await client.fetchById('test', 'test1');
          expect(result).toEqual({
            id: 'test1',
            name: 'a',
            tags: new Set(['tag1', 'tag2', 'tag3']),
          });
        }

        await client.update('test', 'test1', (entity) => {
          entity.tags.delete('tag2');
        });

        {
          const result = await client.fetchById('test', 'test1');
          expect(result).toEqual({
            id: 'test1',
            name: 'a',
            tags: new Set(['tag1', 'tag3']),
          });
        }
      }
    );
  });

  it('can assign to sets', async () => {
    await withServer(
      {
        port: PORT,
        serverOptions: {
          dbOptions: {
            schema,
          },
        },
      },
      async () => {
        const client = new HttpClient({
          server: `http://localhost:${PORT}`,
          token: serviceToken,
          schema: schema.collections,
        });

        await client.insert('test', {
          id: 'test1',
          name: 'a',
          tags: new Set(['tag1', 'tag2']),
        });

        await client.update('test', 'test1', (entity) => {
          entity.tags = new Set(['tag3', 'tag4']);
        });

        {
          const result = await client.fetchById('test', 'test1');
          expect(result).toEqual({
            id: 'test1',
            name: 'a',
            tags: new Set(['tag3', 'tag4']),
          });
        }
      }
    );
  });
});

it('fetch properly deserializes data based on schema', async () => {
  const schema = {
    collections: {
      test: {
        schema: S.Schema({
          id: S.Id(),
          name: S.String(),
          date: S.Date(),
        }),
      },
    },
  };
  await withServer(
    {
      port: PORT,
      serverOptions: {
        dbOptions: {
          schema,
        },
      },
    },
    async () => {
      const client = new HttpClient<typeof schema.collections>({
        server: `http://localhost:${PORT}`,
        token: serviceToken,
        schema: schema.collections,
      });
      await client.insert('test', {
        id: 'test1',
        name: 'a',
        date: new Date(2022, 10, 15),
      });

      const expectedResult = {
        id: 'test1',
        name: 'a',
        date: new Date(2022, 10, 15),
      };

      // fetch
      {
        const result = await client.fetch({ collectionName: 'test' });
        expect(result.get('test1')).toEqual(expectedResult);
      }

      // fetchOne
      {
        const result = await client.fetchOne({
          collectionName: 'test',
        });
        expect(result).toEqual(expectedResult);
      }

      // fetchById
      {
        const result = await client.fetchById('test', 'test1');
        expect(result).toEqual(expectedResult);
      }
    }
  );
});

it('fetch can properly deserialize subqueries with schema', async () => {
  const schema = {
    collections: {
      test: {
        schema: S.Schema({
          id: S.Id(),
          name: S.String(),
          relationshipOne: S.RelationOne('relationship', {
            where: [['testId', '=', '$id']],
          }),
          relationshipMany: S.RelationMany('relationship', {
            where: [['testId', '=', '$id']],
          }),
        }),
      },
      relationship: {
        schema: S.Schema({
          id: S.Id(),
          testId: S.String(),
        }),
      },
    },
  };
  await withServer(
    {
      port: PORT,
      serverOptions: {
        dbOptions: {
          schema,
        },
      },
    },
    async () => {
      const client = new HttpClient({
        server: `http://localhost:${PORT}`,
        token: serviceToken,
        schema: schema.collections,
      });
      await client.insert('test', {
        id: 'test1',
        name: 'a',
      });
      await client.insert('relationship', {
        id: 'rel1',
        testId: 'test1',
      });
      await client.insert('relationship', {
        id: 'rel2',
        testId: 'test1',
      });

      const expectedRel1 = {
        id: 'rel1',
        testId: 'test1',
      };

      const expectedRel2 = {
        id: 'rel2',
        testId: 'test1',
      };

      // fetch
      {
        const result = await client.fetch({
          collectionName: 'test',
          include: { relationshipOne: null, relationshipMany: null },
        });
        const relOne = result.get('test1')!.relationshipOne;
        expect(relOne).toEqual(expectedRel1);
        const relMany = result.get('test1')!.relationshipMany;
        expect(relMany.size).toEqual(2);
        expect(relMany.get('rel1')).toEqual(expectedRel1);
        expect(relMany.get('rel2')).toEqual(expectedRel2);
      }

      // fetchOne
      {
        const result = await client.fetchOne({
          collectionName: 'test',
          include: { relationshipOne: null, relationshipMany: null },
        });

        const relOne = result!.relationshipOne;
        expect(relOne).toEqual(expectedRel1);
        const relMany = result!.relationshipMany;
        expect(relMany.size).toEqual(2);
        expect(relMany.get('rel1')).toEqual(expectedRel1);
        expect(relMany.get('rel2')).toEqual(expectedRel2);
      }
    }
  );
});

// TODO: need to properly handle subqueries without schema in http api
it.todo(
  'fetch can properly deserialize subqueries without schema',
  async () => {
    await withServer(
      {
        port: PORT,
      },
      async () => {
        const client = new HttpClient({
          server: `http://localhost:${PORT}`,
          token: serviceToken,
        });
        await client.insert('test', {
          id: 'test1',
          name: 'a',
        });
        await client.insert('relationship', {
          id: 'rel1',
          testId: 'test1',
        });
        await client.insert('relationship', {
          id: 'rel2',
          testId: 'test1',
        });

        const expectedRel1 = {
          id: 'rel1',
          testId: 'test1',
        };

        const expectedRel2 = {
          id: 'rel2',
          testId: 'test1',
        };

        const result = await client.fetch({
          collectionName: 'test',
          include: {
            relationshipOne: {
              subquery: {
                collectionName: 'relationship',
                where: [['testId', '=', '$id']],
              },
              cardinality: 'one',
            },
            relationshipMany: {
              subquery: {
                collectionName: 'relationship',
                where: [['testId', '=', '$id']],
              },
              cardinality: 'many',
            },
          },
        });

        const relOne = result.get('test1')!.relationshipOne;
        expect(relOne).toEqual(expectedRel1);
        const relMany = result.get('test1')!.relationshipMany;
        expect(relMany.size).toEqual(2);
        expect(relMany.get('rel1')).toEqual(expectedRel1);
        expect(relMany.get('rel2')).toEqual(expectedRel2);
      }
    );
  }
);

it('update properly updates an entity', async () => {
  const schema = {
    collections: {
      test: {
        schema: S.Schema({
          id: S.Id(),
          name: S.String(),
          date: S.Date(),
        }),
      },
    },
  };
  await withServer(
    { port: PORT, serverOptions: { dbOptions: { schema } } },
    async () => {
      const client = new HttpClient({
        server: `http://localhost:${PORT}`,
        token: serviceToken,
        schema: schema.collections,
      });
      await client.insert('test', {
        id: 'test1',
        name: 'a',
        date: new Date(2023, 1, 1),
      });

      await client.update('test', 'test1', (entity) => {
        entity.name = 'b';
        entity.date = new Date(2023, 1, 2);
      });

      const result = await client.fetchById('test', 'test1');
      expect(result).toEqual({
        id: 'test1',
        name: 'b',
        date: new Date(2023, 1, 2),
      });
    }
  );
});

it('delete properly deletes an entity', async () => {
  await withServer({ port: PORT }, async () => {
    const client = new HttpClient({
      server: `http://localhost:${PORT}`,
      token: serviceToken,
    });
    await client.insert('test', { id: 'test1', name: 'a' });
    {
      const result = await client.fetchById('test', 'test1');
      expect(result).toBeTruthy();
    }

    await client.delete('test', 'test1');
    {
      const result = await client.fetchById('test', 'test1');
      expect(result).toBeFalsy();
    }
  });
});
