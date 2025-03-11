import { describe, test, expectTypeOf } from 'vitest';
import { DB, Schema as S } from '../../src/index.js';
import { EXHAUSTIVE_SCHEMA } from '../utils/exhaustive-schema.js';
import { fakeTx, ExhaustiveSchemaInsert } from './utils.js';

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
    const expectEntityParamInTx = expectTypeOf(tx.insert<'test'>).parameter(1);
    // TODO: properly opt in to optional sets and records
    expectEntityParam.toEqualTypeOf<ExhaustiveSchemaInsert>();
    expectEntityParamInTx.toEqualTypeOf<ExhaustiveSchemaInsert>();
  });
});

describe('schemaless', () => {
  test('collection param is string', () => {
    const db = new DB();
    const tx = fakeTx(db);
    expectTypeOf(db.insert).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(tx.insert).parameter(0).toEqualTypeOf<string>();
  });

  test('entity param is {[x:string]: any }', () => {
    const db = new DB();
    const tx = fakeTx(db);
    expectTypeOf(db.insert).parameter(1).toEqualTypeOf<{ [x: string]: any }>();
    expectTypeOf(tx.insert).parameter(1).toEqualTypeOf<{ [x: string]: any }>();
  });
});
