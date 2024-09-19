import { expectTypeOf, test, describe } from 'vitest';
import DB from '../../src/db.js';
import { Schema as S } from '../../src/schema/builder.js';
import {
  OrderStatement,
  ParseSelect,
  QueryOrder,
  QueryWhere,
  ValueCursor,
  WhereFilter,
} from '../../src/query/types/index.js';
import { EXHAUSTIVE_SCHEMA } from '../utils/exhaustive-schema.js';
import { fakeTx, MapValue } from './utils.js';
import { Models } from '../../src/index.js';

describe('fetch', () => {
  describe('schemaful', () => {
    test('without select returns all fields on the entity', async () => {
      const db = new DB({ schema: EXHAUSTIVE_SCHEMA });
      const tx = fakeTx(db);
      const query = db.query('test').build();
      const result = await db.fetch(query);
      expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
        id: string;
        string: string;
        boolean: boolean;
        number: number;
        enumString: 'a' | 'b' | 'c';
        date: Date;
        setString: Set<string>;
        setNumber: Set<number>;
        nullableSet: Set<string> | null;
        record: { attr1: string; attr2: string; attr3?: string };
        optional: string | undefined;
        nullableFalse: string;
        nullableTrue: string | null;
        defaultValue: string;
        defaultNull: string | null;
        defaultNow: string;
        defaultUuid: string;
      }>();

      const txResult = await tx.fetch(query);
      expectTypeOf<(typeof txResult)[number]>().toEqualTypeOf<{
        id: string;
        string: string;
        boolean: boolean;
        number: number;
        enumString: 'a' | 'b' | 'c';
        date: Date;
        setString: Set<string>;
        setNumber: Set<number>;
        nullableSet: Set<string> | null;
        record: { attr1: string; attr2: string; attr3?: string };
        optional: string | undefined;
        nullableFalse: string;
        nullableTrue: string | null;
        defaultValue: string;
        defaultNull: string | null;
        defaultNow: string;
        defaultUuid: string;
      }>();
    });

    test('with select returns only selected fields on the entity', async () => {
      const db = new DB({ schema: EXHAUSTIVE_SCHEMA });
      const tx = fakeTx(db);
      const query = db.query('test').select(['id', 'string', 'number']).build();
      const result = await db.fetch(query);
      expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
        id: string;
        string: string;
        number: number;
      }>();

      const txResult = await tx.fetch(query);
      expectTypeOf<(typeof txResult)[number]>().toEqualTypeOf<{
        id: string;
        string: string;
        number: number;
      }>();
    });

    test('can select paths into records', async () => {
      const db = new DB({ schema: EXHAUSTIVE_SCHEMA });
      const tx = fakeTx(db);

      // select full record
      const query = db.query('test').select(['id', 'record']).build();
      {
        const result = await db.fetch(query);
        expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
          id: string;
          record: { attr1: string; attr2: string; attr3?: string };
        }>();
      }
      {
        const result = await tx.fetch(query);
        expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
          id: string;
          record: { attr1: string; attr2: string; attr3?: string };
        }>();
      }

      // select record paths
      const query2 = db
        .query('test')
        .select(['id', 'record.attr1', 'record.attr3'])
        .build();
      {
        const result = await db.fetch(query2);
        expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
          id: string;
          record: { attr1: string; attr3: string | undefined };
        }>();
      }
      {
        const result = await tx.fetch(query2);
        expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
          id: string;
          record: { attr1: string; attr3: string | undefined };
        }>();
      }
    });

    // // TODO: fix types for subqueries
    test('can include relationships', async () => {
      const db = new DB({ schema: EXHAUSTIVE_SCHEMA });
      const tx = fakeTx(db);
      const query = db
        .query('test')
        .select([])
        .include('relationOne')
        .include('relationMany')
        .include('relationById')
        .subquery(
          'random',
          {
            collectionName: 'test2',
          },
          'many'
        )

        .build();
      {
        const result = await db.fetch(query);
        expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
          relationOne: { id: string; test2Data: string } | null;
          relationMany: { id: string; test3Data: string }[];
          relationById: { id: string; test4Data: string } | null;
          random: { id: string; test2Data: string }[];
        }>();
      }
      {
        const result = await tx.fetch(query);
        expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
          relationOne: { id: string; test2Data: string } | null;
          relationMany: { id: string; test3Data: string }[];
          relationById: { id: string; test4Data: string } | null;
          random: { id: string; test2Data: string }[];
        }>;
      }
    });

    test('properly merges includes and select statements', async () => {
      const db = new DB({ schema: EXHAUSTIVE_SCHEMA });
      const tx = fakeTx(db);
      const query = db
        .query('test')
        .select(['id'])
        .include('relationOne')
        .build();

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
        const query = db
          .query('test')
          .select([])
          .include('relationById')
          .build();
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
      expectTypeOf(db.query('test').select([]).include).toBeCallableWith(
        // @ts-expect-error 'unknown' is not a valid shorthand
        'unknown'
      );

      // TODO: This should throw an error, boolean should be assignable only to valid shorthands
      expectTypeOf(db.fetch).toBeCallableWith({
        collectionName: 'test',
        include: { unknown: true },
      });
    });

    test('properly handles rel subqueries', async () => {
      const db = new DB({ schema: EXHAUSTIVE_SCHEMA });
      const tx = fakeTx(db);
      // Builder
      {
        const query = db
          .query('test')
          .select([])
          // TOOD: FIX BUILDER
          .include('aliased', (rel) => rel('relationById').build())
          .build();
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
            include: { aliased: { _rel: 'relationById' } },
          });
          expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
            aliased: { id: string; test4Data: string } | null;
          }>();
        }
        // Transaction
        {
          const result = await tx.fetch({
            collectionName: 'test',
            select: [],
            include: { aliased: { _rel: 'relationById' } },
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
          .select([])
          .include('aliased', (rel) =>
            rel('relationById').select(['test4Data']).build()
          )
          .build();
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
                _rel: 'relationById',
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
                _rel: 'relationById',
                select: ['test4Data'],
              },
            },
          });
          expectTypeOf<(typeof result)[number]>().toEqualTypeOf<{
            aliased: { test4Data: string } | null;
          }>();
        }
      }
    });

    test('can include nested data within a rel subquery', async () => {
      const db = new DB({ schema: EXHAUSTIVE_SCHEMA });
      const tx = fakeTx(db);
      // Builder
      {
        const query = db
          .query('test')
          .select([])
          .include('aliased', (rel) =>
            rel('relationOne').select([]).include('test3').build()
          )
          .build();
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
                _rel: 'relationOne',
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
                _rel: 'relationOne',
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
          .select([])
          .subquery(
            'aliased',
            db.query('test2').select(['id', 'test2Data']).build(),
            'one'
          )
          .build();
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
          .select([])
          .subquery(
            'aliased',
            db.query('test2').select(['test2Data']).build(),
            'one'
          )
          .build();
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
          .select([])
          .subquery(
            'aliased',
            db.query('test2').select([]).include('test3').build(),
            'one'
          )
          .build();
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
    test('returns a Map<string, {[x: string]: any}>', async () => {
      const db = new DB();
      const tx = fakeTx(db);
      const query = db.query('test').build();

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
        .select(['id', 'string', 'number'])
        .include('relationOne')
        .build();

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
      const query = db.query('test').build();

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
        expectTypeOf(result).toEqualTypeOf<{
          id: string;
          string: string;
          number: number;
          boolean: boolean;
          enumString: 'a' | 'b' | 'c';
          date: Date;
          setString: Set<string>;
          setNumber: Set<number>;
          nullableSet: Set<string> | null;
          record: { attr1: string; attr2: string; attr3?: string };
          optional: string | undefined;
          nullableFalse: string;
          nullableTrue: string | null;
          defaultValue: string;
          defaultNull: string | null;
          defaultNow: string;
          defaultUuid: string;
        } | null>();
      }

      {
        const result = await tx.fetchById('test', '1');
        expectTypeOf(result).toEqualTypeOf<{
          id: string;
          string: string;
          number: number;
          enumString: 'a' | 'b' | 'c';
          boolean: boolean;
          date: Date;
          setString: Set<string>;
          setNumber: Set<number>;
          nullableSet: Set<string> | null;
          record: { attr1: string; attr2: string; attr3?: string };
          optional: string | undefined;
          nullableFalse: string;
          nullableTrue: string | null;
          defaultValue: string;
          defaultNull: string | null;
          defaultNow: string;
          defaultUuid: string;
        } | null>();
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

describe('query builder', () => {
  test('select', () => {
    const schema = {
      collections: {
        test: {
          schema: S.Schema({
            id: S.Id(),
            attr1: S.String(),
            attr2: S.Boolean(),
            attr3: S.Number(),
            record: S.Record({
              attr1: S.String(),
            }),

            // Not included
            subquery: S.Query({ collectionName: 'test2' as const, where: [] }),
          }),
        },
      },
    };
    // Schemaful
    {
      const db = new DB({ schema });
      const query = db.query('test');
      expectTypeOf(query.select)
        .parameter(0)
        .toEqualTypeOf<
          | ReadonlyArray<
              'attr1' | 'attr2' | 'attr3' | 'record' | 'record.attr1' | 'id'
            >
          | undefined
        >();
    }
    // schemaless
    {
      const db = new DB();
      const query = db.query('test');
      expectTypeOf(query.select)
        .parameter(0)
        .toEqualTypeOf<ReadonlyArray<string> | undefined>();
    }
  });
  test('where attribute prop', () => {
    const schema = {
      collections: {
        test: {
          schema: S.Schema({
            id: S.Id(),
            attr1: S.Record({
              inner1: S.Record({
                inner1A: S.String(),
                inner1B: S.String(),
              }),
              inner2: S.Record({
                inner2A: S.String(),
              }),
            }),
            attr2: S.Boolean(),
            // should include query
            relationById: S.RelationById('test2', 'test-id'),
          }),
        },
        test2: {
          schema: S.Schema({
            id: S.Id(),
          }),
        },
      },
    };
    {
      const db = new DB({ schema });
      const query = db.query('test');
      expectTypeOf(query.where)
        .parameter(0)
        .toEqualTypeOf<
          | undefined
          | 'id'
          | 'attr1'
          | 'attr1.inner1'
          | 'attr1.inner1.inner1A'
          | 'attr1.inner1.inner1B'
          | 'attr1.inner2'
          | 'attr1.inner2.inner2A'
          | 'attr2'
          | 'relationById.id'
          | WhereFilter<(typeof schema)['collections'], 'test'>
          | QueryWhere<(typeof schema)['collections'], 'test'>
        >();
    }
    {
      const db = new DB();
      const query = db.query('test');

      expectTypeOf(query.where)
        .parameter(0)
        .toEqualTypeOf<
          | string
          | WhereFilter<Models, 'test'>
          | QueryWhere<Models, 'test'>
          | undefined
        >();
    }
  });

  test('order attribute prop', () => {
    const schema = {
      collections: {
        test: {
          schema: S.Schema({
            id: S.Id(),
            attr1: S.Record({
              inner1: S.Record({
                inner1A: S.String(),
                inner1B: S.String(),
              }),
              inner2: S.Record({
                inner2A: S.String(),
              }),
            }),
            attr2: S.Boolean(),

            relationById: S.RelationById('test2', 'test-id'),
          }),
        },
        test2: {
          schema: S.Schema({
            id: S.Id(),
          }),
        },
      },
    };
    {
      const db = new DB({ schema });
      const query = db.query('test');
      expectTypeOf(query.order)
        .parameter(0)
        .toEqualTypeOf<
          | 'id'
          | 'attr1'
          | 'attr1.inner1'
          | 'attr1.inner1.inner1A'
          | 'attr1.inner1.inner1B'
          | 'attr1.inner2'
          | 'attr1.inner2.inner2A'
          | 'attr2'
          | 'relationById.id'
          | OrderStatement<(typeof schema)['collections'], 'test'>
          | QueryOrder<(typeof schema)['collections'], 'test'>
        >();
    }
    {
      const db = new DB();
      const query = db.query('test');
      expectTypeOf(query.order)
        .parameter(0)
        .toEqualTypeOf<
          string | QueryOrder<Models, 'test'> | OrderStatement<Models, 'test'>
        >();
    }
  });

  test('include', () => {
    const schema = {
      collections: {
        test: {
          schema: S.Schema({
            id: S.Id(),
            attr1: S.String(),
            subquery: S.Query({ collectionName: 'test2' as const, where: [] }),
          }),
        },
        test2: {
          schema: S.Schema({
            id: S.Id(),
          }),
        },
      },
    };
    // Schemaful
    {
      const db = new DB({ schema });
      const query = db.query('test');
      expectTypeOf(query.include).parameter(0).toEqualTypeOf<'subquery'>();
    }
    // schemaless
    {
      const db = new DB();
      const query = db.query('test');
      expectTypeOf(query.include).parameter(0).toEqualTypeOf<never>();
    }
  });

  test('after', () => {
    const schema = {
      collections: {
        test: {
          schema: S.Schema({
            id: S.Id(),
            attr1: S.String(),
            attr2: S.Boolean(),
            attr3: S.Number(),
            // should not include query
            query: S.Query({ collectionName: 'test2' as const, where: [] }),
          }),
        },
      },
    };
    {
      const db = new DB({ schema });
      const query = db.query('test');
      expectTypeOf(query.after).parameter(0).toEqualTypeOf<
        | ValueCursor
        // | FetchResultEntity<
        //     CollectionQueryDefault<typeof schema.collections, 'test'>
        //   >
        | undefined
      >();
    }
    {
      const db = new DB();
      const query = db.query('test');
      expectTypeOf(query.after).parameter(0).toEqualTypeOf<
        | ValueCursor
        // TODO: this is an ugly type, maybe should even drop support for this
        // | FetchResultEntityFromParts<Models, 'test', string, {}>
        | undefined
      >();
    }
  });
});

describe('fetching', () => {
  const schema = {
    collections: {
      test: {
        schema: S.Schema({
          id: S.Id(),
          attr1: S.String(),
          attr2: S.Boolean(),
          attr3: S.Number(),
          subquery: S.RelationMany('test2', {
            where: [],
          }),
        }),
      },
      test2: {
        schema: S.Schema({
          id: S.Id(),
        }),
      },
    },
  };
});

const schema = {
  a: {
    schema: S.Schema({
      id: S.Id(),
      propA: S.String(),
      number: S.Number(),
      b: S.RelationById('b', '$a'),
    }),
  },
  b: {
    schema: S.Schema({
      id: S.Id(),
      propB: S.String(),
    }),
  },
};

const db = new DB({ schema: { collections: schema } });
const query = db.query('a').select([]).build();
const res = await db.fetch(query);
type Q = typeof query;
type Select = Q['select'];
type ParsedSelect = ParseSelect<
  typeof schema,
  Q['collectionName'],
  Q['select']
>;

// type Schema = typeof schema;
// type Collections = CollectionNameFromModels<Schema>;
// type Models = ModelFromModels<Schema, Collections>;
// type Props = Models['properties'];

// type UnionTest = { a: 'fo' } | { a: 'baz'; b: 'bar' };
// type UnionTest2 = ('a' | 'b') | ('a' | 'd');
