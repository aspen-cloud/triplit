import { beforeEach, describe, expect, it } from 'vitest';
import { tempTriplitServer } from '../utils/server.js';
import { ClientSchema, Entity, HttpClient } from '@triplit/client';
import { Schema as S, Type, WriteModel } from '@triplit/db';

const serviceToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ4LXRyaXBsaXQtdG9rZW4tdHlwZSI6InNlY3JldCIsIngtdHJpcGxpdC1wcm9qZWN0LWlkIjoicHJvamVjdCJ9.gcDKyZU9wf8o43Ca9kUVXO4KsGwX8IhhyEg1PO1ZqiQ';

const jwtSecret = 'test-secret';

// TODO: include this as part of withServer (gives the server a little breather between closing and opening)
beforeEach(async () => {
  await new Promise((res) => setTimeout(res, 1000));
});

it('fetch respects queries', async () => {
  using server = await tempTriplitServer({
    serverOptions: {
      jwtSecret: jwtSecret,
    },
  });
  const { port } = server;
  const client = new HttpClient({
    serverUrl: `http://localhost:${port}`,
    token: serviceToken,
  });
  await client.insert('test', { id: 'test1', name: 'a' });
  await client.insert('test', { id: 'test2', name: 'b' });
  await client.insert('test', { id: 'test3', name: 'a' });

  const result = await client.fetch({
    collectionName: 'test',
    where: [['name', '=', 'a']],
  });

  expect(result.length).toEqual(2);
  expect(result.find((e) => e.id === 'test1')).toBeTruthy();
  expect(result.find((e) => e.id === 'test2')).toBeFalsy();
  expect(result.find((e) => e.id === 'test3')).toBeTruthy();
});

it('fetch can handle a select without ["id"]', async () => {
  using server = await tempTriplitServer({
    serverOptions: {
      jwtSecret: jwtSecret,
    },
  });
  const { port } = server;
  const client = new HttpClient({
    serverUrl: `http://localhost:${port}`,
    token: serviceToken,
  });
  await client.insert('test', { id: 'test1', name: 'a' });
  await client.insert('test', { id: 'test2', name: 'b' });
  await client.insert('test', { id: 'test3', name: 'a' });

  const result = await client.fetch({
    collectionName: 'test',
    select: ['name'],
    where: [['name', '=', 'a']],
  });
  expect(result.length).toEqual(2);
  expect(result.every((e) => e.id === undefined)).toBeTruthy();
  expect(result.find((e) => e.name === 'a')).toBeTruthy();
  expect(result.find((e) => e.name === 'b')).toBeFalsy();
});

it('fetchOne returns a single entity that matches filter', async () => {
  using server = await tempTriplitServer({
    serverOptions: {
      jwtSecret: jwtSecret,
    },
  });
  const { port } = server;
  const client = new HttpClient({
    serverUrl: `http://localhost:${port}`,
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

it('fetchById returns a single entity by id', async () => {
  using server = await tempTriplitServer({
    serverOptions: {
      jwtSecret: jwtSecret,
    },
  });
  const { port } = server;
  const client = new HttpClient({
    serverUrl: `http://localhost:${port}`,
    token: serviceToken,
  });
  await client.insert('test', { id: 'test1', name: 'a' });
  await client.insert('test', { id: 'test2', name: 'b' });
  await client.insert('test', { id: 'test3', name: 'a' });

  const result = await client.fetchById('test', 'test1');

  expect(result).toEqual({ id: 'test1', name: 'a' });
});

it('can handle inserting all of our supported types', async () => {
  const schema = S.Collections({
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
  });
  type TestSchema = Entity<typeof schema, 'test'>;
  const insertedEntity: WriteModel<typeof schema, 'test'> = {
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
    defaultString: 'default',
    defaultNumber: 42,
    defaultBoolean: true,
    defaultDate: new Date(2022, 10, 15),
  };
  await using server = await tempTriplitServer({
    serverOptions: {
      dbOptions: {
        schema: { collections: schema },
      },
      jwtSecret: jwtSecret,
    },
  });
  const { port } = server;
  const client = new HttpClient<typeof schema>({
    serverUrl: `http://localhost:${port}`,
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
    await using server = await tempTriplitServer({
      serverOptions: {
        dbOptions: {
          schema,
        },
        jwtSecret: jwtSecret,
      },
    });
    const { port } = server;
    const client = new HttpClient({
      serverUrl: `http://localhost:${port}`,
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
  });

  it('can update sets', async () => {
    await using server = await tempTriplitServer({
      serverOptions: {
        dbOptions: {
          schema,
        },
        jwtSecret: jwtSecret,
      },
    });
    const { port } = server;
    const client = new HttpClient({
      serverUrl: `http://localhost:${port}`,
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
  });

  it('can assign to sets', async () => {
    await using server = await tempTriplitServer({
      serverOptions: {
        dbOptions: {
          schema,
        },
        jwtSecret: jwtSecret,
      },
    });
    const { port } = server;
    const client = new HttpClient({
      serverUrl: `http://localhost:${port}`,
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
  await using server = await tempTriplitServer({
    serverOptions: {
      dbOptions: {
        schema,
      },
      jwtSecret: jwtSecret,
    },
  });
  const { port } = server;
  const client = new HttpClient<typeof schema.collections>({
    serverUrl: `http://localhost:${port}`,
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
    expect(result.find((e) => e.id === 'test1')).toEqual(expectedResult);
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

  // Fetch with selection
  {
    const result = await client.fetch({
      collectionName: 'test',
      select: ['id'],
    });
    expect(result).toEqual([{ id: 'test1' }]);
  }
});

it('fetch can properly deserialize subqueries with schema', async () => {
  const schema = {
    collections: {
      test: {
        schema: S.Schema({
          id: S.Id(),
          name: S.String(),
        }),
        relationships: {
          relationshipOne: S.RelationOne('relationship', {
            where: [['testId', '=', '$id']],
          }),
          relationshipMany: S.RelationMany('relationship', {
            where: [['testId', '=', '$id']],
          }),
        },
      },
      relationship: {
        schema: S.Schema({
          id: S.Id(),
          testId: S.String(),
        }),
      },
    },
  };
  await using server = await tempTriplitServer({
    serverOptions: {
      dbOptions: {
        schema,
      },
      jwtSecret: jwtSecret,
    },
  });
  const { port } = server;
  const client = new HttpClient({
    serverUrl: `http://localhost:${port}`,
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
    const relOne = result.find((e) => e.id === 'test1')!.relationshipOne;
    expect(relOne).toEqual(expectedRel1);
    const relMany = result.find((e) => e.id === 'test1')!.relationshipMany;
    expect(relMany.length).toEqual(2);
    expect(relMany.find((e) => e.id === 'rel1')).toEqual(expectedRel1);
    expect(relMany.find((e) => e.id === 'rel2')).toEqual(expectedRel2);
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
    expect(relMany.length).toEqual(2);
    expect(relMany.find((e) => e.id === 'rel1')).toEqual(expectedRel1);
    expect(relMany.find((e) => e.id === 'rel2')).toEqual(expectedRel2);
  }
});

// TODO: need to properly handle subqueries without schema in http api
it('fetch can properly deserialize subqueries without schema', async () => {
  await using server = await tempTriplitServer({
    serverOptions: {
      jwtSecret: jwtSecret,
    },
  });
  const { port } = server;
  const client = new HttpClient({
    serverUrl: `http://localhost:${port}`,
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

  const relOne = result.find((e) => e.id === 'test1')!.relationshipOne;
  expect(relOne).toEqual(expectedRel1);
  const relMany = result.find((e) => e.id === 'test1')!.relationshipMany;
  expect(relMany.length).toEqual(2);
  expect(relMany.find((e) => e.id === 'rel1')).toEqual(expectedRel1);
  expect(relMany.find((e) => e.id === 'rel2')).toEqual(expectedRel2);
});

it('update properly updates an entity (functional api)', async () => {
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
  await using server = await tempTriplitServer({
    serverOptions: { dbOptions: { schema }, jwtSecret: jwtSecret },
  });
  const { port } = server;
  const client = new HttpClient({
    serverUrl: `http://localhost:${port}`,
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
});

it('update properly updates an entity (patch api)', async () => {
  const schema = {
    collections: {
      test: {
        schema: S.Schema({
          id: S.Id(),
          name: S.String(),
          items: S.Set(S.String()),
        }),
      },
    },
  };
  await using server = await tempTriplitServer({
    serverOptions: { dbOptions: { schema }, jwtSecret: jwtSecret },
  });
  const { port } = server;
  const client = new HttpClient({
    serverUrl: `http://localhost:${port}`,
    token: serviceToken,
    schema: schema.collections,
  });
  await client.insert('test', {
    id: 'test1',
    name: 'a',
    items: new Set(['item1', 'item2']),
  });

  await client.update('test', 'test1', {
    name: 'b',
    items: new Set(['item3']),
  });

  const result = await client.fetchById('test', 'test1');
  expect(result).toEqual({
    id: 'test1',
    name: 'b',
    items: new Set(['item1', 'item2', 'item3']),
  });
});

it('delete properly deletes an entity', async () => {
  await using server = await tempTriplitServer({
    serverOptions: {
      jwtSecret: jwtSecret,
    },
  });
  const { port } = server;
  const client = new HttpClient({
    serverUrl: `http://localhost:${port}`,
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

it('deleteAll properly deletes all entities in a collection', async () => {
  await using server = await tempTriplitServer({
    serverOptions: {
      jwtSecret: jwtSecret,
    },
  });
  const { port } = server;
  const client = new HttpClient({
    serverUrl: `http://localhost:${port}`,
    token: serviceToken,
  });
  await client.insert('test', { id: 'test1', name: 'a' });
  await client.insert('test', { id: 'test2', name: 'b' });
  await client.insert('test', { id: 'test3', name: 'c' });
  await client.insert('prod', { id: 'prod1', name: 'd' });
  {
    const result = await client.fetch({ collectionName: 'test' });
    expect(result.length).toEqual(3);
  }
  {
    const result = await client.fetch({ collectionName: 'prod' });
    expect(result.length).toEqual(1);
  }
  await client.deleteAll('test');
  {
    const result = await client.fetch({ collectionName: 'test' });
    expect(result.length).toEqual(0);
  }
  {
    const result = await client.fetch({ collectionName: 'prod' });
    expect(result.length).toEqual(1);
  }
});
