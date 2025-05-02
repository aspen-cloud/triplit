import { assertType, describe, expectTypeOf, test } from 'vitest';
import { Schema as S } from '../../src/schema/builder.js';
import {
  OrderStatement,
  QueryOrder,
  QueryWhere,
  ValueCursor,
  WhereFilter,
} from '../../src/query/types/index.js';
import { DB } from '../../src/db.js';
import { Models } from '../../src/index.js';

describe('query builder', () => {
  test('select', () => {
    const schema = {
      collections: S.Collections({
        test: {
          schema: S.Schema({
            id: S.Id(),
            attr1: S.String(),
            attr2: S.Boolean(),
            attr3: S.Number(),
            record: S.Record({
              attr1: S.String(),
            }),
            json: S.Json(),
          }),
          relationships: {
            // Not included in select
            subquery: {
              cardinality: 'many',
              query: {
                collectionName: 'test2',
                where: [],
              },
            },
          },
        },
        test2: {
          schema: S.Schema({
            id: S.Id(),
          }),
        },
      }),
    };
    // Schemaful
    {
      const db = new DB({ schema });
      const query = db.query('test');
      expectTypeOf(query.Select)
        .parameter(0)
        .toEqualTypeOf<
          | ReadonlyArray<
              | 'attr1'
              | 'attr2'
              | 'attr3'
              | 'record'
              | 'record.attr1'
              | 'json'
              | `json.${string}`
              | 'id'
            >
          | undefined
        >();
    }
    // schemaless
    {
      const db = new DB();
      const query = db.query('test');
      expectTypeOf(query.Select)
        .parameter(0)
        .toEqualTypeOf<ReadonlyArray<string> | undefined>();
    }
  });
  test('where attribute prop', () => {
    const schema = {
      collections: S.Collections({
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
            attr3: S.Json(),
          }),
          relationships: {
            // should include query
            relationById: S.RelationById('test2', 'test-id'),
          },
        },
        test2: {
          schema: S.Schema({
            id: S.Id(),
          }),
        },
      }),
    };
    {
      const db = new DB({ schema });
      const query = db.query('test');
      expectTypeOf(query.Where).parameter(0).toEqualTypeOf<
        // .Where(undefined)
        | undefined
        // .Where('id, '=', '1')
        | 'id'
        | 'attr1'
        | 'attr1.inner1'
        | 'attr1.inner1.inner1A'
        | 'attr1.inner1.inner1B'
        | 'attr1.inner2'
        | 'attr1.inner2.inner2A'
        | 'attr2'
        | 'attr3'
        | `attr3.${string}`
        | 'relationById.id'
        // .Where(['id', '=', '1'], ['attr1', '=', '1'])
        | WhereFilter<(typeof schema)['collections'], 'test'>
        // .Where([['id', '=', '1'], ['attr1', '=', '1']])
        | QueryWhere<(typeof schema)['collections'], 'test'>
      >();

      // Can handle ternary
      const ternary: boolean = true;
      assertType(query.Where(ternary ? ['id', '=', '1'] : undefined));
    }
    {
      const db = new DB();
      const query = db.query('test');
      type T = typeof query.Where;
      expectTypeOf(query.Where).parameter(0).toEqualTypeOf<
        // .Where(undefined)
        | undefined
        // .Where('id, '=', '1')
        | string
        // .Where(['id', '=', '1'], ['attr1', '=', '1'])
        | WhereFilter<Models, 'test'>
        // .Where([['id', '=', '1'], ['attr1', '=', '1']])
        | QueryWhere<Models, 'test'>
      >();
      // Can handle ternary
      const ternary: boolean = true;
      assertType(query.Where(ternary ? ['id', '=', '1'] : undefined));
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
            attr3: S.Json(),
          }),
          relationships: {
            relationById: S.RelationById('test2', 'test-id'),
          },
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
      expectTypeOf(query.Order)
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
          | 'attr3'
          | `attr3.${string}`
          | 'relationById.id'
          | OrderStatement<(typeof schema)['collections'], 'test'>
          | QueryOrder<(typeof schema)['collections'], 'test'>
        >();
      // Can handle ternary
      const ternary: boolean = true;
      assertType(query.Order(ternary ? ['id', 'ASC'] : undefined));
    }
    {
      const db = new DB();
      const query = db.query('test');
      expectTypeOf(query.Order)
        .parameter(0)
        .toEqualTypeOf<
          | undefined
          | string
          | QueryOrder<Models, 'test'>
          | OrderStatement<Models, 'test'>
        >();
      // Can handle ternary
      const ternary: boolean = true;
      assertType(query.Order(ternary ? ['id', 'ASC'] : undefined));
    }
  });

  test('include', () => {
    const schema = {
      collections: {
        test: {
          schema: S.Schema({
            id: S.Id(),
            attr1: S.String(),
          }),
          relationships: {
            subquery: S.RelationMany('test2', {}),
          },
        },
        test2: {
          schema: S.Schema({
            id: S.Id(),
          }),
        },
      },
    };
    // TODO: test breaking for some reason
    // // Schemaful
    // {
    //   const db = new DB({ schema });
    //   const query = db.query('test');
    //   expectTypeOf(query.Include).parameter(0).toEqualTypeOf<'subquery'>();
    // }
    // schemaless
    {
      const db = new DB();
      const query = db.query('test');
      expectTypeOf(query.Include).parameter(0).toEqualTypeOf<string>();
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
          }),
          relationships: {
            // should not include query
            query: S.RelationMany('test2', {}),
          },
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
      expectTypeOf(query.After).parameter(0).toEqualTypeOf<
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
      expectTypeOf(query.After).parameter(0).toEqualTypeOf<
        | ValueCursor
        // TODO: this is an ugly type, maybe should even drop support for this
        // | FetchResultEntityFromParts<Models, 'test', string, {}>
        | undefined
      >();
    }
  });
});
