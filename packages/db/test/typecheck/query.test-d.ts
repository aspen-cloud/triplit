import { expectTypeOf, test, describe, expect } from 'vitest';
import DB, { ModelFromModels } from '../../src/db.js';
import { Models } from '../../src/schema/types';
import { Schema as S } from '../../src/schema/builder.js';
import {
  CollectionQuery,
  QueryOrder,
  QueryWhere,
  ValueCursor,
  WhereFilter,
} from '../../src/query.js';
import { DBTransaction } from '../../src/db-transaction.js';
import {
  CollectionQueryDefault,
  FetchResultEntity,
} from '../../src/query/types';

function fakeTx<M extends Models<any, any> | undefined>(
  db: DB<M>
): DBTransaction<M> {
  return {} as DBTransaction<M>;
}

type MapKey<M> = M extends Map<infer K, any> ? K : never;
type MapValue<M> = M extends Map<any, infer V> ? V : never;

// Want to figure out the best way to test various data types + operation combos
// Right now im reusing this exhaustive schema (also defined in cli tests)
const EXHAUSTIVE_SCHEMA = {
  collections: {
    test: {
      schema: S.Schema({
        id: S.Id(),
        // value types
        string: S.String(),
        boolean: S.Boolean(),
        number: S.Number(),
        date: S.Date(),
        // set type
        setString: S.Set(S.String()),
        setNumber: S.Set(S.Number()),
        nullableSet: S.Set(S.String(), {
          nullable: true,
        }),
        // record type
        record: S.Record({
          attr1: S.String(),
          attr2: S.String(),
          attr3: S.Optional(S.String()),
        }),
        // optional
        optional: S.Optional(S.String()),
        // nullable
        nullableFalse: S.String({ nullable: false }),
        nullableTrue: S.String({ nullable: true }),
        // default values
        defaultValue: S.String({ default: 'default' }),
        defaultNull: S.String({ default: null, nullable: true }),
        // default functions
        defaultNow: S.String({ default: S.Default.now() }),
        defaultUuid: S.String({ default: S.Default.uuid() }),
        // subqueries
        subquery: S.Query({ collectionName: 'test2' as const, where: [] }),
        // relations
        relationOne: S.RelationOne('test2', { where: [] }),
        relationMany: S.RelationMany('test2', { where: [] }),
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

// TODO: unify structure to either split by schemaful/schemaless or by operation

describe('insert', () => {
  describe('schemaful', () => {
    test('collection param includes all collections', () => {
      const schema = {
        collections: {
          a: {
            schema: S.Schema({
              id: S.Id(),
              attr: S.String(),
            }),
          },
          b: {
            schema: S.Schema({
              id: S.Id(),
              attr: S.String(),
            }),
          },
          c: {
            schema: S.Schema({
              id: S.Id(),
              attr: S.String(),
            }),
          },
        },
      };
      const db = new DB({ schema });
      const tx = fakeTx(db);

      expectTypeOf(db.insert).parameter(0).toEqualTypeOf<'a' | 'b' | 'c'>();
      expectTypeOf(tx.insert).parameter(0).toEqualTypeOf<'a' | 'b' | 'c'>();
    });

    test('entity param properly reads from schema', () => {
      const db = new DB({ schema: EXHAUSTIVE_SCHEMA });
      const tx = fakeTx(db);
      const expectEntityParam = expectTypeOf(db.insert<'test'>).parameter(1);
      const expectEntityParamInTx = expectTypeOf(tx.insert<'test'>).parameter(
        1
      );

      // TODO: properly opt in to optional sets and records
      expectEntityParam.toEqualTypeOf<{
        id?: string;
        string: string;
        boolean: boolean;
        number: number;
        date: Date;
        setString?: Set<string>;
        setNumber?: Set<number>;
        nullableSet?: Set<string> | null;
        record?: { attr1: string; attr2: string; attr3?: string };
        optional?: string;
        nullableFalse: string;
        nullableTrue: string | null;
        defaultValue?: string;
        defaultNull?: string | null;
        defaultNow?: string;
        defaultUuid?: string;
      }>();

      expectEntityParamInTx.toEqualTypeOf<{
        id?: string;
        string: string;
        boolean: boolean;
        number: number;
        date: Date;
        setString?: Set<string>;
        setNumber?: Set<number>;
        nullableSet?: Set<string> | null;
        record?: { attr1: string; attr2: string; attr3?: string };
        optional?: string;
        nullableFalse: string;
        nullableTrue: string | null;
        defaultValue?: string;
        defaultNull?: string | null;
        defaultNow?: string;
        defaultUuid?: string;
      }>();
    });
  });

  describe('schemaless', () => {
    test('collection param is string', () => {
      const db = new DB();
      const tx = fakeTx(db);
      expectTypeOf(db.insert).parameter(0).toEqualTypeOf<string>();
      expectTypeOf(tx.insert).parameter(0).toEqualTypeOf<string>();
    });

    test('entity param is any', () => {
      const db = new DB();
      const tx = fakeTx(db);
      expectTypeOf(db.insert).parameter(1).toEqualTypeOf<any>();
      expectTypeOf(tx.insert).parameter(1).toEqualTypeOf<any>();
    });
  });
});

describe('update', () => {
  describe('schemaful', () => {
    test('collection param includes all collections', () => {
      const schema = {
        collections: {
          a: {
            schema: S.Schema({
              id: S.Id(),
              attr: S.String(),
            }),
          },
          b: {
            schema: S.Schema({
              id: S.Id(),
              attr: S.String(),
            }),
          },
          c: {
            schema: S.Schema({
              id: S.Id(),
              attr: S.String(),
            }),
          },
        },
      };
      const db = new DB({ schema });
      const tx = fakeTx(db);
      expectTypeOf(db.update).parameter(0).toEqualTypeOf<'a' | 'b' | 'c'>();
      expectTypeOf(tx.update).parameter(0).toEqualTypeOf<'a' | 'b' | 'c'>();
    });

    test('entity param in updater properly reads proxy values from schema', () => {
      const db = new DB({ schema: EXHAUSTIVE_SCHEMA });
      const tx = fakeTx(db);
      const expectEntityProxyParam = expectTypeOf(db.update)
        .parameter(2)
        .parameter(0);
      const expectEntityProxyParamInTx = expectTypeOf(tx.update)
        .parameter(2)
        .parameter(0);

      // TODO: get rid of this weird | { readonly id: string }
      expectEntityProxyParam.toEqualTypeOf<
        | { readonly id: string }
        | {
            readonly id: string;
            string: string;
            boolean: boolean;
            number: number;
            date: Date;
            setString: Set<string>;
            setNumber: Set<number>;
            nullableSet: Set<string> | null;
            record: { attr1: string; attr2: string; attr3?: string };
            optional?: string;
            nullableFalse: string;
            nullableTrue: string | null;
            defaultValue: string;
            defaultNull: string | null;
            defaultNow: string;
            defaultUuid: string;
          }
      >();

      expectEntityProxyParamInTx.toEqualTypeOf<
        | { readonly id: string }
        | {
            readonly id: string;
            string: string;
            boolean: boolean;
            number: number;
            date: Date;
            setString: Set<string>;
            setNumber: Set<number>;
            nullableSet: Set<string> | null;
            record: { attr1: string; attr2: string; attr3?: string };
            optional?: string;
            nullableFalse: string;
            nullableTrue: string | null;
            defaultValue: string;
            defaultNull: string | null;
            defaultNow: string;
            defaultUuid: string;
          }
      >();
    });
  });

  describe('schemaless', () => {
    test('collection param is string', () => {
      const db = new DB();
      const tx = fakeTx(db);
      expectTypeOf(db.update).parameter(0).toEqualTypeOf<string>();
      expectTypeOf(tx.update).parameter(0).toEqualTypeOf<string>();
    });

    test('entity param in updater is any', () => {
      const db = new DB();
      const tx = fakeTx(db);
      expectTypeOf(db.update).parameter(2).parameter(0).toEqualTypeOf<any>();
      expectTypeOf(tx.update).parameter(2).parameter(0).toEqualTypeOf<any>();
    });
  });
});

describe('fetch', () => {
  describe('schemaful', () => {
    test('without select returns all fields on the entity', async () => {
      const db = new DB({ schema: EXHAUSTIVE_SCHEMA });
      const tx = fakeTx(db);
      const query = db.query('test').build();
      const result = await db.fetch(query);
      expectTypeOf<MapValue<typeof result>>().toEqualTypeOf<{
        id: string;
        string: string;
        boolean: boolean;
        number: number;
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
      expectTypeOf<MapValue<typeof txResult>>().toEqualTypeOf<{
        id: string;
        string: string;
        boolean: boolean;
        number: number;
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
      expectTypeOf<MapValue<typeof result>>().toEqualTypeOf<{
        id: string;
        string: string;
        number: number;
      }>();

      const txResult = await tx.fetch(query);
      expectTypeOf<MapValue<typeof txResult>>().toEqualTypeOf<{
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
        expectTypeOf<MapValue<typeof result>>().toEqualTypeOf<{
          id: string;
          record: { attr1: string; attr2: string; attr3?: string };
        }>();
      }
      {
        const result = await tx.fetch(query);
        expectTypeOf<MapValue<typeof result>>().toEqualTypeOf<{
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
        expectTypeOf<MapValue<typeof result>>().toEqualTypeOf<{
          id: string;
          record: { attr1: string; attr3: string | undefined };
        }>();
      }
      {
        const result = await tx.fetch(query2);
        expectTypeOf<MapValue<typeof result>>().toEqualTypeOf<{
          id: string;
          record: { attr1: string; attr3: string | undefined };
        }>();
      }
    });

    // TODO: fix types for subqueries
    test('can include relationships', async () => {
      const db = new DB({ schema: EXHAUSTIVE_SCHEMA });
      const tx = fakeTx(db);
      const query = db
        .query('test')
        .select([])
        .include('relationOne')
        .include('relationMany')
        .include('relationById')
        .include('random', {
          subquery: { collectionName: 'test2', where: [] },
          cardinality: 'many',
        })
        .build();

      {
        const result = await db.fetch(query);
        expectTypeOf<MapValue<typeof result>>().toEqualTypeOf<{
          relationOne: { id: string } | null;
          relationMany: Map<string, { id: string }>;
          relationById: { id: string } | null;
          // random: Map<string, { id: string }>;
          random: any;
        }>;
      }
      {
        const result = await tx.fetch(query);
        expectTypeOf<MapValue<typeof result>>().toEqualTypeOf<{
          relationOne: { id: string } | null;
          relationMany: Map<string, { id: string }>;
          relationById: { id: string } | null;
          // random: Map<string, { id: string }>;
          random: any;
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
        expectTypeOf<MapValue<typeof result>>().toEqualTypeOf<{
          id: string;
          relationOne: { id: string } | null;
        }>();
      }
      {
        const result = await tx.fetch(query);
        expectTypeOf<MapValue<typeof result>>().toEqualTypeOf<{
          id: string;
          relationOne: { id: string } | null;
        }>();
      }
    });
  });

  describe('schemaless', () => {
    test('returns a Map<string, any>', async () => {
      const db = new DB();
      const tx = fakeTx(db);
      const query = db.query('test').build();

      {
        const result = await db.fetch(query);
        expectTypeOf(result).toEqualTypeOf<Map<string, any>>();
      }

      {
        const result = await tx.fetch(query);
        expectTypeOf(result).toEqualTypeOf<Map<string, any>>();
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
          relationOne: { id: string } | null;
        } | null>();
      }

      {
        const result = await tx.fetchOne(query);
        expectTypeOf(result).toEqualTypeOf<{
          id: string;
          string: string;
          number: number;
          relationOne: { id: string } | null;
        } | null>();
      }
    });
  });

  describe('schemaless', () => {
    test('returns any', async () => {
      const db = new DB();
      const tx = fakeTx(db);
      const query = db.query('test').build();

      {
        const result = await db.fetchOne(query);
        expectTypeOf(result).toEqualTypeOf<any>();
      }

      {
        const result = await tx.fetchOne(query);
        expectTypeOf(result).toEqualTypeOf<any>();
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
    test('returns any', async () => {
      const db = new DB();
      const tx = fakeTx(db);

      {
        const result = await db.fetchById('test', '1');
        expectTypeOf(result).toEqualTypeOf<any>();
      }

      {
        const result = await tx.fetchById('test', '1');
        expectTypeOf(result).toEqualTypeOf<any>();
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
          | ('attr1' | 'attr2' | 'attr3' | 'record' | 'record.attr1' | 'id')[]
          | undefined
        >();
    }
    // schemaless
    {
      const db = new DB();
      const query = db.query('test');
      expectTypeOf(query.select)
        .parameter(0)
        .toEqualTypeOf<string[] | undefined>();
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
            query: S.Query({ collectionName: 'test2' as const, where: [] }),
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
          | undefined
          | string
          | WhereFilter<undefined, 'test'>
          | QueryWhere<undefined, 'test'>
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
          | QueryOrder<(typeof schema)['collections'], 'test'>
          | QueryOrder<(typeof schema)['collections'], 'test'>[]
        >();
    }
    {
      const db = new DB();
      const query = db.query('test');
      expectTypeOf(query.order)
        .parameter(0)
        .toEqualTypeOf<
          | string
          | QueryOrder<undefined, 'test'>
          | QueryOrder<undefined, 'test'>[]
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
      expectTypeOf(query.after)
        .parameter(0)
        .toEqualTypeOf<
          | ValueCursor
          | FetchResultEntity<
              CollectionQueryDefault<typeof schema.collections, 'test'>
            >
          | undefined
        >();
    }
    {
      const db = new DB();
      const query = db.query('test');
      expectTypeOf(query.after)
        .parameter(0)
        .toEqualTypeOf<ValueCursor | undefined>();
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
