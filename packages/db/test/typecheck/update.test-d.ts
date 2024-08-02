import { describe, test, expectTypeOf } from 'vitest';
import DB, { Schema as S } from '../../src/index.js';
import { EXHAUSTIVE_SCHEMA } from '../utils/exhaustive-schema.js';
import { fakeTx } from './utils.js';

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
    db.update('test', 'id', (entity) => {
      expectTypeOf(entity).toEqualTypeOf<{
        readonly id: string;
        string: string;
        boolean: boolean;
        number: number;
        enumString: 'a' | 'b' | 'c';
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
      }>();
    });

    tx.update('test', 'id', (entity) => {
      expectTypeOf(entity).toEqualTypeOf<{
        readonly id: string;
        string: string;
        boolean: boolean;
        number: number;
        enumString: 'a' | 'b' | 'c';
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
      }>();
    });
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
