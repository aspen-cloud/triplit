import { describe, test, expectTypeOf } from 'vitest';
import { DB, Schema as S } from '../../src/index.js';
import { EXHAUSTIVE_SCHEMA } from '../utils/exhaustive-schema.js';
import { ExhaustiveSchemaSelectAll, Extends, fakeTx } from './utils.js';

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
    expectTypeOf(db.delete).parameter(0).toEqualTypeOf<'a' | 'b' | 'c'>();
    expectTypeOf(tx.delete).parameter(0).toEqualTypeOf<'a' | 'b' | 'c'>();
  });
});

describe('schemaless', () => {
  test('collection param is string', () => {
    const db = new DB();
    const tx = fakeTx(db);
    expectTypeOf(db.delete).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(tx.delete).parameter(0).toEqualTypeOf<string>();
  });
});
