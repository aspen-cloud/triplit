import { expectTypeOf, test, describe } from 'vitest';
import { DB } from '../../src/db.js';
import { Schema as S } from '../../src/schema/builder.js';
import { EXHAUSTIVE_SCHEMA } from '../utils/exhaustive-schema.js';
import { fakeTx, ExhaustiveSchemaSelectAll } from './utils.js';

describe('fetch', () => {
  describe('schemaful', () => {
    test('without select returns all fields on the entity', async () => {
      const db = new DB({ schema: EXHAUSTIVE_SCHEMA });
      const tx = fakeTx(db);
      const query = db.query('test');
      const result = await db.fetch(query);
      expectTypeOf<
        (typeof result)[number]
      >().toEqualTypeOf<ExhaustiveSchemaSelectAll>();

      const txResult = await tx.fetch(query);
      expectTypeOf<
        (typeof txResult)[number]
      >().toEqualTypeOf<ExhaustiveSchemaSelectAll>();
    });
    test('with select returns only selected fields on the entity', async () => {
      const db = new DB({
        schema: {
          collections: {
            test: {
              schema: S.Schema({
                id: S.Id(),
                a: S.String(),
                b: S.Number(),
                c: S.Boolean(),
              }),
            },
          },
        },
      });
      const tx = fakeTx(db);
      const query = db.query('test').Select(['a', 'b']);
      const result = await db.fetch(query);
      expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
        a: string;
        b: number;
      }>();

      const txResult = await tx.fetch(query);
      expectTypeOf<(typeof txResult)[number]>().toEqualTypeOf<{
        a: string;
        b: number;
      }>();
    });
    test('can select paths into records', async () => {
      const db = new DB({
        schema: {
          collections: {
            test: {
              schema: S.Schema({
                id: S.Id(),
                a: S.String(),
                record: S.Record({
                  attr1: S.String(),
                  attr2: S.Optional(S.Number()),
                  attr3: S.Boolean(),
                }),
              }),
            },
          },
        },
      });
      const tx = fakeTx(db);

      // select full record
      const query = db.query('test').Select(['id', 'record']);
      {
        const result = await db.fetch(query);
        expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
          id: string;
          record: {
            attr1: string;
            attr2?: number | null | undefined;
            attr3: boolean;
          };
        }>();
      }
      {
        const result = await tx.fetch(query);
        expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
          id: string;
          record: {
            attr1: string;
            attr2?: number | null | undefined;
            attr3: boolean;
          };
        }>();
      }

      // select record paths
      const query2 = db
        .query('test')
        .Select(['id', 'record.attr1', 'record.attr3']);
      {
        const result = await db.fetch(query2);
        expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
          id: string;
          record: {
            attr1: string;
            attr3: boolean;
          };
        }>();
      }
      {
        const result = await tx.fetch(query2);
        expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
          id: string;
          record: {
            attr1: string;
            attr3: boolean;
          };
        }>();
      }
    });
  });

  // // TODO: fix types for subqueries
  test('can include relationships', async () => {
    const db = new DB({ schema: EXHAUSTIVE_SCHEMA });
    const tx = fakeTx(db);
    const query = db
      .query('test')
      .Select([])
      .Include('relationOne')
      .Include('relationMany')
      .Include('relationById');
    // .Subquery(
    //   'random',
    //   {
    //     collectionName: 'test2',
    //   },
    //   'many'
    // );

    {
      const result = await db.fetch(query);
      expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
        relationOne: { id: string; test2Data: string } | null;
        relationMany: { id: string; test3Data: string }[];
        relationById: { id: string; test4Data: string } | null;
        // random: { id: string; test2Data: string }[];
      }>();
    }
    {
      const result = await tx.fetch(query);
      expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
        relationOne: { id: string; test2Data: string } | null;
        relationMany: { id: string; test3Data: string }[];
        relationById: { id: string; test4Data: string } | null;
        // random: { id: string; test2Data: string }[];
      }>;
    }
  });

  test('properly merges includes and select statements', async () => {
    const db = new DB({ schema: EXHAUSTIVE_SCHEMA });
    const tx = fakeTx(db);
    const query = db.query('test').Select(['id']).Include('relationOne');

    {
      const result = await db.fetch(query);
      expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
        id: string;
        relationOne: { id: string; test2Data: string } | null;
      }>();
    }
    {
      const result = await tx.fetch(query);
      expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
        id: string;
        relationOne: { id: string; test2Data: string } | null;
      }>();
    }
  });

  test('properly handles relation shorthands', async () => {
    const db = new DB({ schema: EXHAUSTIVE_SCHEMA });
    const tx = fakeTx(db);

    // Builder
    {
      const query = db.query('test').Select([]).Include('relationById');
      // DB
      {
        const result = await db.fetch(query);
        expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
          relationById: { id: string; test4Data: string } | null;
        }>();
      }
      // Transaction
      {
        const result = await tx.fetch(query);
        expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
          relationById: { id: string; test4Data: string } | null;
        }>();
      }
    }

    // Raw
    {
      // DB
      {
        const result = await db.fetch({
          collectionName: 'test',
          select: [],
          include: { relationById: true },
        });
        expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
          relationById: { id: string; test4Data: string } | null;
        }>();
      }
      // Transaction
      {
        const result = await tx.fetch({
          collectionName: 'test',
          select: [],
          include: { relationById: true },
        });
        expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
          relationById: { id: string; test4Data: string } | null;
        }>();
      }
    }
  });

  test('unknown shorthands throw error', async () => {
    const db = new DB({ schema: EXHAUSTIVE_SCHEMA });
    expectTypeOf(db.query('test').Select([]).Include).toBeCallableWith(
      // @ts-expect-error 'unknown' is not a valid shorthand
      'unknown'
    );

    expectTypeOf(db.fetch).toBeCallableWith(
      // @ts-expect-error 'unknown' is not a valid shorthand
      {
        collectionName: 'test',
        include: { unknown: true },
      }
    );
  });

  // TODO: fix these are broken now
  test('properly handles rel subqueries', async () => {
    const db = new DB({ schema: EXHAUSTIVE_SCHEMA });
    const tx = fakeTx(db);
    // Builder
    {
      const query = db
        .query('test')
        .Select([])
        .Include('aliased', (rel) => rel('relationById'));
      // DB
      {
        const result = await db.fetch(query);
        expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
          aliased: { id: string; test4Data: string } | null;
        }>();
      }
      // Transaction
      {
        const result = await tx.fetch(query);
        expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
          aliased: { id: string; test4Data: string } | null;
        }>();
      }
    }

    // Raw
    {
      // DB
      {
        const result = await db.fetch({
          collectionName: 'test',
          select: [],
          include: {
            ['aliased']: {
              _extends: 'relationById',
            },
          },
        });
        const test = { aliased: { _extends: 'relationById' } };
        expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
          aliased: { id: string; test4Data: string } | null;
        }>();
      }
      // Transaction
      {
        const result = await tx.fetch({
          collectionName: 'test',
          select: [],
          include: { aliased: { _extends: 'relationById' as const } },
        });
        expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
          aliased: { id: string; test4Data: string } | null;
        }>();
      }
    }
  });

  test('can select within a rel subquery', async () => {
    const db = new DB({ schema: EXHAUSTIVE_SCHEMA });
    const tx = fakeTx(db);
    // Builder
    {
      const query = db
        .query('test')
        .Select([])
        .Include('aliased', (rel) => rel('relationById').Select(['test4Data']));
      // DB
      {
        const result = await db.fetch(query);
        expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
          aliased: { test4Data: string } | null;
        }>();
      }
      // Transaction
      {
        const result = await tx.fetch(query);
        expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
          aliased: { test4Data: string } | null;
        }>();
      }
    }

    // Raw
    {
      // DB
      {
        const result = await db.fetch({
          collectionName: 'test',
          select: [],
          include: {
            aliased: {
              _extends: 'relationById',
              select: ['test4Data'],
            },
          },
        });
        expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
          aliased: { test4Data: string } | null;
        }>();
      }
      // Transaction
      {
        const result = await tx.fetch({
          collectionName: 'test',
          select: [],
          include: {
            aliased: {
              _extends: 'relationById',
              select: ['test4Data'],
            },
          },
        });
        expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
          aliased: { test4Data: string } | null;
        }>();
      }
    }

    // TODO: add type tests for deep nesting of builder
    test('can include nested data within a rel subquery', async () => {
      const db = new DB({ schema: EXHAUSTIVE_SCHEMA });
      const tx = fakeTx(db);
      // TODO: fixup infinite depth issue
      // // Builder
      // {
      //   const query = db
      //     .query('test')
      //     .Select([])
      //     .Include('aliased', (rel) =>
      //       rel('relationOne').Select([]).Include('test3')
      //     );
      //   // DB
      //   {
      //     const result = await db.fetch(query);
      //     expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
      //       aliased: { test3: { id: string; test3Data: string } | null } | null;
      //     }>();
      //   }
      //   // Transaction
      //   {
      //     const result = await tx.fetch(query);
      //     expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
      //       aliased: { test3: { id: string; test3Data: string } | null } | null;
      //     }>();
      //   }
      // }

      // Raw
      {
        // DB
        {
          const result = await db.fetch({
            collectionName: 'test',
            select: [],
            include: {
              aliased: {
                _extends: 'relationOne',
                select: [],
                include: { test3: true },
              },
            },
          });
          expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
            aliased: { test3: { id: string; test3Data: string } | null } | null;
          }>();
        }
        // Transaction
        {
          const result = await tx.fetch({
            collectionName: 'test',
            select: [],
            include: {
              aliased: {
                _extends: 'relationOne',
                select: [],
                include: { test3: true },
              },
            },
          });
          expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
            aliased: { test3: { id: string; test3Data: string } | null } | null;
          }>();
        }
      }
    });

    test('properly handles subqueries', async () => {
      const db = new DB({ schema: EXHAUSTIVE_SCHEMA });
      const tx = fakeTx(db);
      // Builder
      {
        const query = db
          .query('test')
          .Select([])
          .SubqueryOne(
            'aliased',
            db.query('test2').Select(['id', 'test2Data'])
          );
        // DB
        {
          const result = await db.fetch(query);
          expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
            aliased: { id: string; test2Data: string } | null;
          }>();
        }
        // Transaction
        {
          const result = await tx.fetch(query);
          expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
            aliased: { id: string; test2Data: string } | null;
          }>();
        }
      }

      // Raw
      {
        // DB
        {
          const result = await db.fetch({
            collectionName: 'test',
            select: [],
            include: {
              aliased: {
                subquery: { collectionName: 'test2' },
                cardinality: 'one',
              },
            },
          });
          expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
            aliased: { id: string; test2Data: string } | null;
          }>();
        }
        // Transaction
        {
          const result = await tx.fetch({
            collectionName: 'test',
            select: [],
            include: {
              aliased: {
                subquery: { collectionName: 'test2' },
                cardinality: 'one',
              },
            },
          });
          expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
            aliased: { id: string; test2Data: string } | null;
          }>();
        }
      }
    });

    test('can select within a subquery', async () => {
      const db = new DB({ schema: EXHAUSTIVE_SCHEMA });
      const tx = fakeTx(db);
      // Builder
      {
        const query = db
          .query('test')
          .Select([])
          .SubqueryOne('aliased', db.query('test2').Select(['test2Data']));
        // DB
        {
          const result = await db.fetch(query);
          expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
            aliased: { test2Data: string } | null;
          }>();
        }
        // Transaction
        {
          const result = await tx.fetch(query);
          expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
            aliased: { test2Data: string } | null;
          }>();
        }
      }

      // Raw
      {
        // DB
        {
          const result = await db.fetch({
            collectionName: 'test',
            select: [],
            include: {
              aliased: {
                subquery: { collectionName: 'test2', select: ['test2Data'] },
                cardinality: 'one',
              },
            },
          });
          expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
            aliased: { test2Data: string } | null;
          }>();
        }
        // Transaction
        {
          const result = await tx.fetch({
            collectionName: 'test',
            select: [],
            include: {
              aliased: {
                subquery: { collectionName: 'test2', select: ['test2Data'] },
                cardinality: 'one',
              },
            },
          });
          expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
            aliased: { test2Data: string } | null;
          }>();
        }
      }
    });

    test('can include nested data within a subquery', async () => {
      const db = new DB({ schema: EXHAUSTIVE_SCHEMA });
      const tx = fakeTx(db);
      // Builder
      {
        const query = db
          .query('test')
          .Select([])
          .SubqueryOne(
            'aliased',
            db.query('test2').Select([]).Include('test3')
          );

        // DB
        {
          const result = await db.fetch(query);
          expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
            aliased: { test3: { id: string; test3Data: string } | null } | null;
          }>();
        }
        // Transaction
        {
          const result = await tx.fetch(query);
          expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
            aliased: { test3: { id: string; test3Data: string } | null } | null;
          }>();
        }
      }

      // Raw
      {
        // DB
        {
          const result = await db.fetch({
            collectionName: 'test',
            select: [],
            include: {
              aliased: {
                subquery: {
                  collectionName: 'test2',
                  select: [],
                  include: { test3: true },
                },
                cardinality: 'one',
              },
            },
          });
          expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
            aliased: { test3: { id: string; test3Data: string } | null } | null;
          }>();
        }
        // Transaction
        {
          const result = await tx.fetch({
            collectionName: 'test',
            select: [],
            include: {
              aliased: {
                subquery: {
                  collectionName: 'test2',
                  select: [],
                  include: { test3: true },
                },
                cardinality: 'one',
              },
            },
          });
          expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
            aliased: { test3: { id: string; test3Data: string } | null } | null;
          }>();
        }
      }
    });
  });

  describe('schemaless', () => {
    test('returns { [x: string]: any }[]', async () => {
      const db = new DB();
      const tx = fakeTx(db);
      const query = db.query('test');

      {
        const result = await db.fetch(query);
        expectTypeOf(result).toEqualTypeOf<{ [x: string]: any }[]>();
      }

      {
        const result = await tx.fetch(query);
        expectTypeOf(result).toEqualTypeOf<{ [x: string]: any }[]>();
      }
    });
  });
});

describe('fetchOne', () => {
  describe('schemaful', () => {
    test('returns a single entity or null', async () => {
      const db = new DB({ schema: EXHAUSTIVE_SCHEMA });
      const tx = fakeTx(db);
      const query = db
        .query('test')
        .Select(['id', 'string', 'number'])
        .Include('relationOne');
      {
        const result = await db.fetchOne(query);
        expectTypeOf(result).toEqualTypeOf<{
          id: string;
          string: string;
          number: number;
          relationOne: { id: string; test2Data: string } | null;
        } | null>();
      }

      {
        const result = await tx.fetchOne(query);
        expectTypeOf(result).toEqualTypeOf<{
          id: string;
          string: string;
          number: number;
          relationOne: { id: string; test2Data: string } | null;
        } | null>();
      }
    });
  });

  describe('schemaless', () => {
    test('returns { [x: string]: any } | null', async () => {
      const db = new DB();
      const tx = fakeTx(db);
      const query = db.query('test');

      {
        const result = await db.fetchOne(query);
        expectTypeOf(result).toEqualTypeOf<{ [x: string]: any } | null>();
      }

      {
        const result = await tx.fetchOne(query);
        expectTypeOf(result).toEqualTypeOf<{ [x: string]: any } | null>();
      }
    });
  });
});

describe('fetchById', () => {
  describe('schemaful', () => {
    test('returns a single entity or null', async () => {
      const db = new DB({ schema: EXHAUSTIVE_SCHEMA });
      const tx = fakeTx(db);

      {
        const result = await db.fetchById('test', '1');
        expectTypeOf(result).toEqualTypeOf<ExhaustiveSchemaSelectAll | null>();
      }

      {
        const result = await tx.fetchById('test', '1');
        expectTypeOf(result).toEqualTypeOf<ExhaustiveSchemaSelectAll | null>();
      }
    });
  });

  describe('schemaless', async () => {
    test('returns { [x: string]: any } | null', async () => {
      const db = new DB();
      const tx = fakeTx(db);

      {
        const result = await db.fetchById('test', '1');
        expectTypeOf(result).toEqualTypeOf<{ [x: string]: any } | null>();
      }

      {
        const result = await tx.fetchById('test', '1');
        expectTypeOf(result).toEqualTypeOf<{ [x: string]: any } | null>();
      }
    });
  });
});
