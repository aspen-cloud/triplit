import { expectTypeOf, test, describe } from 'vitest';
import DB from '../../src/db.js';
import { Schema as S, SetProxy } from '../../src/schema.js';

// Want to figure out the best way to test various data types + operation combos
// Right now im reusing this exhaustive schema (also defined in cli tests)

describe('schemaful', () => {
  test('insert: collection param includes all collections', () => {
    const schema = {
      collections: {
        a: {
          schema: S.Schema({
            attr: S.String(),
          }),
        },
        b: {
          schema: S.Schema({
            attr: S.String(),
          }),
        },
        c: {
          schema: S.Schema({
            attr: S.String(),
          }),
        },
      },
    };
    const db = new DB({ schema });
    expectTypeOf(db.insert).parameter(0).toEqualTypeOf<'a' | 'b' | 'c'>();
  });
  test('insert: entity param properly reads from schema', () => {
    const schema = {
      collections: {
        test: {
          schema: S.Schema({
            // value types
            string: S.String(),
            boolean: S.Boolean(),
            number: S.Number(),
            date: S.Date(),
            // set type
            set: S.Set(S.String()),
            // record type
            record: S.Record({
              attr1: S.String(),
              attr2: S.String(),
            }),
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
            subquery: S.Query({ collectionName: 'test2', where: [] }),
          }),
        },
      },
    };
    const db = new DB({ schema });
    const expectEntityParam = expectTypeOf(db.insert).parameter(1);

    expectEntityParam.toHaveProperty('string').toEqualTypeOf<string>();

    expectEntityParam.toHaveProperty('boolean').toEqualTypeOf<boolean>();

    expectEntityParam.toHaveProperty('number').toEqualTypeOf<number>();

    expectEntityParam.toHaveProperty('date').toEqualTypeOf<Date>();

    // Sets always have a default so can be undefined
    expectEntityParam
      .toHaveProperty('set')
      .toEqualTypeOf<Set<string> | undefined>();

    // records always have a default so can be undefined
    expectEntityParam
      .toHaveProperty('record')
      .toEqualTypeOf<{ attr1: string; attr2: string } | undefined>();

    expectEntityParam.toHaveProperty('nullableFalse').toEqualTypeOf<string>();

    expectEntityParam
      .toHaveProperty('nullableTrue')
      .toEqualTypeOf<string | null>();

    expectEntityParam
      .toHaveProperty('defaultValue')
      .toEqualTypeOf<string | undefined>();

    expectEntityParam
      .toHaveProperty('defaultNull')
      .toEqualTypeOf<string | undefined>();

    expectEntityParam
      .toHaveProperty('defaultNow')
      .toEqualTypeOf<string | undefined>();

    expectEntityParam
      .toHaveProperty('defaultUuid')
      .toEqualTypeOf<string | undefined>();

    expectEntityParam.not.toHaveProperty('subquery');
  });
  test.todo('insert: collection param informs entity param'); // Not sure how to test this, but collectionName should narrow the type of entity param

  test('update: collection param includes all collections', () => {
    const schema = {
      collections: {
        a: {
          schema: S.Schema({
            attr: S.String(),
          }),
        },
        b: {
          schema: S.Schema({
            attr: S.String(),
          }),
        },
        c: {
          schema: S.Schema({
            attr: S.String(),
          }),
        },
      },
    };
    const db = new DB({ schema });
    expectTypeOf(db.update).parameter(0).toEqualTypeOf<'a' | 'b' | 'c'>();
  });
  test('update: entity param in updater properly reads proxy values from schema', () => {
    const schema = {
      collections: {
        test: {
          schema: S.Schema({
            // value types
            string: S.String(),
            boolean: S.Boolean(),
            number: S.Number(),
            date: S.Date(),
            // set type
            set: S.Set(S.String()),
            // record type
            record: S.Record({
              attr1: S.String(),
              attr2: S.String(),
            }),
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
            subquery: S.Query({ collectionName: 'test2', where: [] }),
          }),
        },
      },
    };
    const db = new DB({ schema });
    const expectEntityProxyParam = expectTypeOf(db.update)
      .parameter(2)
      .parameter(0);

    expectEntityProxyParam.toHaveProperty('string').toEqualTypeOf<string>();
    expectEntityProxyParam.toHaveProperty('boolean').toEqualTypeOf<boolean>();
    expectEntityProxyParam.toHaveProperty('number').toEqualTypeOf<number>();
    expectEntityProxyParam.toHaveProperty('date').toEqualTypeOf<Date>();

    expectEntityProxyParam
      .toHaveProperty('set')
      .toEqualTypeOf<SetProxy<string>>();

    expectEntityProxyParam
      .toHaveProperty('record')
      .toEqualTypeOf<{ attr1: string; attr2: string }>();

    expectEntityProxyParam
      .toHaveProperty('nullableFalse')
      .toEqualTypeOf<string>();
    expectEntityProxyParam
      .toHaveProperty('nullableTrue')
      .toEqualTypeOf<string | null>();
    expectEntityProxyParam
      .toHaveProperty('defaultValue')
      .toEqualTypeOf<string>();
    expectEntityProxyParam
      .toHaveProperty('defaultNull')
      .toEqualTypeOf<string>();
    expectEntityProxyParam.toHaveProperty('defaultNow').toEqualTypeOf<string>();
    expectEntityProxyParam
      .toHaveProperty('defaultUuid')
      .toEqualTypeOf<string>();

    expectEntityProxyParam.not.toHaveProperty('subquery');
  });

  test('fetch: returns a map of properly typed entities', () => {
    const schema = {
      collections: {
        test: {
          schema: S.Schema({
            // value types
            string: S.String(),
            boolean: S.Boolean(),
            number: S.Number(),
            date: S.Date(),
            // set type
            set: S.Set(S.String()),
            // record type
            record: S.Record({
              attr1: S.String(),
              attr2: S.String(),
            }),
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
            subquery: S.Query({ collectionName: 'test2', where: [] }),
          }),
        },
      },
    };
    const db = new DB({ schema });
    const query = db.query('test').build();
    expectTypeOf(db.fetch(query)).resolves.toEqualTypeOf<
      Map<
        string,
        {
          string: string;
          boolean: boolean;
          number: number;
          date: Date;
          set: Set<string>;
          record: { attr1: string; attr2: string };
          nullableFalse: string;
          nullableTrue: string | null;
          defaultValue: string;
          defaultNull: string;
          defaultNow: string;
          defaultUuid: string;
        }
      >
    >();
  });
});

describe('schemaless', () => {
  test('insert: collection param is string', () => {
    const db = new DB();
    expectTypeOf(db.insert).parameter(0).toEqualTypeOf<string>();
  });
  test('insert: entity param is any', () => {
    const db = new DB();
    expectTypeOf(db.insert).parameter(1).toEqualTypeOf<any>();
  });

  test('update: collection param is string', () => {
    const db = new DB();
    expectTypeOf(db.update).parameter(0).toEqualTypeOf<string>();
  });
  test('update: entity param in updater is any', () => {
    const db = new DB();
    expectTypeOf(db.update).parameter(2).parameter(0).toEqualTypeOf<any>();
  });

  test('fetch: returns a Map<string, any>', () => {
    const db = new DB();
    const query = db.query('test').build();
    expectTypeOf(db.fetch(query)).resolves.toEqualTypeOf<Map<string, any>>();
  });
});
