import { expectTypeOf, test, describe, expect } from 'vitest';
import DB, { ModelFromModels } from '../../src/db.js';
import { Schema as S } from '../../src/schema/builder.js';
import {
  CollectionQuery,
  QueryOrder,
  QueryWhere,
  RelationSubquery,
  ValueCursor,
  WhereFilter,
} from '../../src/query.js';
import {
  FetchResult,
  QueryResult,
  ReturnTypeFromQuery,
} from '../../src/collection-query.js';
import { DBTransaction } from '../../src/db-transaction.js';

type TransactionAPI<TxDB extends DB<any>> = TxDB extends DB<infer M>
  ? Parameters<Parameters<DB<M>['transact']>[0]>[0]
  : never;

// Want to figure out the best way to test various data types + operation combos
// Right now im reusing this exhaustive schema (also defined in cli tests)

// TODO: unify structure to either split by schemaful/schemaless or by operation
describe('schemaful', () => {
  test('insert: collection param includes all collections', () => {
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
    expectTypeOf(db.insert).parameter(0).toEqualTypeOf<'a' | 'b' | 'c'>();
    expectTypeOf<TransactionAPI<typeof db>['insert']>()
      .parameter(0)
      .toEqualTypeOf<'a' | 'b' | 'c'>();
  });
  test('insert: entity param properly reads from schema', () => {
    const schema = {
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
            defaultNull: S.String({ default: null }),
            // default functions
            defaultNow: S.String({ default: S.Default.now() }),
            defaultUuid: S.String({ default: S.Default.uuid() }),
            // subqueries
            subquery: S.Query({ collectionName: 'test2' as const, where: [] }),
            // relations
            relationOne: S.RelationOne('test', { where: [] }),
            relationMany: S.RelationMany('test', { where: [] }),
            relationById: S.RelationById('test', 'test-id'),
          }),
        },
      },
    };
    const db = new DB({ schema });
    const expectEntityParam = expectTypeOf(db.insert).parameter(1);
    const expectEntityParamInTx =
      expectTypeOf<TransactionAPI<typeof db>['insert']>().parameter(1);

    expectEntityParam.toHaveProperty('string').toEqualTypeOf<string>();
    expectEntityParamInTx.toHaveProperty('string').toEqualTypeOf<string>();

    expectEntityParam.toHaveProperty('boolean').toEqualTypeOf<boolean>();
    expectEntityParamInTx.toHaveProperty('boolean').toEqualTypeOf<boolean>();

    expectEntityParam.toHaveProperty('number').toEqualTypeOf<number>();
    expectEntityParamInTx.toHaveProperty('number').toEqualTypeOf<number>();

    expectEntityParam.toHaveProperty('date').toEqualTypeOf<Date>();
    expectEntityParamInTx.toHaveProperty('date').toEqualTypeOf<Date>();

    // Sets always have a default so can be undefined
    expectEntityParam
      .toHaveProperty('setString')
      .toEqualTypeOf<Set<string> | undefined>();
    expectEntityParamInTx
      .toHaveProperty('setString')
      .toEqualTypeOf<Set<string> | undefined>();

    expectEntityParam
      .toHaveProperty('setNumber')
      .toEqualTypeOf<Set<number> | undefined>();
    expectEntityParamInTx
      .toHaveProperty('setNumber')
      .toEqualTypeOf<Set<number> | undefined>();

    expectEntityParam
      .toHaveProperty('nullableSet')
      .toEqualTypeOf<Set<string> | null | undefined>();
    expectEntityParamInTx
      .toHaveProperty('nullableSet')
      .toEqualTypeOf<Set<string> | null | undefined>();

    // records always have a default so can be undefined
    expectEntityParam
      .toHaveProperty('record')
      .toEqualTypeOf<
        ({ attr1: string; attr2: string } & { attr3?: string }) | undefined
      >();
    expectEntityParamInTx
      .toHaveProperty('record')
      .toEqualTypeOf<
        ({ attr1: string; attr2: string } & { attr3?: string }) | undefined
      >();

    expectEntityParam
      .toHaveProperty('optional')
      .toEqualTypeOf<string | undefined>();
    expectEntityParamInTx
      .toHaveProperty('optional')
      .toEqualTypeOf<string | undefined>();

    expectEntityParam.toHaveProperty('nullableFalse').toEqualTypeOf<string>();
    expectEntityParamInTx
      .toHaveProperty('nullableFalse')
      .toEqualTypeOf<string>();

    expectEntityParam
      .toHaveProperty('nullableTrue')
      .toEqualTypeOf<string | null>();
    expectEntityParamInTx
      .toHaveProperty('nullableTrue')
      .toEqualTypeOf<string | null>();

    expectEntityParam
      .toHaveProperty('defaultValue')
      .toEqualTypeOf<string | undefined>();
    expectEntityParamInTx
      .toHaveProperty('defaultValue')
      .toEqualTypeOf<string | undefined>();

    expectEntityParam
      .toHaveProperty('defaultNull')
      .toEqualTypeOf<string | undefined>();
    expectEntityParamInTx
      .toHaveProperty('defaultNull')
      .toEqualTypeOf<string | undefined>();

    expectEntityParam
      .toHaveProperty('defaultNow')
      .toEqualTypeOf<string | undefined>();
    expectEntityParamInTx
      .toHaveProperty('defaultNow')
      .toEqualTypeOf<string | undefined>();

    expectEntityParam
      .toHaveProperty('defaultUuid')
      .toEqualTypeOf<string | undefined>();
    expectEntityParamInTx
      .toHaveProperty('defaultUuid')
      .toEqualTypeOf<string | undefined>();

    expectEntityParam.not.toHaveProperty('subquery');
    expectEntityParamInTx.not.toHaveProperty('subquery');

    expectEntityParam.not.toHaveProperty('relationOne');
    expectEntityParamInTx.not.toHaveProperty('relationOne');

    expectEntityParam.not.toHaveProperty('relationMany');
    expectEntityParamInTx.not.toHaveProperty('relationMany');

    expectEntityParam.not.toHaveProperty('relationById');
    expectEntityParamInTx.not.toHaveProperty('relationById');
  });

  test.todo('insert: collection param informs entity param'); // Not sure how to test this, but collectionName should narrow the type of entity param

  test('update: collection param includes all collections', () => {
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
    expectTypeOf(db.update).parameter(0).toEqualTypeOf<'a' | 'b' | 'c'>();
    expectTypeOf<TransactionAPI<typeof db>['update']>()
      .parameter(0)
      .toEqualTypeOf<'a' | 'b' | 'c'>();
  });
  test('update: entity param in updater properly reads proxy values from schema', () => {
    const schema = {
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
            nullableSet: S.Set(S.String(), { nullable: true }),
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
            defaultNull: S.String({ default: null }),
            // default functions
            defaultNow: S.String({ default: S.Default.now() }),
            defaultUuid: S.String({ default: S.Default.uuid() }),
            // subqueries
            subquery: S.Query({ collectionName: 'test2' as const, where: [] }),
            // relations
            relationOne: S.RelationOne('test', { where: [] }),
            relationMany: S.RelationMany('test', { where: [] }),
            relationById: S.RelationById('test', 'test-id'),
          }),
        },
      },
    };
    const db = new DB({ schema });
    const expectEntityProxyParam = expectTypeOf(db.update)
      .parameter(2)
      .parameter(0);
    const expectEntityProxyParamInTx = expectTypeOf<
      TransactionAPI<typeof db>['update']
    >()
      .parameter(2)
      .parameter(0);

    expectEntityProxyParam.toHaveProperty('string').toEqualTypeOf<string>();
    expectEntityProxyParamInTx.toHaveProperty('string').toEqualTypeOf<string>();
    expectEntityProxyParam.toHaveProperty('boolean').toEqualTypeOf<boolean>();
    expectEntityProxyParamInTx
      .toHaveProperty('boolean')
      .toEqualTypeOf<boolean>();
    expectEntityProxyParam.toHaveProperty('number').toEqualTypeOf<number>();
    expectEntityProxyParamInTx.toHaveProperty('number').toEqualTypeOf<number>();
    expectEntityProxyParam.toHaveProperty('date').toEqualTypeOf<Date>();
    expectEntityProxyParamInTx.toHaveProperty('date').toEqualTypeOf<Date>();

    expectEntityProxyParam
      .toHaveProperty('setString')
      .toEqualTypeOf<Set<string>>();
    expectEntityProxyParamInTx
      .toHaveProperty('setString')
      .toEqualTypeOf<Set<string>>();

    expectEntityProxyParam
      .toHaveProperty('setNumber')
      .toEqualTypeOf<Set<number>>();
    expectEntityProxyParamInTx
      .toHaveProperty('setNumber')
      .toEqualTypeOf<Set<number>>();

    expectEntityProxyParam
      .toHaveProperty('nullableSet')
      .toEqualTypeOf<Set<string> | null>();
    expectEntityProxyParamInTx
      .toHaveProperty('nullableSet')
      .toEqualTypeOf<Set<string> | null>();

    expectEntityProxyParam
      .toHaveProperty('record')
      .toEqualTypeOf<{ attr1: string; attr2: string } & { attr3?: string }>();
    expectEntityProxyParamInTx
      .toHaveProperty('record')
      .toEqualTypeOf<{ attr1: string; attr2: string } & { attr3?: string }>();

    expectEntityProxyParam
      .toHaveProperty('optional')
      .toEqualTypeOf<string | undefined>();

    expectEntityProxyParamInTx
      .toHaveProperty('optional')
      .toEqualTypeOf<string | undefined>();

    expectEntityProxyParam
      .toHaveProperty('nullableFalse')
      .toEqualTypeOf<string>();
    expectEntityProxyParamInTx
      .toHaveProperty('nullableFalse')
      .toEqualTypeOf<string>();
    expectEntityProxyParam
      .toHaveProperty('nullableTrue')
      .toEqualTypeOf<string | null>();
    expectEntityProxyParamInTx
      .toHaveProperty('nullableTrue')
      .toEqualTypeOf<string | null>();
    expectEntityProxyParam
      .toHaveProperty('defaultValue')
      .toEqualTypeOf<string>();
    expectEntityProxyParamInTx
      .toHaveProperty('defaultValue')
      .toEqualTypeOf<string>();
    expectEntityProxyParam
      .toHaveProperty('defaultNull')
      .toEqualTypeOf<string>();
    expectEntityProxyParamInTx
      .toHaveProperty('defaultNull')
      .toEqualTypeOf<string>();
    expectEntityProxyParam.toHaveProperty('defaultNow').toEqualTypeOf<string>();
    expectEntityProxyParamInTx
      .toHaveProperty('defaultNow')
      .toEqualTypeOf<string>();
    expectEntityProxyParam
      .toHaveProperty('defaultUuid')
      .toEqualTypeOf<string>();
    expectEntityProxyParamInTx
      .toHaveProperty('defaultUuid')
      .toEqualTypeOf<string>();
    expectEntityProxyParam.toMatchTypeOf<{ readonly id: string }>();
    expectEntityProxyParamInTx.toMatchTypeOf<{ readonly id: string }>();
    expectEntityProxyParam.not.toHaveProperty('subquery');
    expectEntityProxyParamInTx.not.toHaveProperty('subquery');
    expectEntityProxyParam.not.toHaveProperty('relationOne');
    expectEntityProxyParamInTx.not.toHaveProperty('relationOne');
    expectEntityProxyParam.not.toHaveProperty('relationMany');
    expectEntityProxyParamInTx.not.toHaveProperty('relationMany');
    expectEntityProxyParam.not.toHaveProperty('relationById');
    expectEntityProxyParamInTx.not.toHaveProperty('relationById');
  });

  test('fetch: returns a map of properly typed entities', async () => {
    const schema = {
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
            nullableSet: S.Set(S.String(), { nullable: true }),
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
            defaultNull: S.String({ default: null }),
            // default functions
            defaultNow: S.String({ default: S.Default.now() }),
            defaultUuid: S.String({ default: S.Default.uuid() }),
            // subqueries
            subquery: S.RelationMany('test2', {
              where: [],
            }),
            // relations
            relationOne: S.RelationOne('test', { where: [] }),
            relationMany: S.RelationMany('test', { where: [] }),
            relationById: S.RelationById('test', 'test-id'),
          }),
        },
        test2: {
          schema: S.Schema({
            id: S.Id(),
          }),
        },
      },
    };
    const db = new DB({ schema });
    const query = db.query('test').build();
    const result = await db.fetch(query);
    expectTypeOf(result).toEqualTypeOf<
      Map<
        string,
        {
          id: string;
          string: string;
          boolean: boolean;
          number: number;
          date: Date;
          setString: Set<string>;
          setNumber: Set<number>;
          nullableSet: Set<string> | null;
          record: { attr1: string; attr2: string } & { attr3?: string };
          optional: string | undefined;
          nullableFalse: string;
          nullableTrue: string | null;
          defaultValue: string;
          defaultNull: string;
          defaultNow: string;
          defaultUuid: string;
          subquery: QueryResult<
            CollectionQuery<typeof schema.collections, 'test2'>,
            'many'
          >;
          relationOne: QueryResult<
            CollectionQuery<typeof schema.collections, 'test'>,
            'one'
          >;
          relationMany: QueryResult<
            CollectionQuery<typeof schema.collections, 'test'>,
            'many'
          >;
          relationById: QueryResult<
            CollectionQuery<typeof schema.collections, 'test'>,
            'one'
          >;
        }
      >
    >();
    expectTypeOf(result.get('a')!.subquery.get('a')!).toEqualTypeOf<{
      id: string;
    }>();
  });
});

describe('schemaless', () => {
  test('insert: collection param is string', () => {
    const db = new DB();
    expectTypeOf(db.insert).parameter(0).toEqualTypeOf<string>();
    expectTypeOf<TransactionAPI<typeof db>['insert']>()
      .parameter(0)
      .toEqualTypeOf<string>();
  });
  test('insert: entity param is any', () => {
    const db = new DB();
    expectTypeOf(db.insert).parameter(1).toEqualTypeOf<any>();
    expectTypeOf<TransactionAPI<typeof db>['insert']>()
      .parameter(1)
      .toEqualTypeOf<any>();
  });

  test('update: collection param is string', () => {
    const db = new DB();
    expectTypeOf(db.update).parameter(0).toEqualTypeOf<string>();
    expectTypeOf<TransactionAPI<typeof db>['update']>()
      .parameter(0)
      .toEqualTypeOf<string>();
  });
  test('update: entity param in updater is any', () => {
    const db = new DB();
    expectTypeOf(db.update).parameter(2).parameter(0).toEqualTypeOf<any>();
    expectTypeOf<TransactionAPI<typeof db>['update']>()
      .parameter(2)
      .parameter(0)
      .toEqualTypeOf<any>();
  });

  test('fetch: returns a Map<string, any>', () => {
    const db = new DB();
    const query = db.query('test').build();
    expectTypeOf(db.fetch(query)).resolves.toEqualTypeOf<Map<string, any>>();
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
          | (
              | 'attr1'
              | 'attr2'
              | 'attr3'
              | 'record'
              | 'record.attr1'
              | 'id'
              | RelationSubquery<typeof schema.collections>
            )[]
          | undefined
        >();
    }
    // schemaless
    {
      const db = new DB();
      const query = db.query('test');
      expectTypeOf(query.select)
        .parameter(0)
        .toEqualTypeOf<(string | RelationSubquery<undefined>)[] | undefined>();
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
        .toMatchTypeOf<
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
        .toMatchTypeOf<
          | undefined
          | string
          | WhereFilter<undefined, any>
          | QueryWhere<undefined, any>
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
        .toMatchTypeOf<
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
        .toMatchTypeOf<
          string | QueryOrder<undefined, any> | QueryOrder<undefined, any>[]
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
        .toMatchTypeOf<
          | ValueCursor
          | ReturnTypeFromQuery<typeof schema.collections, 'test'>
          | undefined
        >();
    }
    {
      const db = new DB();
      const query = db.query('test');
      expectTypeOf(query.after)
        .parameter(0)
        .toMatchTypeOf<ValueCursor | undefined>();
    }
  });
});

type MapKey<M> = M extends Map<infer K, any> ? K : never;
type MapValue<M> = M extends Map<any, infer V> ? V : never;

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

  test('fetch', () => {
    // Schemaful
    {
      const db = new DB({ schema });
      const query = db.query('test').build();
      {
        const res = db.fetch(query);
        expectTypeOf(res).resolves.toEqualTypeOf<
          Map<
            string,
            {
              id: string;
              attr1: string;
              attr2: boolean;
              attr3: number;
              subquery: QueryResult<
                CollectionQuery<typeof schema.collections, 'test2'>,
                'many'
              >;
            }
          >
        >();
      }

      {
        let tx: DBTransaction<typeof schema.collections>;
        const res = tx!.fetch(query);
        expectTypeOf(res).resolves.toEqualTypeOf<
          Map<
            string,
            {
              id: string;
              attr1: string;
              attr2: boolean;
              attr3: number;
              subquery: QueryResult<
                CollectionQuery<typeof schema.collections, 'test2'>,
                'many'
              >;
            }
          >
        >();
      }
    }
    // schemaless
    {
      const db = new DB();
      const query = db.query('test').build();

      {
        const res = db.fetch(query);
        expectTypeOf(res).resolves.toEqualTypeOf<Map<string, any>>();
      }

      {
        let tx: DBTransaction<undefined>;
        const res = tx!.fetch(query);
        expectTypeOf(res).resolves.toEqualTypeOf<Map<string, any>>();
      }
    }
  });

  test('fetchById', () => {
    // Schemaful
    {
      const db = new DB({ schema });

      {
        const res = db.fetchById('test', 'id');
        expectTypeOf(res).resolves.toEqualTypeOf<{
          id: string;
          attr1: string;
          attr2: boolean;
          attr3: number;
          subquery: QueryResult<
            CollectionQuery<typeof schema.collections, 'test2'>,
            'many'
          >;
        } | null>();
      }

      {
        let tx: DBTransaction<typeof schema.collections>;
        const res = tx!.fetchById('test', 'id');
        expectTypeOf(res).resolves.toEqualTypeOf<{
          id: string;
          attr1: string;
          attr2: boolean;
          attr3: number;
          subquery: QueryResult<
            CollectionQuery<typeof schema.collections, 'test2'>,
            'many'
          >;
        } | null>();
      }
    }
    // schemaless
    {
      const db = new DB();
      {
        const res = db.fetchById('test', 'id');
        expectTypeOf(res).resolves.toBeAny();
      }
      {
        let tx: DBTransaction<undefined>;
        const res = tx!.fetchById('test', 'id');
        expectTypeOf(res).resolves.toBeAny();
      }
    }
  });

  test('fetchOne', () => {
    // Schemaful
    {
      const db = new DB({ schema });
      const query = db.query('test').build();
      {
        const res = db.fetchOne(query);
        expectTypeOf(res).resolves.toEqualTypeOf<{
          id: string;
          attr1: string;
          attr2: boolean;
          attr3: number;
          subquery: QueryResult<
            CollectionQuery<typeof schema.collections, 'test2'>,
            'many'
          >;
        } | null>();
      }

      {
        let tx: DBTransaction<typeof schema.collections>;
        const res = tx!.fetchOne(query);
        expectTypeOf(res).resolves.toEqualTypeOf<{
          id: string;
          attr1: string;
          attr2: boolean;
          attr3: number;
          subquery: QueryResult<
            CollectionQuery<typeof schema.collections, 'test2'>,
            'many'
          >;
        } | null>();
      }
    }
    // schemaless
    {
      const db = new DB();
      const query = db.query('test').build();

      {
        const res = db.fetchOne(query);
        expectTypeOf(res).resolves.toBeAny();
      }

      {
        let tx: DBTransaction<undefined>;
        const res = tx!.fetchOne(query);
        expectTypeOf(res).resolves.toBeAny();
      }
    }
  });
});
